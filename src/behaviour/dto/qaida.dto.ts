import {
  IsArray, IsDateString, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString,
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

  // The sabaq (lesson) range actually covered - e.g. "Alif" to "Kaf".
  // Optional: a board with no fixed reference content (Murakkabat, the
  // Mashq boards) has nothing to pick a range from, so a teacher just
  // leaves these blank and relies on remarks/pageReference instead.
  @IsOptional() @IsString() @MaxLength(100) sabaqFrom?: string;
  @IsOptional() @IsString() @MaxLength(100) sabaqTo?: string;

  // When this sabaq actually happened, if not right now (logging it after
  // the fact, or at end of day for the whole class).
  @IsOptional() @IsDateString() date?: string;
}

export class UpdateTakhtiStatusDto {
  @IsIn(['not_started', 'in_progress', 'mastered', 'needs_revision'])
  status: string;
}
