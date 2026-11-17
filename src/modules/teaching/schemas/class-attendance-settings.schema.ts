import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ClassAttendanceSettingsDocument = ClassAttendanceSettings & Document;

// School-wide policy for how class attendance is marked - one document
// per school. Deliberately a separate, tiny collection of its own rather
// than another field crammed onto School/Tenant: this is Teaching
// Management's own setting, read by the attendance-marking screen and
// endpoints, not a general institution profile field. Also unrelated to
// hr/schemas/attendance-settings.schema.ts, which configures STAFF
// biometric check-in (grace periods, late thresholds, payroll
// deductions) - a different domain entirely that happens to share a
// generic name.
//
// The class (= the Mongoose model name registered by @nestjs/mongoose) is deliberately NOT called AttendanceSettings:
// both schemas used that name, @nestjs/mongoose silently hands the SECOND registrant the FIRST model, so this module's
// reads/writes went to HR's `hr_attendance_settings` collection (strict schema dropped `mode`, so the mode never
// persisted). See schema-model-names.spec.ts, which fails if two schema classes ever share a name again.
@Schema({ timestamps: true, collection: 'class_attendance_settings' })
export class ClassAttendanceSettings {
  @Prop({ required: true, unique: true }) schoolSlug: string;

  // 'daily': one present/absent/.../status per student per day (today's
  // only real mode, unchanged default). 'subject_wise': a class teacher
  // (or subject teacher, in a later phase) marks attendance separately
  // per subject for the same day - multiple StudentAttendance records
  // per student per day, one per subject, each a real, independently
  // queryable record. Period-wise (tying attendance to actual timetable
  // periods) is a deliberate follow-up, not included yet - it needs a
  // real integration with the Timetable Intelligence solver's period
  // definitions, which is a larger, separate effort.
  @Prop({ enum: ['daily', 'subject_wise'], default: 'daily' }) mode: string;

  @Prop() updatedBy: string;
}

export const ClassAttendanceSettingsSchema = SchemaFactory.createForClass(ClassAttendanceSettings);
