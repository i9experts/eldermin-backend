import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PromoCodeDocument = PromoCode & Document;

@Schema({ timestamps: true, collection: 'event_promo_codes' })
export class PromoCode {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Event' }) eventId: Types.ObjectId;
  @Prop({ required: true, uppercase: true, trim: true }) code: string;
  @Prop({ enum: ['percentage', 'flat'], required: true }) discountType: string;
  @Prop({ required: true }) discountValue: number;
  @Prop() maxUses: number; // null = unlimited
  @Prop({ default: 0 }) usedCount: number;
  @Prop() expiresAt: Date;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const PromoCodeSchema = SchemaFactory.createForClass(PromoCode);
PromoCodeSchema.index({ schoolSlug: 1, eventId: 1, code: 1 }, { unique: true });
