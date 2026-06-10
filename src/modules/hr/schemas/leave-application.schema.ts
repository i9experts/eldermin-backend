import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type LeaveApplicationDocument = LeaveApplication & Document;

@Schema({ timestamps: true, collection: 'leaveApplications' })
export class LeaveApplication {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop() staffName: string;
  @Prop() staffEmployeeId: string;
  @Prop() department: string;
  @Prop() leaveNo: string;
  @Prop({ enum: ['annual','sick','casual','maternity','paternity','emergency','unpaid','study','other'], required: true }) leaveType: string;
  @Prop({ required: true }) fromDate: Date;
  @Prop({ required: true }) toDate: Date;
  @Prop({ required: true }) totalDays: number;
  @Prop({ default: false }) isHalfDay: boolean;
  @Prop({ enum: ['morning','afternoon'] }) halfDaySession: string;
  @Prop({ required: true }) reason: string;
  @Prop() coveringStaffId: string;
  @Prop() coveringStaffName: string;
  @Prop() attachmentS3Key: string;
  @Prop({ enum: ['pending','approved','rejected','cancelled','on_hold'], default: 'pending' }) status: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) approvedBy: Types.ObjectId;
  @Prop() approverName: string;
  @Prop() approvedAt: Date;
  @Prop() approverNote: string;
  @Prop() rejectionReason: string;
  @Prop({ type: Types.ObjectId, ref: 'WorkflowInstance', default: null }) workflowInstanceId: Types.ObjectId;
}
export const LeaveApplicationSchema = SchemaFactory.createForClass(LeaveApplication);
LeaveApplicationSchema.index({ tenantId: 1, staffId: 1, status: 1 });
LeaveApplicationSchema.index({ tenantId: 1, status: 1, fromDate: 1 });
LeaveApplicationSchema.index({ tenantId: 1, leaveNo: 1 }, { unique: true, sparse: true });
