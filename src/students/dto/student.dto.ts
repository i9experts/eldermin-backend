// ============================================================
// STUDENT DTOs — Student 360
// Eldermin ERP | NestJS
// ============================================================

import {
  IsString, IsEmail, IsOptional, IsEnum, IsBoolean,
  IsNumber, IsArray, IsDateString, IsMongoId, IsObject,
  ValidateNested, Min, Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

// ── Pagination ────────────────────────────────────────────────
export class PaginationDto {
  @IsOptional() @Type(() => Number) page?: number = 1;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit?: number = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() sortBy?: string = 'createdAt';
  @IsOptional() @IsEnum(['asc', 'desc']) sortOrder?: 'asc' | 'desc' = 'desc';
}

// ── Guardian ──────────────────────────────────────────────────
export class GuardianDto {
  @IsString() name: string;
  @IsEnum(['father', 'mother', 'guardian']) relation: string;
  @IsOptional() @IsString() cnic?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsString() employer?: string;
  @IsOptional() @IsNumber() monthlyIncome?: number;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isEmergencyContact?: boolean;
}

// ── Medical ───────────────────────────────────────────────────
// allergyItems/conditionItems/medicationItems carry the real structured
// detail the Enrollment Wizard collects (severity, treatment, dosage,
// etc.) - see StudentsService.createStudent, which mirrors these into
// the same MedicalRecord collection the Health tab reads/writes, so
// data entered at enrollment doesn't stay invisible until someone
// re-enters it there. allergies/medications/conditions (plain string
// arrays) stay for the simpler embedded Student.medical field.
export class AllergyItemDto {
  @IsOptional() @IsString() type?: string;
  @IsString() name: string;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsString() treatment?: string;
}

export class ConditionItemDto {
  @IsString() name: string;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsString() emergencyProtocol?: string;
}

export class MedicationItemDto {
  @IsString() name: string;
  @IsOptional() @IsString() dosage?: string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @IsString() keptAt?: string;
}

export class MedicalDto {
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) allergies?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) medications?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) conditions?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AllergyItemDto) allergyItems?: AllergyItemDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ConditionItemDto) conditionItems?: ConditionItemDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MedicationItemDto) medicationItems?: MedicationItemDto[];
  @IsOptional() @IsString() doctorName?: string;
  @IsOptional() @IsString() doctorPhone?: string;
  @IsOptional() @IsString() doctorClinic?: string;
  @IsOptional() @IsString() emergencyAction?: string;
  @IsOptional() @IsString() peRestrictions?: string;
  @IsOptional() @IsString() dietaryRestrictions?: string;
  @IsOptional() @IsString() specialNeedsDetail?: string;
}

// ── Create Student ────────────────────────────────────────────
export class CreateStudentDto {
  // Identity
  @IsString() firstName: string;
  @IsOptional() @IsString() middleName?: string;
  @IsString() lastName: string;
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsString() arabicName?: string;
  @IsDateString() dateOfBirth: string;
  @IsOptional() @IsString() placeOfBirth?: string;
  @IsEnum(['male', 'female']) gender: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() secondNationality?: string;
  @IsOptional() @IsString() religion?: string;
  @IsOptional() @IsString() motherTongue?: string;
  @IsOptional() @IsString() bForm?: string;
  @IsOptional() @IsString() nationalId?: string;
  @IsOptional() @IsString() visaNo?: string;
  @IsOptional() @IsString() passportNumber?: string;
  @IsOptional() @IsString() photo?: string;
  @IsString() grNo: string;
  @IsOptional() @IsString() rfid?: string;
  @IsOptional() @IsString() dateOfBirthInWords?: string;

  // Contact
  @IsOptional() @IsString() personalEmail?: string;
  @IsOptional() @IsString() personalPhone?: string;
  @IsOptional() @IsString() whatsApp?: string;
  @IsOptional() @IsString() altPhone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() town?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() postalCode?: string;

  // Permanent Address (distinct from current address above)
  @IsOptional() @IsString() permanentAddress?: string;
  @IsOptional() @IsString() permanentCity?: string;
  @IsOptional() @IsString() permanentProvince?: string;
  @IsOptional() @IsString() permanentCountry?: string;
  @IsOptional() @IsString() permanentPostalCode?: string;

  // Guardians
  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => GuardianDto) guardians?: GuardianDto[];

  // Medical
  @IsOptional() @ValidateNested() @Type(() => MedicalDto) medical?: MedicalDto;

  // Enrollment
  @IsString() currentGrade: string;
  @IsOptional() @IsString() currentSection?: string;
  @IsOptional() @IsString() currentRollNumber?: string;
  @IsOptional() @IsString() currentAcademicYear?: string;
  @IsOptional() @IsString() houseGroup?: string;
  @IsOptional() @IsDateString() admissionDate?: string;
  @IsOptional() @IsString() admissionNumber?: string;
  @IsOptional() @IsMongoId() enrollmentId?: string;
  @IsOptional() @IsMongoId() applicantId?: string;
  @IsOptional() @IsString() previousSchool?: string;
  @IsOptional() @IsString() previousSchoolCity?: string;
  @IsOptional() @IsString() previousGrade?: string;
  @IsOptional() @IsString() transferCertNo?: string;
  @IsOptional() @IsDateString() tcDate?: string;

  // Emergency Contact — distinct from medical.emergencyAction (medical
  // procedure instructions); this is a real person to actually call.
  // Existed on the Student schema and in the Edit Profile form's save
  // payload, but never declared here — the global ValidationPipe's
  // whitelist:true was silently stripping all 5 of these fields from
  // every create/update request before the service ever saw them.
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactRelation?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;

  // Tutor Information
  @IsOptional() @IsString() tutorName?: string;
  @IsOptional() @IsString() tutorPhone?: string;

  // Flags
  @IsOptional() @IsBoolean() siblingInSchool?: boolean;
  @IsOptional() @IsString() siblingName?: string;
  @IsOptional() @IsString() siblingAdmissionNo?: string;
  @IsOptional() @IsString() siblingGrade?: string;
  @IsOptional() @IsBoolean() specialNeeds?: boolean;
  @IsOptional() @IsBoolean() isGifted?: boolean;
  @IsOptional() @IsBoolean() isESL?: boolean;
  @IsOptional() @IsBoolean() isSiblingOfStaff?: boolean;
  @IsOptional() @IsBoolean() scholarshipHolder?: boolean;
  @IsOptional() @IsString() scholarshipDetail?: string;
  @IsOptional() @IsBoolean() transportRequired?: boolean;
  @IsOptional() @IsString() transportRoute?: string;
  @IsOptional() @IsString() transportStop?: string;
  @IsOptional() @IsBoolean() hostelResident?: boolean;
  @IsOptional() @IsString() hostelRoom?: string;
  @IsOptional() @IsBoolean() cafeteriaSubscribed?: boolean;

  // Physical
  @IsOptional() @IsNumber() heightCm?: number;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsDateString() lastMeasuredOn?: string;

  // Programme type - distinguishes Early Years children from K-12 on the
  // same Student record. Not present here would mean the global
  // ValidationPipe's whitelist:true silently strips it from every
  // create/update request before it reaches the service.
  @IsOptional() @IsEnum(['k12', 'early-years']) programType?: string;

  // School-defined custom fields (see EnrollmentField / "Manage Enrollment
  // Fields") - keyed by fieldKey, value shape depends on the field's type.
  @IsOptional() @IsObject() customFields?: Record<string, any>;

  // schoolSlug is deliberately left undeclared as a validated property -
  // it's injected server-side from the authenticated tenant context (see
  // students.controller.ts's ctx()) and must never be client-writable,
  // or a request could move a student into another school's tenant.
  //
  // campusId, on the other hand, IS meant to be client-writable - the
  // Academic tab's "Assign Campus" control sends it on every save - but
  // being declared with no class-validator decorator at all meant the
  // global ValidationPipe's whitelist:true silently stripped it before
  // the service ever saw it, exactly like the emergencyContact* fields
  // above once did. currentGrade/currentSection right next to it in that
  // same save request are properly decorated and always saved fine,
  // which is why only the campus selection reverted after a refresh.
  schoolSlug?: string;
  @IsOptional() @IsString() campusId?: string;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  @IsOptional()
  @IsEnum(['active', 'inactive', 'graduated', 'transferred', 'expelled', 'on_leave'])
  status?: string;

  @IsOptional() @IsDateString() leftDate?: string;
  @IsOptional() @IsString() leftReason?: string;
}

export class StudentQueryDto extends PaginationDto {
  // Accepts either ?grade=Grade-1 (a single string) or repeated
  // ?grade=Grade-1&grade=Grade-2 (Express already parses that into an
  // array) - normalized to always be an array so the service layer only
  // ever has to handle one shape, whether one class was picked or many.
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  grade?: string[];

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  section?: string[];

  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() academicYear?: string;
  @IsOptional() @IsString() campusId?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) scholarshipHolder?: boolean;
  @IsOptional() @IsBoolean() @Type(() => Boolean) specialNeeds?: boolean;
}

// ── Attendance ────────────────────────────────────────────────
export class MarkAttendanceDto {
  @IsMongoId() studentId: string;
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsDateString() date: string;
  @IsEnum(['present', 'absent', 'late', 'excused', 'half_day']) status: string;
  @IsOptional() @IsString() checkInTime?: string;
  @IsOptional() @IsString() checkOutTime?: string;
  @IsOptional() @IsString() remarks?: string;
  schoolSlug?: string;
  academicYear?: string;
  markedBy?: string;
}

export class BulkAttendanceDto {
  @IsArray() @ValidateNested({ each: true })
  @Type(() => MarkAttendanceDto)
  records: MarkAttendanceDto[];
  schoolSlug?: string;
  academicYear?: string;
}

export class AttendanceQueryDto extends PaginationDto {
  @IsOptional() @IsMongoId() studentId?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() month?: string; // e.g. "2025-02"
}

// ── Fee ───────────────────────────────────────────────────────
export class CreateFeeDto {
  @IsMongoId() studentId: string;
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsString() month: string;
  @IsString() academicYear: string;
  @IsString() feeType: string;
  @IsNumber() amount: number;
  @IsOptional() @IsNumber() discount?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  schoolSlug?: string;
}

export class CollectFeeDto {
  @IsNumber() paidAmount: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsString() collectedBy?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class FeeQueryDto extends PaginationDto {
  @IsOptional() @IsMongoId() studentId?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() month?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() feeType?: string;
  @IsOptional() @IsString() academicYear?: string;
}

// ── Behaviour ─────────────────────────────────────────────────
export class CreateBehaviourDto {
  @IsMongoId() studentId: string;
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsDateString() date: string;
  @IsEnum(['positive', 'negative', 'neutral']) type: string;
  @IsString() category: string;
  @IsString() description: string;
  @IsOptional() @IsEnum(['low', 'medium', 'high', 'critical']) severity?: string;
  @IsOptional() @IsString() actionTaken?: string;
  @IsOptional() @IsBoolean() parentNotified?: boolean;
  @IsOptional() @IsDateString() followUpDate?: string;
  @IsOptional() @IsNumber() points?: number;
  schoolSlug?: string;
  academicYear?: string;
  reportedBy?: string;
}

export class UpdateBehaviourDto extends PartialType(CreateBehaviourDto) {
  @IsOptional() @IsBoolean() resolved?: boolean;
  @IsOptional() @IsString() followUpNote?: string;
}

export class BehaviourQueryDto extends PaginationDto {
  @IsOptional() @IsMongoId() studentId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsBoolean() @Type(() => Boolean) resolved?: boolean;
}

// ── Assessment Result ─────────────────────────────────────────
export class CreateAssessmentResultDto {
  @IsMongoId() studentId: string;
  @IsString() studentName: string;
  @IsString() grade: string;
  @IsOptional() @IsString() section?: string;
  @IsString() assessmentTitle: string;
  @IsString() assessmentType: string;
  @IsDateString() date: string;
  @IsArray() subjectResults: {
    subject: string; maxMarks: number; obtainedMarks: number;
    grade?: string; remarks?: string;
  }[];
  @IsOptional() @IsString() remarks?: string;
  schoolSlug?: string;
  academicYear?: string;
}
