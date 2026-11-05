// ============================================================
// ASSESSMENT DTOs — Eldermin ERP | NestJS
// ============================================================

import {
  IsString, IsOptional, IsEnum, IsBoolean, IsNumber,
  IsArray, IsDateString, IsMongoId, ValidateNested, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { CURRICULUM_FRAMEWORKS } from '../../common/constants/curriculum-framework';

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
  @IsOptional() @IsMongoId() examPaperId?: string;
  @IsOptional() @IsNumber() attemptsAllowed?: number;
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

  @IsOptional() @IsEnum(['teacher_marked', 'self_paced_online']) deliveryMode?: string;

  // Assessment Master Settings - which grading scale (by curriculum
  // framework) this assessment's results are graded under. Optional so
  // existing clients/tests that don't send it keep working; the frontend
  // always sends a real value going forward (auto-suggested from the
  // assessment's subjects' Curriculum framework, editable).
  @IsOptional() @IsEnum(CURRICULUM_FRAMEWORKS) framework?: string;

  schoolSlug?: string;
  createdBy?: string;
}

export class UpdateAssessmentDto extends PartialType(CreateAssessmentDto) {}

// ── Assessment Master Settings: Grading Scales ──────────────────
export class GradingBandDto {
  @IsNumber() @Min(0) @Max(100) minPercent: number;
  @IsNumber() @Min(0) @Max(100) maxPercent: number;
  @IsString() label: string;
  @IsOptional() @IsNumber() gpaPoint?: number;
  @IsOptional() @IsBoolean() isPassing?: boolean;
}

export class CreateGradingScaleDto {
  @IsEnum(CURRICULUM_FRAMEWORKS) framework: string;
  @IsString() name: string;
  @IsOptional() @IsString() presetKey?: string;

  @IsArray() @ValidateNested({ each: true })
  @Type(() => GradingBandDto)
  bands: GradingBandDto[];

  schoolSlug?: string;
  updatedBy?: string;
}

export class UpdateGradingScaleDto extends PartialType(CreateGradingScaleDto) {}

// ── Assessment Master Settings: Parent Visibility ────────────────
export class UpdateAssessmentVisibilitySettingsDto {
  @IsOptional() @IsBoolean() shareGPA?: boolean;
  @IsOptional() @IsBoolean() shareSubjectBreakdown?: boolean;
  @IsOptional() @IsBoolean() shareClassPosition?: boolean;
  @IsOptional() @IsBoolean() shareClassAverage?: boolean;

  schoolSlug?: string;
  updatedBy?: string;
}

// ── LMS Phase 2: online quizzes ─────────────────────────────────
export class StartQuizDto {
  @IsMongoId() assessmentId: string;
  @IsString() subject: string;
}

export class QuizAnswerInputDto {
  @IsMongoId() questionId: string;
  @IsOptional() @IsNumber() selectedOptionIndex?: number;
  @IsOptional() @IsString() textAnswer?: string;
}

export class SubmitQuizDto {
  @IsArray() @ValidateNested({ each: true })
  @Type(() => QuizAnswerInputDto)
  answers: QuizAnswerInputDto[];
}

export class ManualQuizGradeDto {
  @IsMongoId() questionId: string;
  @IsNumber() marksAwarded: number;
}

export class GradeQuizAttemptDto {
  @IsArray() @ValidateNested({ each: true })
  @Type(() => ManualQuizGradeDto)
  grades: ManualQuizGradeDto[];
}

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

export class MatchingPairDto {
  @IsString() left: string;
  @IsString() right: string;
}

export class CreateQuestionDto {
  @IsString() subject: string;
  @IsString() grade: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsString() chapter?: string;

  @IsEnum(['mcq','short','long','true_false','fill_blank','matching','tracing','counting'])
  type: string;

  @IsOptional()
  @IsEnum(['remember','understand','apply','analyze','evaluate','create'])
  bloomsLevel?: string;

  @IsOptional() @IsEnum(['easy','medium','hard']) difficulty?: string;
  @IsString() questionText: string;
  @IsOptional() @IsString() questionImage?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto) options?: QuestionOptionDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => MatchingPairDto) matchingPairs?: MatchingPairDto[];

  @IsOptional() @IsEnum(['letter', 'number', 'shape', 'word']) traceType?: string;
  @IsOptional() @IsString() traceContent?: string;

  @IsOptional() @IsString() countEmoji?: string;
  @IsOptional() @IsNumber() @Min(0) correctCount?: number;
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) countOptions?: number[];

  @IsOptional() @IsString() eceStandardCode?: string;
  @IsOptional() @IsString() eceStandardText?: string;
  @IsOptional() @IsMongoId() eceIndicatorId?: string;

  @IsOptional() @IsString() correctAnswer?: string;
  @IsOptional() @IsString() answerExplanation?: string;
  @IsOptional() @IsNumber() marks?: number;
  @IsOptional() @IsNumber() answerLines?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  schoolSlug?: string;
  addedBy?: string;
}

export class QuestionQueryDto extends PaginationDto {
  // Overrides PaginationDto's uncapped limit - the Question Bank list UI
  // used to work around pagination entirely by requesting limit:1000 in one
  // shot, which silently hid every question outside that single
  // newest-first page once a bank grew past it (see QuestionBankTab). The
  // UI now paginates for real, so a hard cap here stops any client from
  // reintroducing that "fetch everything" pattern.
  @IsOptional() @Type(() => Number) @Min(1) @Max(200) limit?: number = 20;

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

export class UpdateMarkEntryDto {
  @IsOptional() @IsNumber() @Min(0) obtainedMarks?: number;
  @IsOptional() @IsBoolean() isAbsent?: boolean;
  @IsOptional() @IsBoolean() isExempt?: boolean;
  @IsOptional() @IsString() remarks?: string;
}

export class MarkQueryDto extends PaginationDto {
  // Overrides PaginationDto's default limit:20 - unlike a genuinely
  // paginated list (assessments, questions, report cards), a Mark Sheet
  // request IS the full roster for one class/subject: the Total/Entered/
  // Pass/Fail/Absent/Avg% summary cards and "Verify All" all silently
  // operate over whatever this one page returns. A 20-row cap meant a
  // class of 30+ (or "All sections" of a grade) showed only its first 20
  // students, with wrong totals and no way to reach - or verify - the
  // rest, and no pagination control existed on this screen to surface the
  // truncation. 2000 comfortably covers even a large grade's combined
  // sections in one request; the cap stays only as a hard safety ceiling.
  @IsOptional() @Type(() => Number) @Min(1) @Max(2000) limit?: number = 2000;

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

// ── Term Report Card (comprehensive, whole-term report) ─────────
export class TermReportCardSectionsDto {
  @IsOptional() @IsBoolean() tarbiyah?: boolean;
  @IsOptional() @IsBoolean() qaida?: boolean;
  @IsOptional() @IsBoolean() nazra?: boolean;
  @IsOptional() @IsBoolean() attendance?: boolean;
  @IsOptional() @IsBoolean() teacherFeedback?: boolean;
  @IsOptional() @IsBoolean() parentEngagement?: boolean;
}

export class GenerateTermReportCardsDto {
  @IsString() academicYear: string;
  @IsString() term: string;
  @IsOptional() @IsEnum(['all', 'class', 'section', 'student']) scopeType?: 'all' | 'class' | 'section' | 'student';
  @IsOptional() @IsString() scopeValue?: string;
  // Term date range - needed to scope attendance/Qaida-Nazra/behaviour
  // entries to just this term rather than a student's whole history.
  @IsOptional() @IsDateString() termStartDate?: string;
  @IsOptional() @IsDateString() termEndDate?: string;
  @IsOptional() @ValidateNested() @Type(() => TermReportCardSectionsDto) sections?: TermReportCardSectionsDto;
  schoolSlug?: string;
  generatedBy?: string;
}

export class TermReportCardQueryDto extends PaginationDto {
  @IsOptional() @IsMongoId() studentId?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsString() academicYear?: string;
  @IsOptional() @IsString() term?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) published?: boolean;
}

export class PublishTermReportCardsDto {
  @IsString() academicYear: string;
  @IsString() term: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() section?: string;
  schoolSlug?: string;
  publishedBy?: string;
}

export class ClassifyBloomsLevelDto {
  @IsString() questionText: string;
  @IsString() questionType: string;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
}

// ── Exam Paper ────────────────────────────────────────────────
export class PaperSectionDto {
  @IsString() title: string;
  @IsOptional() @IsString() instructions?: string;
  @IsArray() @IsMongoId({ each: true }) questionIds: string[];
}
export class CreateExamPaperDto {
  @IsString() title: string;
  @IsString() subject: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsString() academicYear: string;
  @IsOptional() @IsString() term?: string;
  @IsEnum(['english', 'urdu', 'arabic']) language: string;
  @IsOptional() @IsNumber() duration?: number;
  @IsOptional() @IsString() generalInstructions?: string;
  @IsOptional() @IsEnum(['standard', 'compact', 'formal']) paperFormat?: string;
  @IsOptional() @IsEnum(['small', 'medium', 'large']) fontSize?: string;
  @IsOptional() @IsEnum(['nastaliq', 'naskh']) urduFontStyle?: string;
  @IsOptional() @IsEnum(['exam', 'worksheet']) paperType?: string;
  @IsOptional() @IsMongoId() eceIndicatorId?: string;
  @IsOptional() @IsString() eceStandardCode?: string;
  @IsOptional() @IsString() eceStandardText?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaperSectionDto) sections: PaperSectionDto[];
}
export class UpdateExamPaperDto extends PartialType(CreateExamPaperDto) {}

// ── OMR ───────────────────────────────────────────────────────
export class GenerateOMRSheetsDto {
  @IsMongoId() examPaperId: string;
  @IsArray() @IsMongoId({ each: true }) studentIds: string[];
}
export class ConfirmOMRAnswerDto {
  @IsNumber() questionNumber: number;
  @IsOptional() @IsString() confirmedOption?: string;
}
export class ConfirmOMRSheetDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ConfirmOMRAnswerDto) answers: ConfirmOMRAnswerDto[];
}
