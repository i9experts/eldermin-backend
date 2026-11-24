import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, ValidateNested,
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

  // A student who joined without a full Qaida history at this school: place
  // them at their real starting board (per an entry assessment) instead of
  // forcing them through boards already covered elsewhere. Boards before
  // startAtTakhti are seeded 'not_tracked', not 'not_started'.
  @IsOptional() @IsIn(['full_history', 'joined_later']) recordType?: string;
  @IsOptional() @IsString() @MaxLength(500) priorRecordNote?: string;
  @IsOptional() @IsInt() @Min(1) @Max(16) startAtTakhti?: number;
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

  // Whether this sabaq finished the whole board. A day's sabaq is a few
  // letters, not a board, so a good rating alone must not master it.
  // Omitted = the old behaviour (a passing rating masters the board).
  @IsOptional() @IsBoolean() completesTakhti?: boolean;
}

export class BulkQaidaAttemptItemDto extends RecordTakhtiAttemptDto {
  @IsMongoId() studentId: string;
  @IsString() @MaxLength(200) studentName: string;
}

// Whole-class recording in one request: students without a Qaida record
// yet are started automatically, and one student's failure never blocks
// the rest of the class.
export class BulkQaidaAttemptsDto {
  @IsOptional() @IsDateString() date?: string;
  @IsString() @MaxLength(100) grade: string;
  @IsOptional() @IsString() @MaxLength(100) section?: string;
  @IsOptional() @IsMongoId() campusId?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => BulkQaidaAttemptItemDto)
  entries: BulkQaidaAttemptItemDto[];
}

export class UpdateTakhtiStatusDto {
  @IsIn(['not_started', 'in_progress', 'mastered', 'needs_revision', 'not_tracked'])
  status: string;
}
