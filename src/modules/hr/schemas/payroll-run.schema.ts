import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type PayrollRunDocument = PayrollRun & Document;

@Schema({ timestamps: true, collection: 'payrollRuns' })
export class PayrollRun {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true }) month: number;
  @Prop({ required: true }) year: number;
  @Prop() periodLabel: string;
  @Prop({ enum: ['draft','processing','completed','approved','paid','cancelled'], default: 'draft' }) status: string;
  @Prop({ default: 0 }) totalEmployees: number;
  @Prop({ default: 0 }) totalGrossSalary: number;
  @Prop({ default: 0 }) totalDeductions: number;
  @Prop({ default: 0 }) totalNetSalary: number;
  @Prop({ default: 'PKR' }) currency: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) processedBy: Types.ObjectId;
  @Prop() processedAt: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) approvedBy: Types.ObjectId;
  @Prop() approvedAt: Date;
  @Prop() paymentDate: Date;
  @Prop() notes: string;
}
export const PayrollRunSchema = SchemaFactory.createForClass(PayrollRun);
PayrollRunSchema.index({ tenantId: 1, month: 1, year: 1 }, { unique: true });
PayrollRunSchema.index({ tenantId: 1, status: 1 });
