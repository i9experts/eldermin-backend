import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type AttendanceCorrectionRequestDocument = AttendanceCorrectionRequest & Document;

/** Mirrors StaffAttendance.status (schemas/staff-attendance.schema.ts). */
export const ATTENDANCE_CORRECTION_STATUSES = ['present', 'absent', 'late', 'half_day', 'on_leave', 'sick_leave', 'remote', 'extra_day'];

// Self-service "Request Attendance Correction" (attendance:self permission) —
// lets a staff member (e.g. a Teacher whose biometric punch was missed or
// wrong) ask for their own StaffAttendance record to be fixed, without
// granting them the hr:write access that would let them edit anyone's
// attendance directly. An admin/HR reviewer approves (which actually applies
// the correction to StaffAttendance) or rejects (which leaves the original
// record untouched) via the existing @HrWrite()-gated review endpoint.
@Schema({ timestamps: true, collection: 'attendanceCorrectionRequests' })
export class AttendanceCorrectionRequest {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop() staffName: string;
  @Prop() staffEmployeeId: string;
  @Prop({ required: true }) attendanceDate: Date;

  // Snapshot of what StaffAttendance held at request time, for the
  // reviewer's reference — null/absent fields mean there was no record at
  // all for that date (e.g. a fully missed punch), not just a wrong status.
  @Prop({ enum: ATTENDANCE_CORRECTION_STATUSES }) currentStatus: string;
  @Prop() currentCheckInTime: string;
  @Prop() currentCheckOutTime: string;

  // What the staff member says actually happened.
  @Prop({ required: true, enum: ATTENDANCE_CORRECTION_STATUSES }) requestedStatus: string;
  @Prop() requestedCheckInTime: string;
  @Prop() requestedCheckOutTime: string;
  @Prop({ required: true }) reason: string;

  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' }) status: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) reviewedBy: Types.ObjectId;
  @Prop() reviewerName: string;
  @Prop() reviewedAt: Date;
  @Prop() reviewNotes: string;
}
export const AttendanceCorrectionRequestSchema = SchemaFactory.createForClass(AttendanceCorrectionRequest);
AttendanceCorrectionRequestSchema.index({ tenantId: 1, staffId: 1, status: 1 });
AttendanceCorrectionRequestSchema.index({ tenantId: 1, status: 1, attendanceDate: 1 });
