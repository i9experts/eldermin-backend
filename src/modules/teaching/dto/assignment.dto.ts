import {
  IsString, IsOptional, IsEnum, IsNumber, IsArray, IsMongoId, IsDateString, Min, Max,
} from 'class-validator';

const ASSIGNMENT_TYPES = ['homework', 'classwork', 'project', 'quiz', 'test', 'lab_work', 'presentation', 'other'] as const;
const ASSIGNMENT_STATUSES = ['draft', 'assigned'] as const;
// 'submitted'/'graded'/'overdue' are no longer settable by a client - they're
// derived (submitted/graded from real AssignmentSubmission rows, overdue by
// the daily cron) now that a real submission workflow exists. A teacher can
// only ever choose between saving a draft or assigning it to the class.

export class CreateAssignmentDto {
  @IsOptional() @IsMongoId() teacherId?: string;
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @IsString() subject: string;
  @IsString() gradeLevel: string;
  @IsOptional() @IsString() sectionName?: string;
  @IsOptional() @IsEnum(ASSIGNMENT_TYPES) type?: string;
  @IsOptional() @IsDateString() assignedDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsNumber() @Min(0) totalMarks?: number;
  @IsOptional() @IsNumber() @Min(0) passingMarks?: number;
  @IsOptional() @IsEnum(ASSIGNMENT_STATUSES) status?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachmentS3Keys?: string[];
  @IsOptional() @IsString() instructions?: string;
}

// Deliberately excludes tenantId/institutionId/campusId/teacherId (who an
// assignment belongs to isn't editable after creation - reassigning it to a
// different campus/teacher via this endpoint was a real bug, see
// TeachingService.updateAssignment) and submissionsCount/avgScore (now
// derived from real AssignmentSubmission rows, not client-settable).
export class UpdateAssignmentDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() gradeLevel?: string;
  @IsOptional() @IsString() sectionName?: string;
  @IsOptional() @IsEnum(ASSIGNMENT_TYPES) type?: string;
  @IsOptional() @IsDateString() assignedDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsNumber() @Min(0) totalMarks?: number;
  @IsOptional() @IsNumber() @Min(0) passingMarks?: number;
  @IsOptional() @IsEnum(ASSIGNMENT_STATUSES) status?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachmentS3Keys?: string[];
  @IsOptional() @IsString() instructions?: string;
}

export class SubmitHomeworkDto {
  @IsOptional() @IsString() textResponse?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachmentS3Keys?: string[];
}

export class GradeSubmissionDto {
  @IsNumber() @Min(0) @Max(1000) grade: number;
  @IsOptional() @IsString() feedback?: string;
}
