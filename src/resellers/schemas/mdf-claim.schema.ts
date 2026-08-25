// ============================================================
// MDF CLAIM — Eldermin Partner Network (Phase 3)
// A partner's request to draw down their Marketing Development Fund
// budget (see Reseller.mdfAllocatedAmount) for a specific co-marketing
// activity. Mirrors ProvisioningRequest's review shape (partner submits
// -> Super Admin reviews) and, once approved, settles like any other
// payable — see resellers.service.ts payMdfClaim, which follows the same
// FinanceService.recordVendorPayment-derived pattern as the Commission
// Engine and Payroll's payment action.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MdfClaimDocument = MdfClaim & Document;

@Schema({ timestamps: true, collection: 'reseller_mdf_claims' })
export class MdfClaim {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Reseller', index: true })
  resellerId: Types.ObjectId;

  @Prop() resellerName: string;
  @Prop() fiscalYear: number;

  @Prop({
    enum: ['digital_ads', 'print', 'event', 'signage', 'collateral', 'other'],
    default: 'other',
  })
  activityType: string;

  @Prop({ required: true }) description: string;
  @Prop({ required: true }) amountRequested: number;
  @Prop() amountApproved: number;
  @Prop() receiptUrl: string;

  @Prop({
    enum: ['pending_review', 'approved', 'rejected', 'paid'],
    default: 'pending_review',
    index: true,
  })
  status: string;

  @Prop() submittedBy: string;
  @Prop() reviewedBy: string;
  @Prop() reviewedAt: Date;
  @Prop() reviewNote: string;

  @Prop() paymentMethod: string;
  @Prop() bankAccountId: string;
  @Prop() bankAccountName: string;
  @Prop() referenceNumber: string;
  @Prop() paidAt: Date;
  @Prop() paidBy: string;
}

export const MdfClaimSchema = SchemaFactory.createForClass(MdfClaim);
MdfClaimSchema.index({ resellerId: 1, fiscalYear: 1, status: 1 });
