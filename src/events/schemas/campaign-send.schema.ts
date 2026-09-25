import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CampaignSendDocument = CampaignSend & Document;

// One row per (campaign, order) actually emailed - the dedupe log that
// lets the cron re-evaluate every 'active' campaign on every tick without
// re-sending to someone it already reached (same idempotency-via-log
// pattern as AccountingSyncLog).
@Schema({ timestamps: true, collection: 'event_campaign_sends' })
export class CampaignSend {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Campaign' }) campaignId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Order' }) orderId: Types.ObjectId;
  @Prop({ required: true }) sentAt: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const CampaignSendSchema = SchemaFactory.createForClass(CampaignSend);
CampaignSendSchema.index({ campaignId: 1, orderId: 1 }, { unique: true });
