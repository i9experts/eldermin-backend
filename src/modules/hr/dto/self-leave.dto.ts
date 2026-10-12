import { Transform } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength,
  registerDecorator, ValidationArguments, ValidationOptions,
} from 'class-validator';

/** Mirrors LeaveApplication.leaveType (schemas/leave-application.schema.ts). */
export const LEAVE_TYPES = ['annual', 'sick', 'casual', 'maternity', 'paternity', 'emergency', 'unpaid', 'study', 'hajj', 'other'];

/** Property must not be an earlier date than another property of the same object. Skips when either is not a parsable date (those have their own messages). */
export function IsNotBefore(other: string, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotBefore',
      target: object.constructor,
      propertyName,
      constraints: [other],
      options: { message: `${propertyName} must not be before ${other}`, ...options },
      validator: {
        validate(value: any, args: ValidationArguments) {
          const a = new Date(value).getTime();
          const b = new Date((args.object as any)[args.constraints[0]]).getTime();
          if (Number.isNaN(a) || Number.isNaN(b)) return true;
          return a >= b;
        },
      },
    });
  };
}

const trim = ({ value }: { value: any }) => (typeof value === 'string' ? value.trim() : value);

/** Body of POST /hr/leave/self. Identity / approval fields are not listed: they are stripped (whitelist) and set server-side. */
export class CreateSelfLeaveDto {
  @IsIn(LEAVE_TYPES, { message: `leaveType must be one of: ${LEAVE_TYPES.join(', ')}` }) leaveType: string;
  @IsDateString({}, { message: 'fromDate must be a valid date (YYYY-MM-DD)' }) fromDate: string;
  @IsDateString({}, { message: 'toDate must be a valid date (YYYY-MM-DD)' }) @IsNotBefore('fromDate') toDate: string;
  @Transform(trim) @IsString({ message: 'reason is required' }) @MinLength(1, { message: 'reason is required' }) @MaxLength(2000) reason: string;
  @IsOptional() @IsBoolean({ message: 'isHalfDay must be true or false' }) isHalfDay?: boolean;
  @IsOptional() @IsIn(['morning', 'afternoon'], { message: 'halfDaySession must be morning or afternoon' }) halfDaySession?: string;
  // Sent by the web form, always recomputed server-side (createLeaveApplication); accepted so it is not rejected.
  @IsOptional() @IsNumber() totalDays?: number;
  @IsOptional() @IsString() coveringStaffId?: string;
  @IsOptional() @IsString() coveringStaffName?: string;
  @IsOptional() @IsString() attachmentS3Key?: string;
}
