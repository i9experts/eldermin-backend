import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type PayslipDocument = Payslip & Document;

@Schema({ timestamps: true, collection: 'payslips' })
export class Payslip {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'PayrollRun' }) payrollRunId: Types.ObjectId;
  @Prop() staffName: string;
  @Prop() employeeId: string;
  @Prop() designation: string;
  @Prop() department: string;
  @Prop({ required: true }) month: number;
  @Prop({ required: true }) year: number;
  @Prop() periodLabel: string;
  @Prop({ default: 0 }) basicSalary: number;
  @Prop({ default: 0 }) hra: number;
  @Prop({ default: 0 }) transportAllowance: number;
  @Prop({ default: 0 }) medicalAllowance: number;
  @Prop({ default: 0 }) otherAllowances: number;
  @Prop({ default: 0 }) grossSalary: number;
  @Prop({ default: 0 }) incomeTax: number;
  @Prop({ default: 0 }) providentFund: number;
  @Prop({ default: 0 }) loanDeduction: number;
  @Prop({ default: 0 }) leaveDeduction: number;
  @Prop({ default: 0 }) otherDeductions: number;
  @Prop({ default: 0 }) totalDeductions: number;
  @Prop({ default: 0 }) netSalary: number;
  @Prop({ default: 0 }) presentDays: number;
  @Prop({ default: 0 }) absentDays: number;
  @Prop({ default: 0 }) leaveDays: number;
  @Prop({ default: 'PKR' }) currency: string;
  @Prop({ enum: ['draft','issued','paid'], default: 'draft' }) status: string;
  @Prop() paidAt: Date;
  @Prop() s3Key: string;
}
export const PayslipSchema = SchemaFactory.createForClass(Payslip);
PayslipSchema.index({ tenantId: 1, staffId: 1, month: 1, year: 1 }, { unique: true });
PayslipSchema.index({ tenantId: 1, payrollRunId: 1 });
