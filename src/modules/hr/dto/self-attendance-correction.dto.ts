import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { ATTENDANCE_CORRECTION_STATUSES } from '../schemas/attendance-correction-request.schema';

const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);

/** Body of POST /hr/attendance/self. Identity / review / snapshot fields are not
 * listed: they are stripped (whitelist) and set server-side. */
export class CreateSelfAttendanceCorrectionDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'attendanceDate must be a valid date (YYYY-MM-DD)' }) attendanceDate: string;
  @IsIn(ATTENDANCE_CORRECTION_STATUSES, { message: `requestedStatus must be one of: ${ATTENDANCE_CORRECTION_STATUSES.join(', ')}` }) requestedStatus: string;
  @IsOptional() @IsString() requestedCheckInTime?: string;
  @IsOptional() @IsString() requestedCheckOutTime?: string;
  @Transform(trim) @IsString({ message: 'reason is required' }) @MinLength(1, { message: 'reason is required' }) @MaxLength(2000) reason: string;
}

/** Body of PATCH /hr/attendance/correction-requests/:id. */
export class ReviewAttendanceCorrectionDto {
  @IsIn(['approved', 'rejected'], { message: 'status must be approved or rejected' }) status: 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(2000) reviewNotes?: string;
}
