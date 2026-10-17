import {
  IsArray, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min,
} from 'class-validator';
import { QAIDA_COMMON_ERRORS } from '../schemas/qaida-progress.schema';

// Sent once, the first time a teacher opens a student's Qaida tracker -
// snapshots name/grade/section the same way every other behaviour-module
// record does, rather than looking the student up server-side on every
// request.
export class InitQaidaProgressDto {
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsMongoId() campusId?: string;
}

export class RecordTakhtiAttemptDto {
  @IsInt() @Min(1) @Max(16) takhtiNumber: number;

  @IsIn(['needs_practice', 'developing', 'proficient', 'mastered'])
  rating: string;

  @IsOptional() @IsNumber() @Min(1) @Max(5) makhrajAccuracy?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) tajweedAccuracy?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) fluency?: number;

  @IsOptional() @IsArray() @IsIn(QAIDA_COMMON_ERRORS as unknown as string[], { each: true })
  errorsNoted?: string[];

  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class UpdateTakhtiStatusDto {
  @IsIn(['not_started', 'in_progress', 'mastered', 'needs_revision'])
  status: string;
}
