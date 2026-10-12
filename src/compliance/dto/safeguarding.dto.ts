import { IsDateString, IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const SAFEGUARDING_TYPES = [
  'physical', 'emotional', 'sexual', 'neglect', 'bullying', 'cyberbullying', 'radicalisation', 'other',
] as const;
export const SAFEGUARDING_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Fields a REPORTER (safeguarding:report without safeguarding:write) may set
 * when raising a concern. Mirrors the Teacher app's kSafeguardingRequestKeys.
 * Everything else (status, assignedTo, confidential, caseNumber, police /
 * social-services / parent-notified flags, reportedBy...) is lead-owned.
 */
export class CreateSafeguardingReportDto {
  @IsString() @MinLength(1) @MaxLength(300) title: string;
  @IsString() @MinLength(1) @MaxLength(10000) description: string;
  @IsIn(SAFEGUARDING_TYPES as unknown as string[]) type: string;
  @IsOptional() @IsIn(SAFEGUARDING_SEVERITIES as unknown as string[]) severity?: string;
  @IsOptional() @IsDateString() reportedDate?: string;
  @IsOptional() @IsString() @MaxLength(10000) actionsTaken?: string;
  @IsOptional() @IsMongoId() studentId?: string;
  @IsOptional() @IsString() @MaxLength(300) studentName?: string;
  @IsOptional() @IsString() @MaxLength(100) studentGrade?: string;
}

/** Same required/typed core for callers WITH safeguarding:write (extra lead fields stay accepted, as before). */
export class CreateSafeguardingManagerDto extends CreateSafeguardingReportDto {}
