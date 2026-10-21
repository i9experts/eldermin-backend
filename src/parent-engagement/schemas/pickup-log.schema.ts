// ============================================================
// PICKUP LOG — daily gate/class-staff record of a child's actual
// pickup time, feeding the Parent Engagement Score's "timely
// pickup/drop-off" dimension. New, minimal, mirrors the Student
// Attendance Register's per-day-per-student shape.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PickupLogDocument = PickupLog & Document;

@Schema({ timestamps: true, collection: 'pickup_logs' })
export class PickupLog {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop({ required: true }) date: Date; // same convention as StudentAttendance.date
  @Prop() scheduledPickupTime: string; // HH:mm, optional — school's expected dismissal time
  @Prop() actualPickupTime: string; // HH:mm
  // Explicit, not purely derived from the time comparison, so a staff
  // member can flag "late" even without an exact scheduled time on file
  // (e.g. "parent was 20 min late, I don't have the exact cutoff logged").
  @Prop({ default: false }) markedLate: boolean;
  @Prop() notes: string;
  @Prop() markedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) markedByUserId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const PickupLogSchema = SchemaFactory.createForClass(PickupLog);
PickupLogSchema.index({ schoolSlug: 1, studentId: 1, date: 1 }, { unique: true });
PickupLogSchema.index({ schoolSlug: 1, grade: 1, section: 1, date: 1 });
