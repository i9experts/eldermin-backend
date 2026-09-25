import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import { CampaignSend, CampaignSendDocument } from './schemas/campaign-send.schema';
import { Event, EventDocument } from './schemas/event.schema';
import { Order, OrderDocument } from './schemas/order.schema';
import { Ticket, TicketDocument } from './schemas/ticket.schema';
import { EmailService } from '../email/email.service';

// CRM & Campaigns (Event Management Phase 2): event-wide email blasts
// (manual) plus timing-driven reminders (before/after the event) and
// abandoned-order nudges (a pending_payment order that's sat unconfirmed
// too long). Email-only - the WhatsApp channel migration is a separate,
// explicitly deferred project (see WhatsAppService), not wired in here.
@Injectable()
export class CampaignsService {
  private logger = new Logger('CampaignsService');

  constructor(
    @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
    @InjectModel(CampaignSend.name) private sendModel: Model<CampaignSendDocument>,
    @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    private emailService: EmailService,
  ) {}

  async createCampaign(schoolSlug: string, eventId: string, createdBy: string, data: any) {
    if (!data.name || !data.subject || !data.bodyHtml) throw new BadRequestException('name, subject and bodyHtml are required');
    return this.campaignModel.create({ ...data, eventId, schoolSlug, createdBy });
  }

  async updateCampaign(schoolSlug: string, id: string, data: any) {
    const updated = await this.campaignModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true }).lean();
    if (!updated) throw new NotFoundException('Campaign not found');
    return updated;
  }

  async deleteCampaign(schoolSlug: string, id: string) {
    await this.campaignModel.deleteOne({ _id: id, schoolSlug });
    await this.sendModel.deleteMany({ campaignId: id, schoolSlug });
    return { message: 'Deleted' };
  }

  async getCampaigns(schoolSlug: string, eventId: string) {
    return this.campaignModel.find({ schoolSlug, eventId }).sort({ createdAt: -1 }).lean();
  }

  // Manual send - resolves the audience right now and emails everyone not
  // already reached (dedupe via CampaignSend), then marks the campaign
  // 'sent' (terminal - a manual campaign is a one-off blast, not ongoing).
  async sendCampaignNow(schoolSlug: string, id: string) {
    const campaign = await this.campaignModel.findOne({ _id: id, schoolSlug });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const event = await this.eventModel.findOne({ _id: campaign.eventId, schoolSlug }).lean();
    if (!event) throw new NotFoundException('Event not found');

    const orders = await this.resolveAudienceOrders(schoolSlug, String(campaign.eventId), campaign.audience);
    const sent = await this.sendToOrders(campaign, event, orders);
    campaign.status = 'sent';
    campaign.lastRunAt = new Date();
    campaign.sentCount += sent;
    await campaign.save();
    return { sent };
  }

  private async resolveAudienceOrders(schoolSlug: string, eventId: string, audience: string) {
    const filter: any = { schoolSlug, eventId };
    if (audience === 'paid_orders') filter.status = 'paid';
    else if (audience === 'unpaid_orders') filter.status = 'pending_payment';
    else filter.status = { $in: ['paid', 'pending_payment'] };
    let orders = await this.orderModel.find(filter).lean();

    if (audience === 'checked_in' || audience === 'not_checked_in') {
      const orderIds = orders.map((o: any) => o._id);
      const checkedInOrderIds = new Set(
        (await this.ticketModel.find({ schoolSlug, orderId: { $in: orderIds }, status: 'checked_in' }, { orderId: 1 }).lean())
          .map((t: any) => String(t.orderId)),
      );
      orders = orders.filter((o: any) => (audience === 'checked_in') === checkedInOrderIds.has(String(o._id)));
    }
    return orders.filter((o: any) => o.buyerEmail);
  }

  private fillTemplate(bodyOrSubject: string, event: any, order: any): string {
    return bodyOrSubject
      .replace(/\{\{buyerName\}\}/g, order.buyerName || '')
      .replace(/\{\{eventTitle\}\}/g, event.title || '')
      .replace(/\{\{orderNo\}\}/g, order.orderNo || '');
  }

  private async sendToOrders(campaign: any, event: any, orders: any[]): Promise<number> {
    let sentCount = 0;
    for (const order of orders) {
      if (!order.buyerEmail) continue;
      const already = await this.sendModel.exists({ campaignId: campaign._id, orderId: order._id });
      if (already) continue;
      try {
        await this.emailService.sendEmail({
          to: order.buyerEmail,
          subject: this.fillTemplate(campaign.subject, event, order),
          html: this.fillTemplate(campaign.bodyHtml, event, order),
        });
        await this.sendModel.create({ campaignId: campaign._id, orderId: order._id, sentAt: new Date(), schoolSlug: campaign.schoolSlug });
        sentCount++;
      } catch (e: any) {
        this.logger.error(`Campaign "${campaign.name}" send failed for order ${order.orderNo}: ${e?.message}`);
      }
    }
    return sentCount;
  }

  // Evaluates every 'active' timing-driven campaign every 10 minutes -
  // hours-scale triggers, so minute-level precision (like the per-minute
  // circular/accounting-sync crons elsewhere) isn't needed here.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async runScheduledCampaigns() {
    const campaigns = await this.campaignModel.find({
      status: 'active', trigger: { $in: ['before_event', 'after_event', 'abandoned_order'] },
    }).lean();
    const now = new Date();

    for (const campaign of campaigns) {
      const event = await this.eventModel.findOne({ _id: campaign.eventId, schoolSlug: campaign.schoolSlug }).lean();
      if (!event || !event.sessions?.length) continue;

      let orders: any[] = [];
      if (campaign.trigger === 'before_event') {
        const firstStart = new Date(Math.min(...event.sessions.map((s: any) => new Date(s.startAt).getTime())));
        const dueAt = new Date(firstStart.getTime() - campaign.offsetHours * 3600_000);
        if (now < dueAt || now > firstStart) continue; // not due yet, or the event already started
        orders = await this.resolveAudienceOrders(campaign.schoolSlug, String(campaign.eventId), campaign.audience);
      } else if (campaign.trigger === 'after_event') {
        const lastEnd = new Date(Math.max(...event.sessions.map((s: any) => new Date(s.endAt).getTime())));
        const dueAt = new Date(lastEnd.getTime() + campaign.offsetHours * 3600_000);
        if (now < dueAt) continue;
        orders = await this.resolveAudienceOrders(campaign.schoolSlug, String(campaign.eventId), campaign.audience);
      } else {
        // abandoned_order - no event-timing gate, just order age.
        const cutoff = new Date(now.getTime() - campaign.abandonedAfterHours * 3600_000);
        orders = await this.orderModel.find({
          schoolSlug: campaign.schoolSlug, eventId: campaign.eventId,
          status: 'pending_payment', createdAt: { $lte: cutoff }, buyerEmail: { $exists: true, $ne: null },
        }).lean();
      }

      const sent = await this.sendToOrders(campaign, event, orders);
      if (sent > 0) {
        await this.campaignModel.updateOne({ _id: campaign._id }, { $inc: { sentCount: sent }, $set: { lastRunAt: now } });
        this.logger.log(`Campaign "${campaign.name}" (${campaign.trigger}) sent ${sent} email(s) for event ${event.title}`);
      }
    }
  }
}
