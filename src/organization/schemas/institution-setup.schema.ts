// ============================================================
// INSTITUTION SETUP SCHEMAS — Board Members, Committees,
// Meetings, Workflows | Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// BOARD MEMBER
// ============================================================
export type BoardMemberDocument = BoardMember & Document;

@Schema({ timestamps: true, collection: 'board_members' })
export class BoardMember {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) firstName: string;
  @Prop({ required: true }) lastName: string;
  @Prop({ lowercase: true, trim: true }) email: string;
  @Prop() phone: string;

  @Prop({
    required: true,
    enum: ['chair', 'vice-chair', 'secretary', 'treasurer', 'member'],
    default: 'member',
  })
  boardRole: string;

  @Prop() designation: string;
  @Prop() appointedDate: Date;
  @Prop() tenure: string;

  @Prop({ enum: ['active', 'inactive'], default: 'active' })
  status: string;

  @Prop() notes: string;
}

export const BoardMemberSchema = SchemaFactory.createForClass(BoardMember);
BoardMemberSchema.index({ schoolSlug: 1, status: 1 });

// ============================================================
// COMMITTEE
// ============================================================
export type CommitteeDocument = Committee & Document;

@Schema({ timestamps: true, collection: 'committees' })
export class Committee {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) name: string;

  @Prop({
    required: true,
    enum: ['academic', 'finance', 'disciplinary', 'examination', 'sports', 'other'],
    default: 'other',
  })
  type: string;

  @Prop() purpose: string;
  @Prop() chairperson: string;
  @Prop({ type: [String], default: [] }) members: string[];
  @Prop() establishedDate: Date;

  @Prop({ enum: ['active', 'inactive'], default: 'active' })
  status: string;

  @Prop() meetingFrequency: string;
}

export const CommitteeSchema = SchemaFactory.createForClass(Committee);
CommitteeSchema.index({ schoolSlug: 1, status: 1 });

// ============================================================
// MEETING
// ============================================================
export type MeetingDocument = Meeting & Document;

@Schema({ timestamps: true, collection: 'meetings' })
export class Meeting {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) title: string;

  @Prop({
    required: true,
    enum: ['board', 'committee', 'staff', 'parent', 'emergency', 'other'],
    default: 'other',
  })
  type: string;

  @Prop({ required: true }) scheduledAt: Date;
  @Prop() venue: string;
  @Prop() agenda: string;
  @Prop({ type: [String], default: [] }) attendees: string[];

  @Prop({ enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' })
  status: string;

  @Prop() minutes: string;
  @Prop({ type: [String], default: [] }) actionItems: string[];
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);
MeetingSchema.index({ schoolSlug: 1, type: 1 });
MeetingSchema.index({ schoolSlug: 1, scheduledAt: 1 });

// ============================================================
// WORKFLOW
// ============================================================
export type WorkflowDocument = Workflow & Document;

@Schema({ _id: false })
class WorkflowStep {
  @Prop({ required: true }) order: number;
  @Prop({ required: true }) approverRole: string;
  @Prop() sla: string;
}
const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

@Schema({ timestamps: true, collection: 'workflows' })
export class Workflow {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) name: string;

  @Prop({
    required: true,
    enum: ['Finance', 'HR', 'Admissions', 'Procurement', 'Documents'],
  })
  module: string;

  @Prop() trigger: string;
  @Prop({ type: [WorkflowStepSchema], default: [] }) steps: WorkflowStep[];
  @Prop() sla: string;

  @Prop({ enum: ['active', 'inactive'], default: 'active' })
  status: string;

  @Prop() description: string;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
WorkflowSchema.index({ schoolSlug: 1, module: 1 });
