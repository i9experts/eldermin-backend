import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeeInvoiceDocument = FeeInvoice & Document;

@Schema({ timestamps: true, collection: 'feeInvoices' })
export class FeeInvoice {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Campus' })
  campusId: Types.ObjectId;

  @Prop({ required: true })
  invoiceNo: string;

  @Prop({ type: Types.ObjectId, ref: 'Student' })
  studentId: Types.ObjectId;

  @Prop()
  studentName: string;

  @Prop()
  admissionNo: string;

  @Prop()
  gradeLevelName: string;

  @Prop({ required: true })
  issueDate: Date;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ type: [{ description: String, amount: Number, feeHeadCode: String, _id: false }], default: [] })
  items: any[];

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ default: 0 })
  paidAmount: number;

  @Prop({ required: true })
  balanceAmount: number;

  @Prop({ enum: ['draft','issued','partially_paid','paid','overdue','cancelled'], default: 'draft' })
  status: string;

  @Prop()
  periodLabel: string;

  @Prop({ default: 'USD' })
  currency: string;
}

export const FeeInvoiceSchema = SchemaFactory.createForClass(FeeInvoice);
FeeInvoiceSchema.index({ tenantId: 1, invoiceNo: 1 }, { unique: true });
FeeInvoiceSchema.index({ tenantId: 1, status: 1, dueDate: 1 });
