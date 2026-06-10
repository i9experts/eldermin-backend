// ============================================================
// ASSESSMENT DTOs — Eldermin ERP | NestJS
// ============================================================

import {
  IsString, IsOptional, IsEnum, IsBoolean, IsNumber,
  IsArray, IsDateString, IsMongoId, ValidateNested, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class PaginationDto {
  @IsOptional() @Type(() => Number) page?: number = 1;
  @IsOptional() @Type(() => Number) @Min(1) limit?: number = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() sortBy?: string = 'createdAt';
  @IsOptional() @IsEnum(['asc','desc']) sortOrder?: 'asc'|'desc' = 'desc';
}

// ── Subject Config ────────────────────────────────────────────
export class SubjectConfigDto {
  @IsString() subject: string;
  @IsNumber() totalMarks: number;
  @IsOptional() @IsNumber() passingMarks?: number;
  @IsOptional() @IsString() examiner?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsNumber() duration?: number;
  @IsOptional() @IsString() venue?: string;
}

// ── Assessment ────────────────────────────────────────────────
export class CreateAssessmentDto {
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;

  @IsEnum(['quiz','class_test','unit_test','mid_term','final_exam',
           'assignment','project','practical','oral'])
  type: string;

  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsString() academicYear: string;
  @IsOptional() @IsString() term?: string;

  @IsArray() @ValidateNested({ each: true })
  @Type(() => SubjectConfigDto)
  subjects: SubjectConfigDto[];

  @IsDateString() startDate: string;
  @IsOptional() @IsDateString() endDate?: string;

  @IsOptional()
  @IsEnum(['draft','scheduled','ongoing','completed','result_published','cancelled'])
  status?: string;

  schoolSlug?: string;
  createdBy?: string;
}

export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {}

export class AssessmentQueryDto extends PaginationDto {
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() academicYear?: string;
  @IsOptional() @IsString() term?: string;
}

// ── Question Bank ─────────────────────────────────────────────
export class QuestionOptionDto {
  @IsString() text: string;
  @IsOptional() @IsBoolean() isCorrect?: boolean;
}

export class CreateQuestionDto {
  @IsString() subject: string;
  @IsString() grade: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsString() chapter?: string;

  @IsEnum(['mcq','short','long','true_false','fill_blank','matching'])
  type: string;

  @IsOptional()
  @IsEnum(['remember','understand','apply','analyze','evaluate','create'])
  bloomsLevel?: string;

  @IsOptional() @IsEnum(['easy','medium','hard']) difficulty?: string;
  @IsString() questionText: string;
  @IsOptional() @IsString() questionImage?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto) options?: QuestionOptionDto[];

  @IsOptional() @IsString() correctAnswer?: string;
  @IsOptional() @IsString() answerExplanation?: string;
  @IsOptional() @IsNumber() marks?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  schoolSlug?: string;
  addedBy?: string;
}

export class QuestionQueryDto extends PaginationDto {
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() difficulty?: string;
  @IsOptional() @IsString() bloomsLevel?: string;
}

// ── Mark Entry ────────────────────────────────────────────────
export class SingleMarkDto {
  @IsMongoId() studentId: string;
  @IsString() studentName: string;
  @IsString() rollNumber: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsNumber() @Min(0) obtainedMarks?: number;
  @IsOptional() @IsBoolean() isAbsent?: boolean;
  @IsOptional() @IsBoolean() isExempt?: boolean;
  @IsOptional() @IsString() remarks?: string;
}

export class BulkMarkEntryDto {
  @IsMongoId() assessmentId: string;
  @IsString() subject: string;
  @IsString() grade: string;
  @IsArray() @ValidateNested({ each: true })
  @Type(() => SingleMarkDto)
  marks: SingleMarkDto[];
  schoolSlug?: string;
  academicYear?: string;
  enteredBy?: string;
}

export class VerifyMarksDto {
  @IsMongoId() assessmentId: string;
  @IsString() subject: string;
  @IsString() grade: string;
  verifiedBy?: string;
}

export class MarkQueryDto extends PaginationDto {
  @IsOptional() @IsMongoId() assessmentId?: string;
  @IsOptional() @IsMongoId() studentId?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) verified?: boolean;
}

// ── Report Card ───────────────────────────────────────────────
export class GenerateReportCardsDto {
  @IsMongoId() assessmentId: string;
  schoolSlug?: string;
  generatedBy?: string;
}

export class UpdateReportCardRemarksDto {
  @IsOptional() @IsString() classTeacherRemarks?: string;
  @IsOptional() @IsString() principalRemarks?: string;
}

export class PublishResultDto {
  @IsMongoId() assessmentId: string;
  schoolSlug?: string;
  publishedBy?: string;
}

export class ReportCardQueryDto extends PaginationDto {
  @IsOptional() @IsMongoId() assessmentId?: string;
  @IsOptional() @IsMongoId() studentId?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() academicYear?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) published?: boolean;
}
