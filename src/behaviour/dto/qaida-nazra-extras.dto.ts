import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsMongoId, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class InvigilatorKpiDto {
  @IsString() key: string;
  @IsString() label: string;
  @IsOptional() @IsString() labelUrdu?: string;
}

export class QaidaNazraRatingScaleDto {
  @IsOptional() @IsNumber() min?: number;
  @IsOptional() @IsNumber() max?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) labels?: string[];
}

export class UpdateQaidaNazraSettingsDto {
  @IsOptional() @IsBoolean() nazraReverseOrder?: boolean;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InvigilatorKpiDto)
  invigilatorKpis?: InvigilatorKpiDto[];

  @IsOptional() @ValidateNested() @Type(() => QaidaNazraRatingScaleDto)
  invigilatorRatingScale?: QaidaNazraRatingScaleDto;
}

export class KpiScoreDto {
  @IsString() key: string;
  @IsNumber() score: number;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

// One student's entry within a batch invigilator-assessment submission -
// the visit-level fields (date, invigilator, program) are shared across
// the whole batch so one visit to a classroom is one API call.
export class InvigilatorAssessmentEntryDto {
  @IsMongoId() studentId: string;
  @IsOptional() takhtiOrParaNumber?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => KpiScoreDto)
  scores: KpiScoreDto[];
  @IsOptional() @IsString() @MaxLength(1000) overallRemarks?: string;
}

export class RecordInvigilatorAssessmentsDto {
  @IsIn(['qaida', 'nazra']) program: string;
  @IsOptional() @IsDateString() visitDate?: string;
  @IsIn(['internal', 'external']) invigilatorType: string;
  @IsOptional() @IsMongoId() invigilatorStaffId?: string;
  @IsString() invigilatorName: string;
  @IsOptional() @IsString() @MaxLength(200) invigilatorOrganization?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => InvigilatorAssessmentEntryDto)
  entries: InvigilatorAssessmentEntryDto[];
}

export class RecordHomeRecitationLogDto {
  @IsIn(['qaida', 'nazra']) program: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsInt() @Min(1) @Max(16) takhtiNumber?: number;
  @IsOptional() @IsInt() @Min(1) @Max(30) paraNumber?: number;
  @IsOptional() @IsString() @MaxLength(50) pageFrom?: string;
  @IsOptional() @IsString() @MaxLength(50) pageTo?: string;
  @IsOptional() @IsString() @MaxLength(100) tutorName?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
