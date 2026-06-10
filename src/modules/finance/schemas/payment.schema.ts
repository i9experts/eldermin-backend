import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true, collection: 'payments' })
export class Payment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  receiptNo: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'FeeInvoice' })
  invoiceId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Student' })
  studentId: Types.ObjectId;

  @Prop()
  studentName: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ required: true })
  paymentDate: Date;

  @Prop({ enum: ['cash','cheque','bank_transfer','card','online_gateway','mobile_wallet'], default: 'cash' })
  method: string;

  @Prop()
  transactionRef: string;

  @Prop({ enum: ['pending','completed','failed','reversed'], default: 'completed' })
  status: string;

  @Prop({ default: false })
  isRefund: boolean;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ tenantId: 1, receiptNo: 1 }, { unique: true });
PaymentSchema.index({ tenantId: 1, invoiceId: 1 });
