import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type ExitRecordDocument = ExitRecord & Document;

@Schema({ timestamps: true, collection: 'exitRecords' })
export class ExitRecord {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop() staffName: string;
  @Prop() employeeId: string;
  @Prop() designation: string;
  @Prop() department: string;
  @Prop({ enum: ['resignation','termination','retirement','contract_end','mutual_agreement','death','abandonment'], required: true }) exitType: string;
  @Prop({ required: true }) resignationDate: Date;
  @Prop({ required: true }) lastWorkingDay: Date;
  @Prop() reason: string;
  @Prop({ default: false }) noticePeriodServed: boolean;
  @Prop({ default: 0 }) noticePeriodDays: number;
  @Prop({ enum: ['pending','in_progress','completed'], default: 'pending' }) clearanceStatus: string;
  @Prop({
    type: [{
      department: String,
      item: String,
      isDone: Boolean,
      clearedBy: String,
      clearedAt: Date,
      _id: false,
    }],
    default: [],
  }) clearanceChecklist: any[];
  @Prop({ default: false }) exitInterviewDone: boolean;
  @Prop() exitInterviewDate: Date;
  @Prop() exitInterviewNotes: string;
  @Prop() wouldRehire: boolean;
  @Prop({ default: 0 }) finalSettlementAmount: number;
  @Prop() finalSettlementDate: Date;
  @Prop() gratuityAmount: number;
  @Prop() leaveEncashment: number;
  @Prop({ enum: ['pending','processing','paid'], default: 'pending' }) settlementStatus: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) processedBy: Types.ObjectId;
  @Prop() notes: string;
}
export const ExitRecordSchema = SchemaFactory.createForClass(ExitRecord);
ExitRecordSchema.index({ tenantId: 1, staffId: 1 }, { unique: true });
ExitRecordSchema.index({ tenantId: 1, clearanceStatus: 1 });
