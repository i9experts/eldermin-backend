import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdvanceDocument = Advance & Document;

// Money given to a staff member ahead of an expense (e.g. before a trip),
// to be settled later either by an ExpenseClaim referencing it or by
// direct payroll deduction if unspent.
@Schema({ timestamps: true, collection: 'hr_advances' })
export class Advance {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) advanceNo: string; // e.g. ADV-2026-0001

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff', index: true }) staffId: Types.ObjectId;
  @Prop() staffName: string;

  @Prop({ required: true }) reason: string;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 'PKR' }) currency: string;
  @Prop({ required: true }) requestedDate: Date;
  @Prop() expectedSettlementDate: Date;

  @Prop({ enum: ['requested', 'approved', 'rejected', 'disbursed', 'settled', 'partially_settled'], default: 'requested' }) status: string;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;
  @Prop() disbursedAt: Date;

  @Prop({ default: 0 }) settledAmount: number; // sum of linked ExpenseClaims + any direct payroll deduction
}

export const AdvanceSchema = SchemaFactory.createForClass(Advance);
AdvanceSchema.index({ schoolSlug: 1, status: 1 });
AdvanceSchema.index({ tenantId: 1, advanceNo: 1 }, { unique: true });
