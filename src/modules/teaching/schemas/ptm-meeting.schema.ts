import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// PARENT-TEACHER MEETING (PTM)
// ============================================================
// Real scheduling + documentation workflow, matching EDAP's own
// E-Plan -> E-Alert -> E-Schedule -> E-Management framing:
//   E-Plan     -> discussionPoints set at scheduling time
//   E-Alert    -> a real notification attempt to the guardian on file
//   E-Schedule -> scheduledDate/startTime/endTime, status lifecycle
//   E-Management -> meetingNotes, actionItems, attended, full history
// per student across every past meeting.
// ============================================================

@Schema({ _id: true })
export class PTMActionItem {
  @Prop({ required: true }) description: string;
  @Prop() assignedTo: string; // free text: "Teacher", "Parent", a specific name
  @Prop() dueDate: Date;
  @Prop({ enum: ['pending', 'done'], default: 'pending' }) status: string;
}
export const PTMActionItemSchema = SchemaFactory.createForClass(PTMActionItem);

export type PTMMeetingDocument = PTMMeeting & Document;

@Schema({ timestamps: true, collection: 'ptm_meetings' })
export class PTMMeeting {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) gradeLevel: string;
  @Prop() sectionName: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) teacherId: Types.ObjectId;
  @Prop({ required: true }) teacherName: string;

  @Prop({ required: true }) scheduledDate: Date;
  @Prop() startTime: string;
  @Prop() endTime: string;

  // Denormalized from the student's own guardian records at scheduling
  // time - who this meeting is actually with.
  @Prop() guardianName: string;
  @Prop() guardianPhone: string;
  @Prop() guardianEmail: string;

  @Prop({ enum: ['requested', 'confirmed', 'completed', 'cancelled', 'no_show'], default: 'requested' }) status: string;
  @Prop({ required: true }) academicYear: string;

  // E-Plan - the agenda, set when scheduling, so both sides know why
  // they're meeting before it happens.
  @Prop({ type: [String], default: [] }) discussionPoints: string[];

  // E-Management - what actually happened.
  @Prop() meetingNotes: string;
  @Prop({ type: [PTMActionItemSchema], default: [] }) actionItems: PTMActionItem[];
  @Prop({ default: false }) parentAttended: boolean;

  @Prop() requestedBy: string;
  @Prop() notifiedAt: Date;
  @Prop() notificationStatus: string; // honest outcome: "sent" | "failed" | "no email on file"

  @Prop() cancelledReason: string;
  @Prop() cancelledBy: string;
}

export const PTMMeetingSchema = SchemaFactory.createForClass(PTMMeeting);
PTMMeetingSchema.index({ tenantId: 1, studentId: 1, scheduledDate: -1 });
PTMMeetingSchema.index({ tenantId: 1, teacherId: 1, scheduledDate: -1 });
PTMMeetingSchema.index({ tenantId: 1, status: 1, scheduledDate: 1 });
