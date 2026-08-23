import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ShiftDocument = Shift & Document;

// A school-defined work shift — start/end time, grace period, and which
// days it applies to. Staff get assigned a shift (Staff.shiftId); attendance
// status is then computed against THEIR shift instead of one single global
// standardCheckInTime for the whole school, which breaks down the moment a
// school has staff on different schedules (admin vs teaching staff, or a
// boarding school with rotating duty shifts).
@Schema({ timestamps: true, collection: 'hr_shifts' })
export class Shift {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) name: string; // e.g. "Morning Shift", "Admin Hours"
  @Prop({ required: true }) startTime: string; // "HH:mm", 24h
  @Prop({ required: true }) endTime: string; // "HH:mm", 24h
  @Prop({ default: 15 }) graceMinutes: number;
  @Prop({ default: 60 }) lateThresholdMinutes: number;
  @Prop() halfDayCutoffTime: string; // optional override; falls back to school AttendanceSettings.halfDayCutoffTime if unset
  @Prop({ type: [String], default: ['mon', 'tue', 'wed', 'thu', 'fri'] }) applicableDays: string[];
  // Only meaningful when 'sat' is in applicableDays - schools vary widely:
  // some work every Saturday, some alternate weeks, some close one specific
  // Saturday a month (commonly the last one). 'all_except_nth' with
  // saturdayOffOccurrence=5 means "the last Saturday of the month", correctly
  // resolved per-month rather than hardcoded to a fixed date-of-month, since
  // a month can have either 4 or 5 Saturdays.
  @Prop({ enum: ['all', 'alternate_odd', 'alternate_even', 'all_except_nth'], default: 'all' })
  saturdayPolicy: string;
  @Prop({ min: 1, max: 5 }) saturdayOffOccurrence: number; // 1-4 = that occurrence, 5 = "last" regardless of whether the month has 4 or 5 Saturdays
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: false }) isDefault: boolean; // the shift assigned to staff who haven't been explicitly assigned one
}

export const ShiftSchema = SchemaFactory.createForClass(Shift);
ShiftSchema.index({ schoolSlug: 1, isActive: 1 });
