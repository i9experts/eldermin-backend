import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { NAZRA_COMMON_ERRORS, NAZRA_PARA_COUNT } from '../schemas/nazra-progress.schema';

const RATINGS = ['needs_practice', 'developing', 'proficient', 'mastered'];

// Sent once, the first time a teacher opens a student's Nazra tracker -
// mirrors InitQaidaProgressDto exactly.
export class InitNazraProgressDto {
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsMongoId() campusId?: string;
}

export class DiarySabaqDto {
  @IsInt() @Min(1) @Max(NAZRA_PARA_COUNT) paraNumber: number;
  @IsOptional() @IsString() @MaxLength(50) pageFrom?: string;
  @IsOptional() @IsString() @MaxLength(50) pageTo?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(5) makhrajAccuracy?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) tajweedAccuracy?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) fluency?: number;
  @IsIn(RATINGS) rating: string;
  @IsOptional() @IsArray() @IsIn(NAZRA_COMMON_ERRORS as unknown as string[], { each: true })
  errorsNoted?: string[];
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class DiaryRevisionDto {
  @IsInt() @Min(1) @Max(NAZRA_PARA_COUNT) paraNumber: number;
  @IsOptional() @IsString() @MaxLength(50) pageFrom?: string;
  @IsOptional() @IsString() @MaxLength(50) pageTo?: string;
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

export class UpdateParaStatusDto {
  @IsIn(['not_started', 'in_progress', 'completed', 'needs_revision'])
  status: string;
}
