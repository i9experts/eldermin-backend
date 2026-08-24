// ============================================================
// COMMISSION POSTING — Eldermin Partner Network (Phase 2)
// One row per (reseller, institution, periodMonth) — the natural key
// that makes the commission batch idempotent (mirrors the payroll
// batch's {tenantId, staffId, month, year} dedupe key): re-running the
// batch for a period that was already posted skips every row it already
// posted rather than double-posting. The actual double-entry lives in
// Finance's journal collection (see resellers.service.ts
// safePostCommissionJournal) — this row is the reseller-program-facing
// record of that posting, with journalEntryId as the pointer back to it.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommissionPostingDocument = CommissionPosting & Document;

@Schema({ timestamps: true, collection: 'reseller_commission_postings' })
export class CommissionPosting {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Reseller', index: true })
  resellerId: Types.ObjectId;

  @Prop() resellerName: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution', index: true })
  institutionId: Types.ObjectId;

  @Prop() institutionName: string;

  // 'YYYY-MM' — the calendar month this posting covers.
  @Prop({ required: true, index: true }) periodMonth: string;

  @Prop({ enum: ['A', 'B'], required: true }) track: string;

  @Prop({ required: true }) revenueAmount: number;
  @Prop({ required: true }) rateApplied: number; // % — commissionRateYear1 (Track A) or wholesaleDiscount (Track B)
  @Prop({ required: true }) amount: number; // the posted commission/wholesale amount

  @Prop({ type: Types.ObjectId, ref: 'JournalEntry' })
  journalEntryId: Types.ObjectId;

  @Prop({ enum: ['posted', 'reversed'], default: 'posted' })
  status: string;

  @Prop() postedBy: string;
  @Prop() postedAt: Date;
}

export const CommissionPostingSchema = SchemaFactory.createForClass(CommissionPosting);
// The idempotency guarantee itself — a duplicate insert for the same
// (reseller, institution, period) fails at the database level even if a
// race condition slipped past the findOne pre-check in the batch runner.
CommissionPostingSchema.index({ resellerId: 1, institutionId: 1, periodMonth: 1 }, { unique: true });
