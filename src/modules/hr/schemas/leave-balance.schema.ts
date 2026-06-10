import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type LeaveBalanceDocument = LeaveBalance & Document;

@Schema({ timestamps: true, collection: 'leaveBalances' })
export class LeaveBalance {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'AcademicYear' }) academicYearId: Types.ObjectId;
  @Prop({ default: 21 }) annualEntitled: number;
  @Prop({ default: 0 }) annualUsed: number;
  @Prop({ default: 10 }) sickEntitled: number;
  @Prop({ default: 0 }) sickUsed: number;
  @Prop({ default: 10 }) casualEntitled: number;
  @Prop({ default: 0 }) casualUsed: number;
  @Prop({ default: 90 }) maternityEntitled: number;
  @Prop({ default: 0 }) maternityUsed: number;
  @Prop({ default: 10 }) paternityEntitled: number;
  @Prop({ default: 0 }) paternityUsed: number;
  @Prop({ default: 0 }) unpaidUsed: number;
}
export const LeaveBalanceSchema = SchemaFactory.createForClass(LeaveBalance);
LeaveBalanceSchema.index({ tenantId: 1, staffId: 1, academicYearId: 1 }, { unique: true });
