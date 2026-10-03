import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SecurityDepositDocument = SecurityDeposit & Document;

// Standard Pakistani-school practice: a fixed amount or percentage of
// salary is withheld from a staff member's pay each period (for a set
// duration, or indefinitely until they leave) and refunded to them at
// departure. Modeled as a plan (this document) + an append-only
// transactions log (deductions and the eventual refund), so the running
// balance is always a straight sum of real entries, not a recomputation
// that could drift from what was actually deducted.
@Schema({ _id: false })
class DepositTransaction {
  @Prop({ required: true, enum: ['deduction', 'refund', 'forfeiture', 'adjustment'] }) type: string;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) date: Date;
  @Prop() periodLabel: string; // e.g. "March 2026", set for payroll-period deductions
  @Prop({ type: Types.ObjectId, ref: 'Payslip' }) payslipId: Types.ObjectId | null;
  @Prop() notes: string;
  @Prop() recordedBy: string;
}
const DepositTransactionSchema = SchemaFactory.createForClass(DepositTransaction);

@Schema({ timestamps: true, collection: 'hr_security_deposits' })
export class SecurityDeposit {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff', index: true }) staffId: Types.ObjectId;
  @Prop() staffName: string;
  @Prop() employeeId: string;
  @Prop() designation: string;
  @Prop() department: string;
  @Prop() campus: string;

  // How each period's deduction is computed. 'fixed' deducts fixedAmount
  // every period; 'percentage' deducts percentOfSalary% of the staff's
  // current Staff.salary at the time each deduction is recorded (so a
  // later raise correctly changes the deducted amount going forward).
  @Prop({ required: true, enum: ['fixed', 'percentage'] }) deductionType: string;
  @Prop({ default: 0 }) fixedAmount: number;
  @Prop({ default: 0 }) percentOfSalary: number;

  @Prop({ required: true }) startDate: Date;
  // Null/unset = deduct indefinitely until manually stopped or the staff
  // departs. Set = plan auto-completes (no further deductions expected)
  // once this many periods have been deducted — see durationMonths.
  @Prop({ type: Number, default: null }) durationMonths: number | null;

  @Prop({ default: 0 }) targetAmount: number; // optional cap - 0 means no cap, deduct per plan until stopped
  @Prop({ default: 0 }) accumulatedAmount: number; // running balance - sum of transactions, kept denormalized for fast listing

  @Prop({
    enum: ['active', 'completed', 'refunded', 'forfeited'],
    default: 'active',
  })
  status: string;

  @Prop() refundDate: Date;
  @Prop() refundAmount: number;
  @Prop() refundNotes: string;
  @Prop() refundedBy: string;

  @Prop({ type: [DepositTransactionSchema], default: [] }) transactions: DepositTransaction[];

  @Prop() notes: string;
  @Prop() createdBy: string;
}

export const SecurityDepositSchema = SchemaFactory.createForClass(SecurityDeposit);
SecurityDepositSchema.index({ schoolSlug: 1, staffId: 1 });
SecurityDepositSchema.index({ schoolSlug: 1, status: 1 });
