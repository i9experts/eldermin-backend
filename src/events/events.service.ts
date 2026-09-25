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

  async createEvent(schoolSlug: string, createdBy: string, data: any) {
    if (!data.title) throw new BadRequestException('title is required');
    let slug = this.slugify(data.slug || data.title);
    let suffix = 0;
    // Guarantee uniqueness rather than surfacing a raw duplicate-key error
    // for the common case (two events with the same/similar name).
    while (await this.eventModel.exists({ schoolSlug, slug: suffix ? `${slug}-${suffix}` : slug })) suffix++;
    if (suffix) slug = `${slug}-${suffix}`;

    return this.eventModel.create({ ...data, slug, schoolSlug, createdBy });
  }

  async updateEvent(schoolSlug: string, id: string, data: any) {
    const { slug, ...rest } = data; // slug is set once at creation, not editable (would break already-shared links)
    const updated = await this.eventModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: rest }, { new: true }).lean();
    if (!updated) throw new NotFoundException('Event not found');
    return updated;
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
  async createOrder(schoolSlug: string, eventId: string, data: any, opts: { immediatePayment?: boolean; confirmedBy?: string } = {}) {
    const event = await this.eventModel.findOne({ _id: eventId, schoolSlug }).lean();
    if (!event) throw new NotFoundException('Event not found');
    if (!opts.immediatePayment && event.status !== 'published') {
      throw new BadRequestException('This event is not open for registration');
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new BadRequestException('At least one ticket is required');
    }
    if (!data.buyerName) throw new BadRequestException('buyerName is required');
    if (data.paymentMethod === 'online') {
      throw new BadRequestException('Online payment isn\'t set up for this school yet - choose Bank Transfer or Pay at the Door, or contact the school office.');
    }

    // Lock in ticket types + validate capacity up front, before creating
    // anything - a partially-created order on a capacity failure would be
    // a real mess to unwind.
    const lineItems: any[] = [];
    let subtotal = 0;
    for (const item of data.items) {
      const tt = await this.ticketTypeModel.findOne({ _id: item.ticketTypeId, schoolSlug, eventId, isActive: true });
      if (!tt) throw new BadRequestException(`Ticket type not found or no longer available`);
      const qty = Number(item.quantity) || 0;
      if (qty < 1) throw new BadRequestException(`Invalid quantity for ${tt.name}`);
      const remaining = tt.capacity - tt.soldCount;
      if (qty > remaining) {
        throw new BadRequestException(`Only ${remaining} "${tt.name}" ticket(s) left - requested ${qty}`);
      }
      const unitPrice = this.currentPrice(tt);
      lineItems.push({ ticketType: tt, ticketTypeId: tt._id, ticketTypeName: tt.name, quantity: qty, unitPrice, attendees: item.attendees || [] });
      subtotal += unitPrice * qty;
    }

    const { discount, promo } = await this.applyPromoCode(schoolSlug, eventId, data.promoCode, subtotal);
    const totalAmount = Math.max(0, subtotal - discount);

    const isPaid = opts.immediatePayment || totalAmount === 0;
    const orderCount = await this.orderModel.countDocuments({ schoolSlug });
    const orderNo = `ORD-${new Date().getFullYear()}-${String(orderCount + 1).padStart(5, '0')}`;

    const order = await this.orderModel.create({
      orderNo, eventId, schoolSlug,
      buyerName: data.buyerName, buyerEmail: data.buyerEmail, buyerPhone: data.buyerPhone, buyerUserId: data.buyerUserId || null,
      items: lineItems.map((li) => ({ ticketTypeId: li.ticketTypeId, ticketTypeName: li.ticketTypeName, quantity: li.quantity, unitPrice: li.unitPrice })),
      subtotal, discountTotal: discount, promoCode: promo?.code, totalAmount,
      paymentMethod: data.paymentMethod || 'at_door',
      status: isPaid ? 'paid' : 'pending_payment',
      paidAt: isPaid ? new Date() : undefined,
      paidBy: isPaid ? opts.confirmedBy : undefined,
      notes: data.notes,
    });

    const tickets: any[] = [];
    for (const li of lineItems) {
      for (let i = 0; i < li.quantity; i++) {
        const attendee = li.attendees[i] || {};
        tickets.push({
          orderId: order._id, eventId, ticketTypeId: li.ticketTypeId, ticketTypeName: li.ticketTypeName,
          attendeeName: attendee.name || data.buyerName, attendeeEmail: attendee.email || data.buyerEmail, attendeePhone: attendee.phone || data.buyerPhone,
          qrToken: randomBytes(16).toString('hex'),
          status: isPaid ? 'valid' : 'reserved',
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

  async cancelOrder(schoolSlug: string, orderId: string, reason: string | undefined, cancelledBy: string) {
    const order = await this.orderModel.findOne({ _id: orderId, schoolSlug });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'refunded' || order.status === 'cancelled') throw new BadRequestException('Already cancelled/refunded');

    const wasPaid = order.status === 'paid';
    order.status = wasPaid ? 'refunded' : 'cancelled';
    order.notes = [order.notes, reason ? `${wasPaid ? 'Refunded' : 'Cancelled'} by ${cancelledBy}: ${reason}` : undefined].filter(Boolean).join(' | ');
    await order.save();

    const tickets = await this.ticketModel.find({ orderId, status: { $ne: 'checked_in' } }).lean();
    await this.ticketModel.updateMany({ orderId, status: { $ne: 'checked_in' } }, { $set: { status: wasPaid ? 'refunded' : 'cancelled' } });
    for (const t of tickets) {
      await this.ticketTypeModel.updateOne({ _id: t.ticketTypeId }, { $inc: { soldCount: -1 } });
    }
    return order;
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
    const ticketTypes = await this.ticketTypeModel.find({ schoolSlug, eventId: event._id, isActive: true }).sort({ sortOrder: 1 }).lean();
    return {
      ...event,
      ticketTypes: ticketTypes.map((t: any) => ({
        _id: t._id, name: t.name, description: t.description,
        price: this.currentPrice(t), available: Math.max(0, t.capacity - t.soldCount),
        isComplimentary: t.isComplimentary,
      })),
    };
  }
}
