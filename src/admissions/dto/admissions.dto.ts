// ============================================================
// DTOs — Admission Lifecycle
// Eldermin ERP | NestJS
// ============================================================

import {
  IsString, IsEmail, IsOptional, IsEnum, IsBoolean,
  IsNumber, IsArray, IsDateString, IsMongoId, Min, Max,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';

// ── Shared ────────────────────────────────────────────────────
export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsNumber() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() sortBy?: string = 'createdAt';
  @IsOptional() @IsEnum(['asc', 'desc']) sortOrder?: 'asc' | 'desc' = 'desc';
}

// ============================================================
// LEAD DTOs
// ============================================================
export class CreateLeadDto {
  @IsString() firstName: string;
  @IsString() lastName: string;

  @IsOptional() @IsEmail() email?: string;
  @IsString() phone: string;

  @IsString() gradeInterested: string;

  @IsEnum(['website','referral','social_media','walk_in','phone_call',
           'education_fair','advertisement','agent','alumni'])
  source: string;

  @IsOptional()
  @IsEnum(['new','contacted','interested','not_interested','follow_up','converted','lost'])
  status?: string;

  @IsOptional()
  @IsEnum(['low','medium','high','urgent'])
  priority?: string;

  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsMongoId() assignedToId?: string;
  @IsOptional() @IsString() campaign?: string;
  @IsOptional() @IsString() campusPreference?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() followUpDate?: string;

  // injected from auth guard
  schoolSlug?: string;
  academicYear?: string;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

export class LeadQueryDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() gradeInterested?: string;
  @IsOptional() @IsDateString() followUpDateFrom?: string;
  @IsOptional() @IsDateString() followUpDateTo?: string;
}

export class ConvertLeadDto {
  @IsString() gradeApplied: string;
  @IsString() academicYear: string;
  @IsOptional() @IsString() campusId?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() notes?: string;
}

// ============================================================
// APPLICANT DTOs
// ============================================================
export class CreateApplicantDto {
  // Student info
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsDateString() dateOfBirth: string;
  @IsEnum(['male', 'female']) gender: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() religion?: string;

  // Academic
  @IsString() gradeApplied: string;
  @IsOptional() @IsString() previousSchool?: string;
  @IsOptional() @IsString() previousGrade?: string;
  @IsOptional() @IsString() lastGPA?: string;

  // Guardian
  @IsString() fatherName: string;
  @IsOptional() @IsString() motherName?: string;
  @IsString() guardianPhone: string;
  @IsOptional() @IsEmail() guardianEmail?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;

  // Flags
  @IsOptional() @IsBoolean() siblingInSchool?: boolean;
  @IsOptional() @IsBoolean() specialNeeds?: boolean;
  @IsOptional() @IsString() specialNeedsDetail?: string;
  @IsOptional() @IsString() notes?: string;

  // Relations
  @IsOptional() @IsMongoId() leadId?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() campusId?: string;

  schoolSlug?: string;
  academicYear?: string;
}

export class UpdateApplicantDto extends PartialType(CreateApplicantDto) {
  @IsOptional()
  @IsEnum(['draft','submitted','under_review','shortlisted',
           'waitlisted','accepted','rejected','withdrawn'])
  status?: string;

  @IsOptional()
  @IsEnum(['application','document_review','entrance_test',
           'interview','decision','enrollment'])
  stage?: string;

  @IsOptional() @IsString() decisionBy?: string;
  @IsOptional() @IsString() rejectionReason?: string;
}

export class ApplicantQueryDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() gradeApplied?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsString() campusId?: string;
  @IsOptional() @IsString() academicYear?: string;
}

export class UpdateDocumentDto {
  @IsMongoId() documentId: string;
  @IsEnum(['pending','verified','rejected','expired']) status: string;
  @IsOptional() @IsString() remarks?: string;
}

// ============================================================
// ENTRANCE TEST DTOs
// ============================================================
export class CreateEntranceTestDto {
  @IsMongoId() applicantId: string;
  @IsString() applicantName: string;
  @IsDateString() scheduledDate: string;
  @IsString() scheduledTime: string;
  @IsString() venue: string;
  @IsArray() @IsString({ each: true }) subjects: string[];
  @IsOptional() @IsNumber() maxScore?: number;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsOptional() @IsString() examiner?: string;
  @IsOptional() @IsMongoId() examinerId?: string;
  schoolSlug?: string;
  academicYear?: string;
}

export class SubmitTestResultDto {
  @IsNumber() @Min(0) obtainedScore: number;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsArray() subjectScores?: {
    subject: string; obtainedScore: number; maxScore: number;
  }[];
}

// ============================================================
// INTERVIEW DTOs
// ============================================================
export class CreateInterviewDto {
  @IsMongoId() applicantId: string;
  @IsString() applicantName: string;
  @IsDateString() scheduledDate: string;
  @IsString() scheduledTime: string;
  @IsOptional() @IsString() venue?: string;
  @IsArray() @IsString({ each: true }) interviewers: string[];
  @IsOptional() @IsArray() @IsMongoId({ each: true }) interviewerIds?: string[];
  @IsEnum(['student','parent','both']) type: string;
  schoolSlug?: string;
  academicYear?: string;
}

export class SubmitInterviewResultDto {
  @IsArray() scores: { criteria: string; score: number; maxScore: number }[];
  @IsEnum(['recommended','not_recommended','borderline']) decision: string;
  @IsOptional() @IsString() remarks?: string;
}

// ============================================================
// ENROLLMENT DTOs
// ============================================================
export class CreateEnrollmentDto {
  @IsMongoId() applicantId: string;
  @IsString() applicationNumber: string;
  @IsString() studentName: string;
  @IsString() gradeEnrolled: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsString() classAssigned?: string;
  @IsOptional() @IsString() rollNumber?: string;
  @IsOptional() @IsNumber() admissionFee?: number;
  @IsOptional() @IsString() campusId?: string;
  schoolSlug?: string;
  academicYear?: string;
}

export class UpdateEnrollmentDto {
  @IsOptional()
  @IsEnum(['pending_fee','fee_paid','documents_pending','enrolled','deferred'])
  status?: string;

  @IsOptional() @IsBoolean() admissionFeePaid?: boolean;
  @IsOptional() @IsDateString() feePaidDate?: string;
  @IsOptional() @IsString() feeReceiptNumber?: string;
  @IsOptional() @IsString() classAssigned?: string;
  @IsOptional() @IsString() rollNumber?: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsBoolean() documentsComplete?: boolean;
  @IsOptional() @IsBoolean() uniformIssued?: boolean;
  @IsOptional() @IsBoolean() idCardIssued?: boolean;
  @IsOptional() @IsBoolean() welcomeKitGiven?: boolean;
  @IsOptional() @IsDateString() orientationDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsMongoId() studentId?: string;
}

// ============================================================
// RETENTION DTOs
// ============================================================
export class CreateRetentionDto {
  @IsOptional() @IsMongoId() studentId?: string;
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsString() counsellorAssigned?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) atRiskFactors?: string[];
  @IsOptional() @IsString() notes?: string;
  schoolSlug?: string;
  academicYear?: string;
}

export class UpdateRetentionDto {
  @IsOptional()
  @IsEnum(['active','at_risk','withdrawn','re_enrolled','waitlisted'])
  status?: string;

  @IsOptional()
  @IsEnum(['pending','confirmed','declined'])
  reEnrollmentStatus?: string;

  @IsOptional() @IsString() withdrawalReason?: string;
  @IsOptional() @IsDateString() withdrawalDate?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) atRiskFactors?: string[];
  @IsOptional() @IsString() counsellorAssigned?: string;
  @IsOptional() @IsMongoId() counsellorId?: string;
  @IsOptional() @IsDateString() lastInteractionDate?: string;
  @IsOptional() @IsDateString() nextFollowUpDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() waitlistPosition?: number;
}
