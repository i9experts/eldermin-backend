import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CampaignDocument = Campaign & Document;

export const CAMPAIGN_TRIGGERS = ['manual', 'before_event', 'after_event', 'abandoned_order'] as const;
export const CAMPAIGN_AUDIENCES = ['all_orders', 'paid_orders', 'unpaid_orders', 'checked_in', 'not_checked_in'] as const;

// Email-only for now (WhatsApp channel migration is explicitly deferred -
// see WhatsAppService). bodyHtml supports {{buyerName}}, {{eventTitle}},
// {{orderNo}} placeholders, substituted per-recipient at send time.
@Schema({ timestamps: true, collection: 'event_campaigns' })
export class Campaign {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Event' }) eventId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ enum: CAMPAIGN_TRIGGERS, default: 'manual' }) trigger: string;
  // For before_event/after_event: hours relative to the event's first
  // session start (before) / last session end (after). Ignored otherwise.
  @Prop({ default: 24 }) offsetHours: number;
  // For abandoned_order: how many hours a pending_payment order sits
  // unconfirmed before it's considered abandoned and gets reminded.
  @Prop({ default: 24 }) abandonedAfterHours: number;
  @Prop({ enum: CAMPAIGN_AUDIENCES, default: 'all_orders' }) audience: string;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) bodyHtml: string;
  // 'active' = automated triggers (before_event/after_event/abandoned_order)
  // are evaluated by the cron each run. 'sent' is terminal, set once a
  // manual-trigger campaign has been fired. 'draft'/'paused' never fire.
  @Prop({ enum: ['draft', 'active', 'sent', 'paused'], default: 'draft' }) status: string;
  @Prop({ default: 0 }) sentCount: number;
  @Prop() lastRunAt: Date;
  @Prop({ required: true }) createdBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const CampaignSchema = SchemaFactory.createForClass(Campaign);
CampaignSchema.index({ schoolSlug: 1, eventId: 1 });
