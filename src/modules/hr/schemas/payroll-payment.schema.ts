// ============================================================
// PAYROLL PAYMENT — the actual bank/cash settlement of an approved
// payroll run's Salaries Payable liability. Mirrors VendorPayment
// (src/finance/schemas/vendor.schema.ts) — every other "settle a
// payable via bank or cash" flow in this codebase creates its own
// payment record for audit trail rather than just flipping a status
// field, so payroll follows the same convention.
// ============================================================
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PayrollPaymentDocument = PayrollPayment & Document;

@Schema({ timestamps: true, collection: 'payroll_payments' })
export class PayrollPayment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'PayrollRun' }) payrollRunId: Types.ObjectId;
  @Prop() periodLabel: string;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) paymentDate: Date;
  @Prop({
    enum: ['cash', 'bank_transfer', 'cheque', 'online', 'card', 'mobile_wallet'],
    default: 'bank_transfer',
  })
  paymentMethod: string;
  @Prop() referenceNumber: string;
  // Omitted entirely for cash — mirrors VendorPayment/Payment's convention
  // that cash has no BankAccount record, just the '1000' COA code.
  @Prop() bankAccountId: string;
  @Prop() bankAccountName: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) paidBy: Types.ObjectId;
}

export const PayrollPaymentSchema = SchemaFactory.createForClass(PayrollPayment);
PayrollPaymentSchema.index({ tenantId: 1, payrollRunId: 1 });
