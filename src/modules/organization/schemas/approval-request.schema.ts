import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApprovalRequestDocument = ApprovalRequest & Document;

@Schema({ timestamps: true, collection: 'approvalRequests' })
export class ApprovalRequest {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ enum: ['policy', 'budget', 'hiring', 'procurement', 'other'], default: 'other' })
  category: string;

  @Prop({ enum: ['pending', 'approved', 'rejected', 'on_hold'], default: 'pending' })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  requestedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  decidedBy: Types.ObjectId;

  @Prop()
  decidedAt: Date;

  @Prop()
  decisionNote: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const ApprovalRequestSchema = SchemaFactory.createForClass(ApprovalRequest);
ApprovalRequestSchema.index({ tenantId: 1, status: 1 });
ApprovalRequestSchema.index({ tenantId: 1, requestedBy: 1 });
