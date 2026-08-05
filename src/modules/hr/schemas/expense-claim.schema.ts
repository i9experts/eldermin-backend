import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExpenseClaimDocument = ExpenseClaim & Document;

// Employee-facing reimbursement claim — distinct from the Finance module's
// Expense schema, which tracks institutional spending (vendor bills, etc).
// This is "I spent my own money for work, reimburse me" or "I'm settling
// an advance I was given."
@Schema({ timestamps: true, collection: 'hr_expense_claims' })
export class ExpenseClaim {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) claimNo: string; // e.g. EXP-2026-0001

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff', index: true }) staffId: Types.ObjectId;
  @Prop() staffName: string;

  @Prop({
    enum: ['travel', 'meals', 'supplies', 'training', 'transport', 'accommodation', 'other'],
    default: 'other',
  })
  category: string;

  @Prop({ required: true }) description: string;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 'PKR' }) currency: string;
  @Prop({ required: true }) expenseDate: Date;

  @Prop({ type: [{ label: String, url: String, key: String, fileName: String, _id: false }], default: [] })
  receipts: { label: string; url: string; key: string; fileName: string }[];

  // If this claim is settling an advance taken earlier, link it — the
  // approved reimbursement amount nets against the outstanding advance
  // instead of being paid out again on top of it.
  @Prop({ type: Types.ObjectId, ref: 'Advance', default: null }) advanceId: Types.ObjectId | null;

  @Prop({ enum: ['draft', 'submitted', 'approved', 'rejected', 'paid'], default: 'submitted' }) status: string;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;
  @Prop() rejectionReason: string;

  // How this gets settled: netted into the employee's next payslip (v1:
  // folded into "Other Allowances", same bucketing pattern used for custom
  // salary components) or paid out directly by Finance outside payroll.
  @Prop({ enum: ['payroll', 'direct'], default: 'payroll' }) settlementMethod: string;
  @Prop({ default: false }) settledInPayroll: boolean;
  @Prop() settledPayslipId: Types.ObjectId;
}

export const ExpenseClaimSchema = SchemaFactory.createForClass(ExpenseClaim);
ExpenseClaimSchema.index({ schoolSlug: 1, status: 1 });
ExpenseClaimSchema.index({ tenantId: 1, claimNo: 1 }, { unique: true });
