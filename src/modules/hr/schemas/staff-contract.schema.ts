import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type StaffContractDocument = StaffContract & Document;

@Schema({ timestamps: true, collection: 'staffContracts' })
export class StaffContract {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ index: true }) schoolSlug: string;
  @Prop() staffName: string;
  @Prop() contractNo: string;
  @Prop({ enum: ['permanent','fixed_term','probationary','part_time','visiting','renewal'], required: true }) type: string;
  @Prop() designation: string;
  @Prop() department: string;
  @Prop({ required: true }) startDate: Date;
  @Prop() endDate: Date;
  @Prop({ default: 0 }) grossSalary: number;
  @Prop({ default: 'USD' }) currency: string;
  @Prop({ default: 30 }) noticePeriodDays: number;
  @Prop({ default: 40 }) workingHoursPerWeek: number;
  @Prop() termsAndConditions: string;
  @Prop() contractS3Key: string;
  @Prop({ enum: ['draft','sent','signed','active','expired','terminated'], default: 'draft' }) status: string;
  @Prop() signedAt: Date;
  @Prop() expiresAt: Date;
  @Prop({ default: false }) autoRenew: boolean;
  @Prop({ default: 30 }) renewalNotifyDays: number;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}
export const StaffContractSchema = SchemaFactory.createForClass(StaffContract);
StaffContractSchema.index({ tenantId: 1, staffId: 1, status: 1 });
StaffContractSchema.index({ tenantId: 1, contractNo: 1 }, { unique: true, sparse: true });
StaffContractSchema.index({ tenantId: 1, expiresAt: 1, status: 1 });
