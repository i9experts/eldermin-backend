import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// SUBSTITUTION / FIXTURE MANAGEMENT
// ============================================================
// Real absence-to-substitution workflow, matching EDAP's "Fixture
// Management" depth: when a teacher is absent, every period they were
// due to teach on that specific date becomes an open fixture needing
// coverage. A substitute is suggested by real availability (no
// conflicting period at the same day+slot) and workload (how close they
// already are to their own max periods), then assigned and notified.
//
// One record per (date, timetable, periodNo) - a teacher absent all day
// generates one Substitution per period they were scheduled to teach,
// not one blanket record for the whole day, since each period may get a
// different substitute.
// ============================================================

export type SubstitutionDocument = Substitution & Document;

@Schema({ timestamps: true, collection: 'substitutions' })
export class Substitution {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;

  @Prop({ required: true }) date: Date; // the specific calendar date this fixture applies to
  @Prop({ required: true, min: 0, max: 6 }) dayOfWeek: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Timetable' }) timetableId: Types.ObjectId;
  @Prop({ required: true }) periodNo: number;
  @Prop() startTime: string;
  @Prop() endTime: string;
  @Prop({ required: true }) gradeLevel: string;
  @Prop({ required: true }) sectionName: string;
  @Prop() subject: string;
  @Prop() roomNo: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) originalTeacherId: Types.ObjectId;
  @Prop({ required: true }) originalTeacherName: string;

  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null }) substituteTeacherId: Types.ObjectId | null;
  @Prop() substituteTeacherName: string;

  @Prop({ enum: ['absence', 'leave', 'training', 'other'], default: 'absence' }) reason: string;
  @Prop({ type: Types.ObjectId, ref: 'LeaveApplication', default: null }) leaveApplicationId: Types.ObjectId | null;

  // 'open' = needs a substitute, none assigned yet - staying in this
  // state is exactly what EDAP's deck calls "Lesson Shortfall".
  @Prop({ enum: ['open', 'assigned', 'completed', 'cancelled'], default: 'open' }) status: string;

  @Prop() assignedBy: string;
  @Prop() assignedAt: Date;
  @Prop() notifiedAt: Date;
  @Prop() notificationStatus: string; // honest outcome of the notify attempt, e.g. "sent" or "no email on file"
  @Prop() notes: string;
}

export const SubstitutionSchema = SchemaFactory.createForClass(Substitution);
SubstitutionSchema.index({ tenantId: 1, date: 1, timetableId: 1, periodNo: 1 }, { unique: true });
SubstitutionSchema.index({ tenantId: 1, originalTeacherId: 1, date: 1 });
SubstitutionSchema.index({ tenantId: 1, substituteTeacherId: 1, date: 1 });
SubstitutionSchema.index({ tenantId: 1, status: 1 });
