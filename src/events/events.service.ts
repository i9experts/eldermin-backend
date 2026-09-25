import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { Event, EventDocument } from './schemas/event.schema';
import { TicketType, TicketTypeDocument } from './schemas/ticket-type.schema';
import { PromoCode, PromoCodeDocument } from './schemas/promo-code.schema';
import { Order, OrderDocument } from './schemas/order.schema';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { SeatMap, SeatMapDocument } from './schemas/seat-map.schema';
import { MerchItem, MerchItemDocument } from './schemas/merch-item.schema';
import { PdfService } from '../pdf/pdf.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../email/whatsapp.service';

const ACTIVE_TICKET_STATUSES = ['reserved', 'valid', 'checked_in'];

@Injectable()
export class EventsService {
  private logger = new Logger('EventsService');

  constructor(
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(TicketType.name) private ticketTypeModel: Model<TicketTypeDocument>,
    @InjectModel(PromoCode.name) private promoCodeModel: Model<PromoCodeDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(SeatMap.name) private seatMapModel: Model<SeatMapDocument>,
    @InjectModel(MerchItem.name) private merchItemModel: Model<MerchItemDocument>,
    private pdfService: PdfService,
    private emailService: EmailService,
    private whatsAppService: WhatsAppService,
  ) {}

  private slugify(title: string): string {
    return title.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || 'event';
  }

  // ─── Events (admin) ─────────────────────────────────────────────────────

  // Phase 3 — a school running several events (Sports Day, Annual Day,
  // PTM...) can easily double-book the same hall/ground without anyone
  // noticing until both admins show up. Matches purely on venueName
  // (trimmed, case-insensitive) since venue is free text here, not a
  // Campus/room entity - a typo'd venue name just won't be caught, which
  // is a real but narrower gap than not checking at all. Never blocks
  // saving (a school may genuinely want two small things in the same hall
  // back-to-back) - just returns what it found so the UI can warn.
  private async checkVenueConflicts(schoolSlug: string, venueName: string | undefined, sessions: any[], excludeEventId?: string) {
    const venue = venueName?.trim();
    if (!venue || !sessions?.length) return [];

    const candidates = await this.eventModel.find(
      {
        schoolSlug, status: { $in: ['draft', 'published'] },
        ...(excludeEventId ? { _id: { $ne: excludeEventId } } : {}),
        venueName: { $regex: `^${venue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      },
      { title: 1, sessions: 1, slug: 1 },
    ).lean();

    const conflicts: any[] = [];
    for (const other of candidates) {
      for (const mine of sessions) {
        const mineStart = new Date(mine.startAt).getTime(), mineEnd = new Date(mine.endAt).getTime();
        for (const theirs of (other as any).sessions || []) {
          const theirStart = new Date(theirs.startAt).getTime(), theirEnd = new Date(theirs.endAt).getTime();
          if (mineStart < theirEnd && theirStart < mineEnd) {
            conflicts.push({
              eventId: other._id, eventTitle: (other as any).title, eventSlug: (other as any).slug,
              theirSession: theirs.label, theirStartAt: theirs.startAt, theirEndAt: theirs.endAt,
              mySession: mine.label,
            });
          }
        }
      }
    }
    return conflicts;
  }

  async createEvent(schoolSlug: string, createdBy: string, data: any) {
    if (!data.title) throw new BadRequestException('title is required');
    let slug = this.slugify(data.slug || data.title);
    let suffix = 0;
    // Guarantee uniqueness rather than surfacing a raw duplicate-key error
    // for the common case (two events with the same/similar name).
    while (await this.eventModel.exists({ schoolSlug, slug: suffix ? `${slug}-${suffix}` : slug })) suffix++;
    if (suffix) slug = `${slug}-${suffix}`;

    const [event, venueConflicts] = await Promise.all([
      this.eventModel.create({ ...data, slug, schoolSlug, createdBy }),
      this.checkVenueConflicts(schoolSlug, data.venueName, data.sessions || []),
    ]);
    return { ...event.toObject(), venueConflicts };
  }

  async updateEvent(schoolSlug: string, id: string, data: any) {
    const { slug, ...rest } = data; // slug is set once at creation, not editable (would break already-shared links)
    const [updated, venueConflicts] = await Promise.all([
      this.eventModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: rest }, { new: true }).lean(),
      (rest.venueName !== undefined || rest.sessions !== undefined)
        ? this.eventModel.findOne({ _id: id, schoolSlug }).lean().then((existing: any) =>
            this.checkVenueConflicts(schoolSlug, rest.venueName ?? existing?.venueName, rest.sessions ?? existing?.sessions ?? [], id))
        : Promise.resolve([]),
    ]);
    if (!updated) throw new NotFoundException('Event not found');
    return { ...updated, venueConflicts };
  }

  // Lets the frontend live-check a venue/time combo while the admin is
  // still typing, before they've saved anything.
  async checkVenueAvailability(schoolSlug: string, venueName: string, sessions: any[], excludeEventId?: string) {
    return { venueConflicts: await this.checkVenueConflicts(schoolSlug, venueName, sessions, excludeEventId) };
  }

  async deleteEvent(schoolSlug: string, id: string) {
    const orderCount = await this.orderModel.countDocuments({ schoolSlug, eventId: id });
    if (orderCount > 0) {
      throw new BadRequestException(`Cannot delete this event - ${orderCount} order(s) already exist against it. Cancel it instead.`);
    }
    await Promise.all([
      this.eventModel.deleteOne({ _id: id, schoolSlug }),
      this.ticketTypeModel.deleteMany({ schoolSlug, eventId: id }),
      this.promoCodeModel.deleteMany({ schoolSlug, eventId: id }),
      this.merchItemModel.deleteMany({ schoolSlug, eventId: id }),
      this.seatMapModel.deleteMany({ schoolSlug, eventId: id }),
    ]);
    return { message: 'Deleted' };
  }

  async setEventStatus(schoolSlug: string, id: string, status: string) {
    if (status === 'published') {
      const ticketTypeCount = await this.ticketTypeModel.countDocuments({ schoolSlug, eventId: id, isActive: true });
      if (ticketTypeCount === 0) {
        throw new BadRequestException('Add at least one ticket type before publishing this event');
      }
    }
    const updated = await this.eventModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { status } }, { new: true }).lean();
    if (!updated) throw new NotFoundException('Event not found');
    return updated;
  }

  async getEvents(schoolSlug: string, query: { status?: string; category?: string } = {}) {
    const filter: any = { schoolSlug };
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    return this.eventModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async getEventById(schoolSlug: string, id: string) {
    const event = await this.eventModel.findOne({ _id: id, schoolSlug }).lean();
    if (!event) throw new NotFoundException('Event not found');
    const [ticketTypes, promoCodes] = await Promise.all([
      this.ticketTypeModel.find({ schoolSlug, eventId: id }).sort({ sortOrder: 1 }).lean(),
      this.promoCodeModel.find({ schoolSlug, eventId: id }).lean(),
    ]);
    return { ...event, ticketTypes, promoCodes };
  }

  // ─── Ticket types ───────────────────────────────────────────────────────

  async createTicketType(schoolSlug: string, eventId: string, data: any) {
    if (!data.name) throw new BadRequestException('name is required');
    if (!data.capacity || data.capacity < 1) throw new BadRequestException('capacity must be at least 1');
    return this.ticketTypeModel.create({ ...data, eventId, schoolSlug });
  }

  async updateTicketType(schoolSlug: string, id: string, data: any) {
    const tt = await this.ticketTypeModel.findOne({ _id: id, schoolSlug });
    if (!tt) throw new NotFoundException('Ticket type not found');
    if (data.capacity !== undefined && data.capacity < tt.soldCount) {
      throw new BadRequestException(`Cannot set capacity below ${tt.soldCount} - that many are already sold.`);
    }
    Object.assign(tt, data);
    await tt.save();
    return tt;
  }

  async deleteTicketType(schoolSlug: string, id: string) {
    const tt = await this.ticketTypeModel.findOne({ _id: id, schoolSlug }).lean();
    if (!tt) throw new NotFoundException('Ticket type not found');
    if (tt.soldCount > 0) throw new BadRequestException('Cannot delete a ticket type that already has sales - deactivate it instead.');
    await this.ticketTypeModel.deleteOne({ _id: id, schoolSlug });
    return { message: 'Deleted' };
  }

  // ─── Promo codes ────────────────────────────────────────────────────────

  async createPromoCode(schoolSlug: string, eventId: string, data: any) {
    if (!data.code) throw new BadRequestException('code is required');
    if (!data.discountType || data.discountValue == null) throw new BadRequestException('discountType and discountValue are required');
    try {
      return await this.promoCodeModel.create({ ...data, code: data.code.toUpperCase().trim(), eventId, schoolSlug });
    } catch (e: any) {
      if (e.code === 11000) throw new BadRequestException(`Promo code "${data.code}" already exists for this event`);
      throw e;
    }
  }

  async updatePromoCode(schoolSlug: string, id: string, data: any) {
    const updated = await this.promoCodeModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true }).lean();
    if (!updated) throw new NotFoundException('Promo code not found');
    return updated;
  }

  async deletePromoCode(schoolSlug: string, id: string) {
    const deleted = await this.promoCodeModel.findOneAndDelete({ _id: id, schoolSlug }).lean();
    if (!deleted) throw new NotFoundException('Promo code not found');
    return { message: 'Deleted' };
  }

  // ─── Merchandise (box office only - see MerchItem schema) ───────────────

  async getMerchItems(schoolSlug: string, eventId: string) {
    return this.merchItemModel.find({ schoolSlug, eventId }).sort({ createdAt: -1 }).lean();
  }

  async createMerchItem(schoolSlug: string, eventId: string, data: any) {
    if (!data.name) throw new BadRequestException('name is required');
    if (data.price == null || data.price < 0) throw new BadRequestException('price is required');
    return this.merchItemModel.create({ ...data, eventId, schoolSlug });
  }

  async updateMerchItem(schoolSlug: string, id: string, data: any) {
    const item = await this.merchItemModel.findOne({ _id: id, schoolSlug });
    if (!item) throw new NotFoundException('Merchandise item not found');
    if (data.stock !== undefined && data.stock !== null && data.stock < item.soldCount) {
      throw new BadRequestException(`Cannot set stock below ${item.soldCount} - that many are already sold.`);
    }
    Object.assign(item, data);
    await item.save();
    return item;
  }

  async deleteMerchItem(schoolSlug: string, id: string) {
    const item = await this.merchItemModel.findOne({ _id: id, schoolSlug }).lean();
    if (!item) throw new NotFoundException('Merchandise item not found');
    if (item.soldCount > 0) throw new BadRequestException('Cannot delete an item that already has sales - deactivate it instead.');
    await this.merchItemModel.deleteOne({ _id: id, schoolSlug });
    return { message: 'Deleted' };
  }

  // ─── Reserved seating ───────────────────────────────────────────────────

  // Live occupancy computed against Ticket at read time (never
  // denormalized onto the Seat subdocument) - so a cancelled/refunded
  // ticket immediately frees its seat with no extra bookkeeping.
  async getSeatMap(schoolSlug: string, eventId: string) {
    const map = await this.seatMapModel.findOne({ schoolSlug, eventId }).lean();
    if (!map) return null;
    const takenTickets = await this.ticketModel.find(
      { schoolSlug, eventId, status: { $in: ACTIVE_TICKET_STATUSES }, seatId: { $ne: null } },
      { seatId: 1, attendeeName: 1, status: 1 },
    ).lean();
    const takenBySeatId = new Map(takenTickets.map((t: any) => [t.seatId, t]));
    return {
      ...map,
      seats: map.seats.map((s: any) => {
        const ticket = takenBySeatId.get(s.seatId);
        return { ...s, status: ticket ? 'taken' : 'available', attendeeName: ticket?.attendeeName };
      }),
    };
  }

  async upsertSeatMap(schoolSlug: string, eventId: string, data: { name: string; seats: any[] }) {
    if (!Array.isArray(data.seats)) throw new BadRequestException('seats must be an array');
    const seatIds = data.seats.map((s) => s.seatId);
    if (new Set(seatIds).size !== seatIds.length) throw new BadRequestException('Duplicate seatId in layout');

    const existing = await this.seatMapModel.findOne({ schoolSlug, eventId }).lean();
    if (existing) {
      const removedSeatIds = existing.seats.map((s: any) => s.seatId).filter((id: string) => !seatIds.includes(id));
      if (removedSeatIds.length) {
        const stillTaken = await this.ticketModel.exists({
          schoolSlug, eventId, status: { $in: ACTIVE_TICKET_STATUSES }, seatId: { $in: removedSeatIds },
        });
        if (stillTaken) throw new BadRequestException('Cannot remove a seat that already has a ticket assigned - cancel that order first.');
      }
    }

    return this.seatMapModel.findOneAndUpdate(
      { schoolSlug, eventId },
      { $set: { name: data.name, seats: data.seats, schoolSlug, eventId } },
      { new: true, upsert: true },
    ).lean();
  }

  async deleteSeatMap(schoolSlug: string, eventId: string) {
    const anySeated = await this.ticketModel.exists({ schoolSlug, eventId, status: { $in: ACTIVE_TICKET_STATUSES }, seatId: { $ne: null } });
    if (anySeated) throw new BadRequestException('Cannot remove seating - tickets are already assigned to seats. Cancel those orders first.');
    await this.seatMapModel.deleteOne({ schoolSlug, eventId });
    return { message: 'Deleted' };
  }

  // ─── Pricing ────────────────────────────────────────────────────────────

  private currentPrice(ticketType: any, at: Date = new Date()): number {
    if (ticketType.isComplimentary || !ticketType.priceTiers?.length) return 0;
    // Latest tier whose window has started and (if it has an end) hasn't
    // ended yet; falls back to the earliest tier if none has started yet
    // (shouldn't normally happen once an event is live, but fails safe to
    // a real price rather than 0).
    const active = ticketType.priceTiers
      .filter((t: any) => new Date(t.startsAt) <= at && (!t.endsAt || new Date(t.endsAt) > at))
      .sort((a: any, b: any) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())[0];
    if (active) return active.price;
    const earliest = [...ticketType.priceTiers].sort((a: any, b: any) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0];
    return earliest?.price ?? 0;
  }

  private async applyPromoCode(schoolSlug: string, eventId: string, code: string | undefined, subtotal: number) {
    if (!code) return { discount: 0, promo: null as any };
    const promo = await this.promoCodeModel.findOne({ schoolSlug, eventId, code: code.toUpperCase().trim(), isActive: true });
    if (!promo) throw new BadRequestException(`Promo code "${code}" is not valid for this event`);
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) throw new BadRequestException(`Promo code "${code}" has expired`);
    if (promo.maxUses && promo.usedCount >= promo.maxUses) throw new BadRequestException(`Promo code "${code}" has reached its usage limit`);
    const discount = promo.discountType === 'percentage' ? subtotal * (promo.discountValue / 100) : Math.min(promo.discountValue, subtotal);
    return { discount, promo };
  }

  // ─── Checkout (public + box office share this) ─────────────────────────

  /**
   * `immediatePayment` is true for box-office/admin-entered cash sales
   * (paid on the spot) - the order and its tickets go straight to
   * paid/valid. It's false for public checkout: online isn't wired to a
   * gateway yet (see paymentMethod handling below) and bank_transfer/
   * at_door orders hold their capacity slot but need an admin to confirm
   * payment before their tickets are valid for check-in.
   */
  async createOrder(schoolSlug: string, eventId: string, data: any, opts: { immediatePayment?: boolean; confirmedBy?: string; allowMerch?: boolean } = {}) {
    const event = await this.eventModel.findOne({ _id: eventId, schoolSlug }).lean();
    if (!event) throw new NotFoundException('Event not found');
    if (!opts.immediatePayment && event.status !== 'published') {
      throw new BadRequestException('This event is not open for registration');
    }
    const ticketItems = Array.isArray(data.items) ? data.items : [];
    const merchRequests = opts.allowMerch && Array.isArray(data.merchItems) ? data.merchItems : [];
    if (ticketItems.length === 0 && merchRequests.length === 0) {
      throw new BadRequestException('At least one ticket is required');
    }
    if (!data.buyerName) throw new BadRequestException('buyerName is required');
    if (data.paymentMethod === 'online') {
      throw new BadRequestException('Online payment isn\'t set up for this school yet - choose Bank Transfer or Pay at the Door, or contact the school office.');
    }

    // Lock in ticket types + validate capacity up front, before creating
    // anything - a partially-created order on a capacity failure would be
    // a real mess to unwind.
    const seatMap = await this.seatMapModel.findOne({ schoolSlug, eventId }).lean();
    const seatById = new Map((seatMap?.seats ?? []).map((s: any) => [s.seatId, s]));
    const requestedSeatIds: string[] = ticketItems.flatMap((item: any) => item.seatIds || []);
    if (new Set(requestedSeatIds).size !== requestedSeatIds.length) {
      throw new BadRequestException('The same seat was selected more than once');
    }
    if (requestedSeatIds.length) {
      const alreadyTaken = await this.ticketModel.find(
        { schoolSlug, eventId, status: { $in: ACTIVE_TICKET_STATUSES }, seatId: { $in: requestedSeatIds } },
        { seatId: 1 },
      ).lean();
      if (alreadyTaken.length) {
        throw new BadRequestException(`Seat(s) ${alreadyTaken.map((t: any) => t.seatId).join(', ')} were just taken by someone else - please pick again.`);
      }
    }

    const lineItems: any[] = [];
    let subtotal = 0;
    for (const item of ticketItems) {
      const tt = await this.ticketTypeModel.findOne({ _id: item.ticketTypeId, schoolSlug, eventId, isActive: true });
      if (!tt) throw new BadRequestException(`Ticket type not found or no longer available`);
      const qty = Number(item.quantity) || 0;
      if (qty < 1) throw new BadRequestException(`Invalid quantity for ${tt.name}`);
      const remaining = tt.capacity - tt.soldCount;
      if (qty > remaining) {
        throw new BadRequestException(`Only ${remaining} "${tt.name}" ticket(s) left - requested ${qty}`);
      }
      const seatIds: (string | null)[] = item.seatIds?.length ? item.seatIds : new Array(qty).fill(null);
      if (seatIds.length !== qty) throw new BadRequestException(`Select exactly ${qty} seat(s) for ${tt.name}`);
      for (const seatId of seatIds) {
        if (seatId == null) continue;
        const seat = seatById.get(seatId);
        if (!seat) throw new BadRequestException(`Seat ${seatId} does not exist on this event's seat map`);
        if (seat.ticketTypeId && String(seat.ticketTypeId) !== String(tt._id)) {
          throw new BadRequestException(`Seat ${seatId} is reserved for a different ticket type`);
        }
      }
      const unitPrice = this.currentPrice(tt);
      lineItems.push({ ticketType: tt, ticketTypeId: tt._id, ticketTypeName: tt.name, quantity: qty, unitPrice, attendees: item.attendees || [], seatIds });
      subtotal += unitPrice * qty;
    }

    const { discount, promo } = await this.applyPromoCode(schoolSlug, eventId, data.promoCode, subtotal);
    const ticketNet = Math.max(0, subtotal - discount);

    // Merch is priced separately from the promo-code discount above (which
    // only ever applied against ticket pricing) - a walk-up t-shirt sale
    // isn't discounted by an EARLYBIRD ticket code.
    const merchLines: any[] = [];
    let merchTotal = 0;
    for (const req of merchRequests) {
      const merchItem = await this.merchItemModel.findOne({ _id: req.merchItemId, schoolSlug, eventId, isActive: true });
      if (!merchItem) throw new BadRequestException('Merchandise item not found or no longer available');
      const qty = Number(req.quantity) || 0;
      if (qty < 1) throw new BadRequestException(`Invalid quantity for ${merchItem.name}`);
      if (merchItem.stock != null && qty > merchItem.stock - merchItem.soldCount) {
        throw new BadRequestException(`Only ${merchItem.stock - merchItem.soldCount} "${merchItem.name}" left - requested ${qty}`);
      }
      merchLines.push({ merchItem, merchItemId: merchItem._id, merchItemName: merchItem.name, quantity: qty, unitPrice: merchItem.price });
      merchTotal += merchItem.price * qty;
    }

    const totalAmount = ticketNet + merchTotal;
    const isPaid = opts.immediatePayment || totalAmount === 0;
    const orderCount = await this.orderModel.countDocuments({ schoolSlug });
    const orderNo = `ORD-${new Date().getFullYear()}-${String(orderCount + 1).padStart(5, '0')}`;

    const order = await this.orderModel.create({
      orderNo, eventId, schoolSlug,
      buyerName: data.buyerName, buyerEmail: data.buyerEmail, buyerPhone: data.buyerPhone, buyerUserId: data.buyerUserId || null,
      items: [
        ...lineItems.map((li) => ({ kind: 'ticket', ticketTypeId: li.ticketTypeId, ticketTypeName: li.ticketTypeName, quantity: li.quantity, unitPrice: li.unitPrice })),
        ...merchLines.map((ml) => ({ kind: 'merch', merchItemId: ml.merchItemId, merchItemName: ml.merchItemName, quantity: ml.quantity, unitPrice: ml.unitPrice })),
      ],
      subtotal: subtotal + merchTotal, discountTotal: discount, promoCode: promo?.code, totalAmount,
      paymentMethod: data.paymentMethod || 'at_door',
      status: isPaid ? 'paid' : 'pending_payment',
      paidAt: isPaid ? new Date() : undefined,
      paidBy: isPaid ? opts.confirmedBy : undefined,
      notes: data.notes,
    });

    for (const ml of merchLines) {
      await this.merchItemModel.updateOne({ _id: ml.merchItemId }, { $inc: { soldCount: ml.quantity } });
    }

    const tickets: any[] = [];
    for (const li of lineItems) {
      for (let i = 0; i < li.quantity; i++) {
        const attendee = li.attendees[i] || {};
        tickets.push({
          orderId: order._id, eventId, ticketTypeId: li.ticketTypeId, ticketTypeName: li.ticketTypeName,
          attendeeName: attendee.name || data.buyerName, attendeeEmail: attendee.email || data.buyerEmail, attendeePhone: attendee.phone || data.buyerPhone,
          qrToken: randomBytes(16).toString('hex'),
          status: isPaid ? 'valid' : 'reserved',
          seatId: li.seatIds[i] || null,
          schoolSlug,
        });
      }
      await this.ticketTypeModel.updateOne({ _id: li.ticketTypeId }, { $inc: { soldCount: li.quantity } });
    }
    const createdTickets = await this.ticketModel.insertMany(tickets);

    if (promo) await this.promoCodeModel.updateOne({ _id: promo._id }, { $inc: { usedCount: 1 } });

    this.sendOrderConfirmation(event, order, createdTickets).catch((e) =>
      this.logger.error(`Order confirmation failed for ${order.orderNo}: ${e?.message}`));

    return { order, tickets: createdTickets };
  }

  async markOrderPaid(schoolSlug: string, orderId: string, confirmedBy: string) {
    const order = await this.orderModel.findOne({ _id: orderId, schoolSlug });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'paid') throw new BadRequestException('Already marked paid');
    if (order.status !== 'pending_payment') throw new BadRequestException(`Cannot mark a ${order.status} order as paid`);

    order.status = 'paid';
    order.paidAt = new Date();
    order.paidBy = confirmedBy;
    await order.save();
    await this.ticketModel.updateMany({ orderId, status: 'reserved' }, { $set: { status: 'valid' } });

    const event = await this.eventModel.findOne({ _id: order.eventId, schoolSlug }).lean();
    const tickets = await this.ticketModel.find({ orderId }).lean();
    if (event) {
      this.sendOrderConfirmation(event, order, tickets).catch((e) =>
        this.logger.error(`Payment-confirmation send failed for ${order.orderNo}: ${e?.message}`));
    }
    return order;
  }

  // Refunds always return via the order's original paymentMethod ("refund
  // to source") - there's no field to pick a different method, by design.
  // `refundReference` is required for a paid order so there's a record of
  // how the money actually moved (a bank ref, "cash handed back", etc).
  // This refunds the WHOLE order - see refundTickets below for refunding
  // just some of an order's tickets (Phase 3).
  async cancelOrder(schoolSlug: string, orderId: string, reason: string | undefined, refundReference: string | undefined, cancelledBy: string) {
    const order = await this.orderModel.findOne({ _id: orderId, schoolSlug });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'refunded' || order.status === 'cancelled') throw new BadRequestException('Already cancelled/refunded');

    const wasPaid = order.status === 'paid';
    if (wasPaid && !refundReference?.trim()) {
      throw new BadRequestException(`This order was paid via ${order.paymentMethod.replace('_', ' ')} - describe how the ${order.totalAmount} refund was actually returned (e.g. a bank reference, or "cash handed back").`);
    }
    order.status = wasPaid ? 'refunded' : 'cancelled';
    order.notes = [order.notes, reason ? `${wasPaid ? 'Refunded' : 'Cancelled'} by ${cancelledBy}: ${reason}` : undefined].filter(Boolean).join(' | ');
    if (wasPaid) {
      order.refundedAt = new Date();
      order.refundedBy = cancelledBy;
      order.refundMethod = order.paymentMethod;
      order.refundReference = refundReference as string;
      order.refundAmount = order.totalAmount;
      order.totalRefunded = order.totalAmount;
    }
    await order.save();

    const tickets = await this.ticketModel.find({ orderId, status: { $ne: 'checked_in' } }).lean();
    await this.ticketModel.updateMany({ orderId, status: { $ne: 'checked_in' } }, { $set: { status: wasPaid ? 'refunded' : 'cancelled' } });
    for (const t of tickets) {
      await this.ticketTypeModel.updateOne({ _id: t.ticketTypeId }, { $inc: { soldCount: -1 } });
    }
    return order;
  }

  // Phase 3 — refund just SOME of a paid order's tickets (e.g. a parent
  // can no longer bring 2 of their 4 kids), rather than the all-or-nothing
  // cancelOrder above. Never touches a checked-in ticket (same rule
  // cancelOrder already follows) - once someone's actually walked in, the
  // service was rendered. The order itself stays 'paid' throughout; only
  // totalRefunded/partialRefunds track how much has come back out of it.
  async refundTickets(schoolSlug: string, orderId: string, ticketIds: string[], refundReference: string, refundedBy: string) {
    if (!ticketIds?.length) throw new BadRequestException('Select at least one ticket to refund');
    if (!refundReference?.trim()) throw new BadRequestException('Describe how this refund was actually returned (e.g. a bank reference, or "cash handed back")');

    const order = await this.orderModel.findOne({ _id: orderId, schoolSlug });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'paid') throw new BadRequestException(`Cannot refund individual tickets from a ${order.status} order`);

    const tickets = await this.ticketModel.find({ _id: { $in: ticketIds }, orderId, schoolSlug });
    if (tickets.length !== ticketIds.length) throw new BadRequestException('Some of those tickets were not found on this order');
    const notRefundable = tickets.filter((t) => t.status === 'checked_in' || t.status === 'refunded' || t.status === 'cancelled');
    if (notRefundable.length) {
      throw new BadRequestException(`${notRefundable.length} of those ticket(s) are already ${notRefundable[0].status} and can't be refunded again.`);
    }

    // Per-ticket amount = that ticket type's unitPrice on this order (the
    // price actually charged, not today's price if it's since changed) -
    // promo-code discount isn't prorated per ticket in Phase 3 (documented
    // gap), so a refund on a discounted order returns the pre-discount
    // per-ticket rate, capped so the running total never exceeds what's
    // actually left to refund on the order.
    const unitPriceByTicketType = new Map(order.items.filter((i) => i.kind !== 'merch').map((i) => [String(i.ticketTypeId), i.unitPrice]));
    const remaining = order.totalAmount - order.totalRefunded;
    let amount = tickets.reduce((sum, t) => sum + (unitPriceByTicketType.get(String(t.ticketTypeId)) || 0), 0);
    amount = Math.min(amount, remaining);

    await this.ticketModel.updateMany({ _id: { $in: ticketIds } }, { $set: { status: 'refunded' } });
    for (const t of tickets) {
      await this.ticketTypeModel.updateOne({ _id: t.ticketTypeId }, { $inc: { soldCount: -1 } });
    }

    order.partialRefunds.push({ ticketIds: tickets.map((t) => t._id), amount, reference: refundReference, refundedAt: new Date(), refundedBy } as any);
    order.totalRefunded += amount;
    if (order.totalRefunded >= order.totalAmount) {
      order.status = 'refunded';
      order.refundedAt = new Date();
      order.refundedBy = refundedBy;
      order.refundMethod = order.paymentMethod;
      order.refundReference = refundReference;
      order.refundAmount = order.totalAmount;
    }
    await order.save();
    return { order, refundedAmount: amount };
  }

  private async sendOrderConfirmation(event: any, order: any, tickets: any[]) {
    if (order.status !== 'paid') return; // don't confirm a still-pending-payment order
    if (order.buyerEmail) {
      const qrImages = await Promise.all(tickets.map((t) => QRCode.toDataURL(t.qrToken, { width: 160, margin: 1 })));
      const html = `
        <h2>You're registered for ${event.title}!</h2>
        <p>Order ${order.orderNo} — ${tickets.length} ticket(s)</p>
        ${tickets.map((t, i) => `
          <div style="margin:16px 0;padding:12px;border:1px solid #ddd;border-radius:8px;">
            <p><strong>${t.attendeeName}</strong> — ${t.ticketTypeName}</p>
            <img src="${qrImages[i]}" alt="QR ticket" />
          </div>`).join('')}
      `;
      await this.emailService.sendEmail({ to: order.buyerEmail, subject: `Your ticket(s) for ${event.title}`, html });
    }
  }

  // ─── Attendees / CRM ────────────────────────────────────────────────────

  async getOrders(schoolSlug: string, eventId: string) {
    return this.orderModel.find({ schoolSlug, eventId }).sort({ createdAt: -1 }).lean();
  }

  async getAttendees(schoolSlug: string, eventId: string) {
    return this.ticketModel.find({ schoolSlug, eventId }).sort({ attendeeName: 1 }).lean();
  }

  // Phase 3 — cross-event loyalty/CRM: given a buyer's email or phone,
  // shows every order they've ever placed across every event this school
  // has run, not just the one currently open. Lets box office recognize a
  // repeat family ("they came to Sports Day and the Fundraiser too") on
  // the spot, and gives the school a real picture of who its most engaged
  // families are without a separate loyalty-points system to maintain.
  async lookupAttendeeHistory(schoolSlug: string, query: { email?: string; phone?: string }) {
    const email = query.email?.trim().toLowerCase();
    const phone = query.phone?.trim();
    if (!email && !phone) throw new BadRequestException('Provide an email or phone to search');

    const match: any = { schoolSlug, $or: [] };
    if (email) match.$or.push({ buyerEmail: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (phone) match.$or.push({ buyerPhone: phone });

    const orders = await this.orderModel.find(match).sort({ createdAt: -1 }).lean();
    if (orders.length === 0) return { found: false, orders: [], totalOrders: 0, totalSpent: 0, totalTickets: 0, events: [] };

    const eventIds = [...new Set(orders.map((o: any) => String(o.eventId)))];
    const events = await this.eventModel.find({ _id: { $in: eventIds }, schoolSlug }, { title: 1, category: 1, sessions: 1 }).lean();
    const eventById = new Map(events.map((e: any) => [String(e._id), e]));

    const totalSpent = orders.filter((o: any) => o.status === 'paid').reduce((s: number, o: any) => s + (o.totalAmount - (o.totalRefunded || 0)), 0);
    const totalTickets = orders.reduce((s: number, o: any) => s + o.items.filter((i: any) => i.kind !== 'merch').reduce((n: number, i: any) => n + i.quantity, 0), 0);

    return {
      found: true,
      buyerName: orders[0].buyerName,
      isRepeatAttendee: eventIds.length > 1,
      totalOrders: orders.length,
      totalSpent,
      totalTickets,
      events: eventIds.map((id) => ({ eventId: id, title: eventById.get(id)?.title, category: eventById.get(id)?.category })),
      orders: orders.map((o: any) => ({
        _id: o._id, orderNo: o.orderNo, eventId: o.eventId, eventTitle: eventById.get(String(o.eventId))?.title,
        totalAmount: o.totalAmount, totalRefunded: o.totalRefunded || 0, status: o.status, createdAt: (o as any).createdAt,
      })),
    };
  }

  // ─── Check-in ───────────────────────────────────────────────────────────

  async checkInTicket(schoolSlug: string, eventId: string, qrToken: string, gate: string | undefined, staffName: string) {
    const ticket = await this.ticketModel.findOne({ schoolSlug, eventId, qrToken });
    if (!ticket) throw new NotFoundException('Ticket not found for this event');
    if (ticket.status === 'checked_in') {
      throw new BadRequestException(`Already checked in at ${ticket.checkedInAt?.toLocaleString?.() || ticket.checkedInAt} (gate: ${ticket.checkedInGate || 'unknown'})`);
    }
    if (ticket.status === 'reserved') throw new BadRequestException('This ticket has not been paid for yet - send it to Box Office first.');
    if (ticket.status !== 'valid') throw new BadRequestException(`This ticket is ${ticket.status} and cannot be checked in`);

    ticket.status = 'checked_in';
    ticket.checkedInAt = new Date();
    ticket.checkedInBy = staffName;
    ticket.checkedInGate = gate as any;
    await ticket.save();
    return ticket;
  }

  async checkInByName(schoolSlug: string, eventId: string, query: string) {
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.ticketModel.find({
      schoolSlug, eventId, status: { $in: ['valid', 'checked_in'] },
      attendeeName: { $regex: safe, $options: 'i' },
    }).limit(20).lean();
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────

  async getEventDashboard(schoolSlug: string, eventId: string) {
    const [ticketTypes, revenueAgg, checkedInCount, totalSoldCount] = await Promise.all([
      this.ticketTypeModel.find({ schoolSlug, eventId }).lean(),
      this.orderModel.aggregate([
        { $match: { schoolSlug, eventId: new Types.ObjectId(eventId), status: 'paid' } },
        { $group: { _id: null, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      ]),
      this.ticketModel.countDocuments({ schoolSlug, eventId, status: 'checked_in' }),
      this.ticketModel.countDocuments({ schoolSlug, eventId, status: { $in: ACTIVE_TICKET_STATUSES } }),
    ]);
    return {
      byTicketType: ticketTypes.map((t: any) => ({ name: t.name, capacity: t.capacity, sold: t.soldCount, available: t.capacity - t.soldCount })),
      revenue: revenueAgg[0]?.revenue ?? 0,
      paidOrders: revenueAgg[0]?.orders ?? 0,
      checkedInCount,
      totalSoldCount,
    };
  }

  // ─── Multi-gate check-in ────────────────────────────────────────────────

  // Powers both the admin dashboard's per-gate breakdown and the Kiosk
  // mode header (each gate/device shows its own running count, plus this
  // gives the event-wide total across all gates).
  async getGateStats(schoolSlug: string, eventId: string) {
    const stats = await this.ticketModel.aggregate([
      { $match: { schoolSlug, eventId: new Types.ObjectId(eventId), status: 'checked_in' } },
      { $group: { _id: '$checkedInGate', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return stats.map((s: any) => ({ gate: s._id || 'Unspecified', count: s.count }));
  }

  // ─── Badges ─────────────────────────────────────────────────────────────

  async generateBadgesPdf(schoolSlug: string, ticketIds: string[]): Promise<Buffer> {
    const tickets = await this.ticketModel.find({ _id: { $in: ticketIds }, schoolSlug }).lean();
    if (tickets.length === 0) throw new NotFoundException('No tickets found');
    const eventIds = [...new Set(tickets.map((t) => String(t.eventId)))];
    const events = await this.eventModel.find({ _id: { $in: eventIds }, schoolSlug }).lean();
    const eventById = new Map(events.map((e: any) => [String(e._id), e]));

    const cardsHtml = await Promise.all(tickets.map(async (t: any) => {
      const event = eventById.get(String(t.eventId));
      const qrDataUrl = await QRCode.toDataURL(t.qrToken, { width: 120, margin: 1 });
      return `
        <div class="badge" style="border-top-color:${event?.theme?.primaryColor || '#0C447C'}">
          ${event?.theme?.logoUrl ? `<img class="logo" src="${event.theme.logoUrl}" />` : ''}
          <div class="event-title">${event?.title || ''}</div>
          <div class="attendee-name">${t.attendeeName}</div>
          <div class="ticket-type">${t.ticketTypeName}</div>
          <img class="qr" src="${qrDataUrl}" />
        </div>`;
    }));

    await this.ticketModel.updateMany({ _id: { $in: ticketIds } }, { $set: { badgePrinted: true, badgePrintedAt: new Date() } });

    const html = `<!doctype html><html><head><style>
      @page { size: A4; margin: 8mm; }
      * { box-sizing: border-box; font-family: -apple-system, Arial, sans-serif; }
      body { margin: 0; }
      .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
      .badge {
        border: 1px solid #ddd; border-top: 6px solid #0C447C; border-radius: 6px;
        padding: 6mm; text-align: center; break-inside: avoid; height: 55mm;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm;
      }
      .logo { max-height: 10mm; max-width: 40mm; }
      .event-title { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
      .attendee-name { font-size: 16px; font-weight: 700; }
      .ticket-type { font-size: 11px; color: #888; }
      .qr { width: 20mm; height: 20mm; margin-top: 2mm; }
    </style></head><body><div class="sheet">${cardsHtml.join('')}</div></body></html>`;

    return this.pdfService.htmlToPdfWithOptions(html, { format: 'A4' });
  }

  // ─── Public ─────────────────────────────────────────────────────────────

  async getPublicEvents(schoolSlug: string) {
    return this.eventModel.find({ schoolSlug, status: 'published', visibility: 'public' }).sort({ 'sessions.0.startAt': 1 }).lean();
  }

  async getPublicEventBySlug(schoolSlug: string, slug: string) {
    const event = await this.eventModel.findOne({ schoolSlug, slug, status: 'published', visibility: { $in: ['public', 'unlisted'] } }).lean();
    if (!event) throw new NotFoundException('Event not found');
    const [ticketTypes, seatMap] = await Promise.all([
      this.ticketTypeModel.find({ schoolSlug, eventId: event._id, isActive: true }).sort({ sortOrder: 1 }).lean(),
      this.getSeatMap(schoolSlug, String(event._id)),
    ]);
    return {
      ...event,
      ticketTypes: ticketTypes.map((t: any) => ({
        _id: t._id, name: t.name, description: t.description,
        currentPrice: this.currentPrice(t), availableCount: Math.max(0, t.capacity - t.soldCount),
        isComplimentary: t.isComplimentary,
      })),
      hasReservedSeating: !!seatMap,
      seatMap: seatMap ? { seats: seatMap.seats } : null,
    };
  }
}
