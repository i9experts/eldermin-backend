import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type LeavePolicyDocument = LeavePolicy & Document;

@Schema({ timestamps: true, collection: 'leavePolicies' })
export class LeavePolicy {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string;
  @Prop({ enum: ['all', 'permanent', 'contract', 'part_time', 'visiting'], default: 'all' }) applicableTo: string;
  @Prop({ default: false }) isDefault: boolean;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 21 }) annualDays: number;
  @Prop({ default: 10 }) sickDays: number;
  @Prop({ default: 10 }) casualDays: number;
  @Prop({ default: 90 }) maternityDays: number;
  @Prop({ default: 10 }) paternityDays: number;
  @Prop({ default: 3 })  emergencyDays: number;
  @Prop({ default: 5 })  studyDays: number;
  @Prop({ default: 0 })  unpaidDays: number;
  @Prop({ default: 0 })  hajjDays: number;
  @Prop({ default: false }) allowCarryForward: boolean;
  @Prop({ default: 0 })  maxCarryForwardDays: number;
  @Prop({ default: false }) allowEncashment: boolean;
  @Prop({ default: 0 })  maxEncashmentDays: number;
  @Prop({ default: false }) allowedDuringProbation: boolean;
  @Prop({ default: 0 })  probationAnnualDays: number;
}

export const LeavePolicySchema = SchemaFactory.createForClass(LeavePolicy);
LeavePolicySchema.index({ tenantId: 1, code: 1 }, { unique: true });
