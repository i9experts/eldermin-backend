import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { NAZRA_COMMON_ERRORS, NAZRA_PARA_COUNT } from '../schemas/nazra-progress.schema';
import { QURAN_SURAH_COUNT } from '../schemas/quran-surahs';

const RATINGS = ['needs_practice', 'developing', 'proficient', 'mastered'];

// Sent once, the first time a teacher opens a student's Nazra tracker -
// mirrors InitQaidaProgressDto exactly.
export class InitNazraProgressDto {
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsMongoId() campusId?: string;

  // Mirrors InitQaidaProgressDto - see QaidaProgress.recordType.
  @IsOptional() @IsIn(['full_history', 'joined_later']) recordType?: string;
  @IsOptional() @IsString() @MaxLength(500) priorRecordNote?: string;
  @IsOptional() @IsInt() @Min(1) @Max(NAZRA_PARA_COUNT) startAtPara?: number;
}

export class DiarySabaqDto {
  @IsInt() @Min(1) @Max(NAZRA_PARA_COUNT) paraNumber: number;
  @IsOptional() @IsString() @MaxLength(50) pageFrom?: string;
  @IsOptional() @IsString() @MaxLength(50) pageTo?: string;
  @IsOptional() @IsInt() @Min(1) @Max(QURAN_SURAH_COUNT) surahNumber?: number;
  @IsOptional() @IsString() @MaxLength(60) surahName?: string;
  @IsOptional() @IsInt() @Min(1) ayahFrom?: number;
  @IsOptional() @IsInt() @Min(1) ayahTo?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) makhrajAccuracy?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) tajweedAccuracy?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) fluency?: number;
  @IsIn(RATINGS) rating: string;
  @IsOptional() @IsArray() @IsIn(NAZRA_COMMON_ERRORS as unknown as string[], { each: true })
  errorsNoted?: string[];
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  // Whether today's Sabaq finished the whole Para. A day's lesson is a few
  // ayahs, not a Para, so a good rating alone must not complete the Para.
  // Omitted = the old behaviour (a passing rating completes it).
  @IsOptional() @IsBoolean() completesPara?: boolean;
}

export class DiaryRevisionDto {
  @IsInt() @Min(1) @Max(NAZRA_PARA_COUNT) paraNumber: number;
  @IsOptional() @IsString() @MaxLength(50) pageFrom?: string;
  @IsOptional() @IsString() @MaxLength(50) pageTo?: string;
  @IsOptional() @IsInt() @Min(1) @Max(QURAN_SURAH_COUNT) surahNumber?: number;
  @IsOptional() @IsString() @MaxLength(60) surahName?: string;
  @IsOptional() @IsInt() @Min(1) ayahFrom?: number;
  @IsOptional() @IsInt() @Min(1) ayahTo?: number;
  @IsIn(RATINGS) rating: string;
  @IsOptional() @IsArray() @IsIn(NAZRA_COMMON_ERRORS as unknown as string[], { each: true })
  errorsNoted?: string[];
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

// The real "daily diary" entry - today's Sabaq (required), plus whichever
// of Sabqi (short-cycle revision) and Manzil (long-cycle revision) the
// teacher actually covered with this student today.
export class RecordNazraDiaryDto {
  @IsOptional() @IsDateString() date?: string;

  @ValidateNested() @Type(() => DiarySabaqDto)
  sabaq: DiarySabaqDto;

  @IsOptional() @ValidateNested() @Type(() => DiaryRevisionDto)
  sabqi?: DiaryRevisionDto;

  @IsOptional() @ValidateNested() @Type(() => DiaryRevisionDto)
  manzil?: DiaryRevisionDto;
}

export class BulkNazraDiaryItemDto extends RecordNazraDiaryDto {
  @IsMongoId() studentId: string;
  @IsString() @MaxLength(200) studentName: string;
}

// Whole-class recording in one request: students without a Nazra record
// yet are started automatically, and one student's failure never blocks
// the rest of the class.
export class BulkNazraDiaryDto {
  @IsOptional() @IsDateString() date?: string;
  @IsString() @MaxLength(100) grade: string;
  @IsOptional() @IsString() @MaxLength(100) section?: string;
  @IsOptional() @IsMongoId() campusId?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => BulkNazraDiaryItemDto)
  entries: BulkNazraDiaryItemDto[];
}

export class UpdateParaStatusDto {
  @IsIn(['not_started', 'in_progress', 'completed', 'needs_revision', 'not_tracked'])
  status: string;
}
