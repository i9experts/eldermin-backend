import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AttendanceSettingsDocument = AttendanceSettings & Document;

// The configuration layer over attendance, beyond the existing biometric
// device config: grace period, late-marking threshold, and half-day
// cutoff, so status can actually be computed from a real check-in time
// instead of every imported row silently defaulting to "present".
@Schema({ timestamps: true, collection: 'hr_attendance_settings' })
export class AttendanceSettings {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true, unique: true }) schoolSlug: string;

  @Prop({ default: '08:00' }) standardCheckInTime: string; // "HH:mm", 24h
  @Prop({ default: 15 }) graceMinutes: number; // check-ins within this many minutes after standardCheckInTime still count as on-time
  @Prop({ default: 60 }) lateThresholdMinutes: number; // beyond grace but within this many minutes = 'late'; beyond this = 'half_day'
  @Prop({ default: '13:00' }) halfDayCutoffTime: string; // check-in after this time (even same day) = 'half_day' regardless of the minute thresholds above
  @Prop({ type: [String], default: ['mon', 'tue', 'wed', 'thu', 'fri'] }) workingDays: string[];
}

export const AttendanceSettingsSchema = SchemaFactory.createForClass(AttendanceSettings);
