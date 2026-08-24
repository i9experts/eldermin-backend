// ============================================================
// DEAL REGISTRATION — Eldermin Partner Network (Phase 2)
// Lets a partner lock in attribution for a prospective school before it
// signs up — the same purpose deal registration serves in every channel
// program: whoever registered the deal first gets the commission when it
// converts, so two partners (or a partner and a direct sales motion)
// can't both chase the same lead unknowingly.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DealRegistrationDocument = DealRegistration & Document;

@Schema({ timestamps: true, collection: 'reseller_deal_registrations' })
export class DealRegistration {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Reseller', index: true })
  resellerId: Types.ObjectId;

  @Prop() resellerName: string;

  @Prop({ required: true }) prospectName: string;
  @Prop() contactName: string;
  @Prop() contactEmail: string;
  @Prop() contactPhone: string;
  @Prop() city: string;
  @Prop() country: string;
  @Prop() estimatedInstitutionSize: number; // rough student count, for prioritization only
  @Prop() notes: string;

  @Prop({
    enum: ['registered', 'converted', 'expired', 'rejected'],
    default: 'registered',
    index: true,
  })
  status: string;

  @Prop({ required: true }) registeredAt: Date;
  // 90-day protection window, per the Economics guardrails — after this,
  // the deal is fair game for any partner (or direct) again unless
  // already converted.
  @Prop({ required: true, index: true }) protectionExpiresAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'Institution' })
  convertedInstitutionId: Types.ObjectId;
  @Prop() convertedAt: Date;

  @Prop() reviewedBy: string;
  @Prop() reviewNote: string;
}

export const DealRegistrationSchema = SchemaFactory.createForClass(DealRegistration);
DealRegistrationSchema.index({ resellerId: 1, status: 1 });
