import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GrievanceDocument = Grievance & Document;

// Deliberately narrow first version: a status workflow and basic case
// tracking, not a full investigation/case-management toolkit. Expand later
// if schools actually use this.
@Schema({ timestamps: true, collection: 'hr_grievances' })
export class Grievance {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) caseNo: string; // e.g. GRV-2026-0001

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) raisedByStaffId: Types.ObjectId;
  @Prop() raisedByName: string;

  @Prop({
    enum: ['harassment', 'discrimination', 'workplace_conflict', 'compensation', 'safety', 'policy_violation', 'other'],
    default: 'other',
  })
  category: string;

  @Prop({ required: true }) description: string;
  @Prop({ default: false }) isConfidential: boolean; // hides raisedByName from anyone but the assigned handler + super-admin

  @Prop({ type: Types.ObjectId, ref: 'Staff' }) assignedToStaffId: Types.ObjectId;
  @Prop() assignedToName: string;

  @Prop({
    enum: ['submitted', 'investigating', 'resolved', 'escalated', 'dismissed'],
    default: 'submitted',
  })
  status: string;

  @Prop({
    type: [{ note: String, byName: String, status: String, at: { type: Date, default: Date.now }, _id: false }],
    default: [],
  })
  timeline: { note: string; byName: string; status: string; at: Date }[];

  @Prop() resolutionNotes: string;
  @Prop() resolvedAt: Date;
}

export const GrievanceSchema = SchemaFactory.createForClass(Grievance);
GrievanceSchema.index({ schoolSlug: 1, status: 1 });
GrievanceSchema.index({ tenantId: 1, caseNo: 1 }, { unique: true });
