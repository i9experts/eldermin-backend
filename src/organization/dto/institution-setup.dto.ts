import {
  IsString, IsOptional, IsEnum, IsArray, IsDateString,
  IsEmail, IsNumber, ValidateNested, IsMongoId, IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Board Member ─────────────────────────────────────────────
export class CreateBoardMemberDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() profilePhotoUrl?: string;
  @IsOptional() @IsString() biography?: string;
  @IsOptional() @IsEnum(['male', 'female', 'other', 'prefer_not_to_say']) gender?: string;
  @IsOptional() @IsEnum(['chair', 'vice-chair', 'secretary', 'treasurer', 'member']) boardRole?: string;
  @IsOptional() @IsEnum(['independent', 'non_executive', 'executive']) directorType?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsDateString() appointedDate?: string;
  @IsOptional() @IsDateString() termStartDate?: string;
  @IsOptional() @IsDateString() termEndDate?: string;
  @IsOptional() @IsNumber() termNumber?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) expertiseAreas?: string[];
  @IsOptional() @IsBoolean() conflictOfInterestDeclared?: boolean;
  @IsOptional() @IsString() conflictOfInterestDetails?: string;
  @IsOptional() @IsDateString() conflictOfInterestDate?: string;
  @IsOptional() @IsBoolean() codeOfConductSigned?: boolean;
  @IsOptional() @IsDateString() codeOfConductSignedDate?: string;
  @IsOptional() @IsBoolean() orientationCompleted?: boolean;
  @IsOptional() @IsBoolean() isVoluntary?: boolean;
  @IsOptional() @IsNumber() annualRemuneration?: number;
  @IsOptional() @IsEnum(['active', 'inactive', 'resigned', 'term_expired']) status?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateBoardMemberDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() profilePhotoUrl?: string;
  @IsOptional() @IsString() biography?: string;
  @IsOptional() @IsEnum(['male', 'female', 'other', 'prefer_not_to_say']) gender?: string;
  @IsOptional() @IsEnum(['chair', 'vice-chair', 'secretary', 'treasurer', 'member']) boardRole?: string;
  @IsOptional() @IsEnum(['independent', 'non_executive', 'executive']) directorType?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsDateString() appointedDate?: string;
  @IsOptional() @IsDateString() termStartDate?: string;
  @IsOptional() @IsDateString() termEndDate?: string;
  @IsOptional() @IsNumber() termNumber?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) expertiseAreas?: string[];
  @IsOptional() @IsBoolean() conflictOfInterestDeclared?: boolean;
  @IsOptional() @IsString() conflictOfInterestDetails?: string;
  @IsOptional() @IsDateString() conflictOfInterestDate?: string;
  @IsOptional() @IsBoolean() codeOfConductSigned?: boolean;
  @IsOptional() @IsDateString() codeOfConductSignedDate?: string;
  @IsOptional() @IsBoolean() orientationCompleted?: boolean;
  @IsOptional() @IsBoolean() isVoluntary?: boolean;
  @IsOptional() @IsNumber() annualRemuneration?: number;
  @IsOptional() @IsEnum(['active', 'inactive', 'resigned', 'term_expired']) status?: string;
  @IsOptional() @IsString() notes?: string;
}

// ── Committee ────────────────────────────────────────────────
export class CommitteeMemberDto {
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() whatsapp?: string;
}

export class CreateCommitteeDto {
  @IsString() name: string;
  @IsOptional() @IsEnum(['academic', 'finance', 'disciplinary', 'examination', 'sports', 'other']) type?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() chairperson?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CommitteeMemberDto) members?: CommitteeMemberDto[];
  @IsOptional() @IsDateString() establishedDate?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() meetingFrequency?: string;
}

export class UpdateCommitteeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(['academic', 'finance', 'disciplinary', 'examination', 'sports', 'other']) type?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() chairperson?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CommitteeMemberDto) members?: CommitteeMemberDto[];
  @IsOptional() @IsDateString() establishedDate?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() meetingFrequency?: string;
}

// ── Meeting ──────────────────────────────────────────────────
export class AgendaItemDto {
  @IsNumber() order: number;
  @IsString() topic: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() presenter?: string;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsOptional() @IsEnum(['discussion', 'decision', 'information', 'update']) itemType?: string;
}

export class CreateMeetingDto {
  @IsString() title: string;
  @IsOptional() @IsMongoId() committeeId?: string;
  @IsOptional() @IsEnum(['board', 'committee', 'staff', 'parent', 'emergency', 'other']) type?: string;
  @IsOptional() @IsEnum(['regular', 'emergency', 'special', 'agm']) category?: string;
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsOptional() @IsEnum(['in_person', 'virtual', 'hybrid']) mode?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() meetingLink?: string;
  @IsOptional() @IsString() chairperson?: string;
  @IsOptional() @IsString() minuteTaker?: string;
  @IsOptional() @IsString() agenda?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AgendaItemDto) agendaItems?: AgendaItemDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) attendees?: string[];
  @IsOptional() @IsEnum(['scheduled', 'completed', 'cancelled']) status?: string;
  @IsOptional() @IsString() minutes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) actionItems?: string[];
}

export class UpdateMeetingDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsEnum(['board', 'committee', 'staff', 'parent', 'emergency', 'other']) type?: string;
  @IsOptional() @IsEnum(['regular', 'emergency', 'special', 'agm']) category?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsOptional() @IsEnum(['in_person', 'virtual', 'hybrid']) mode?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() meetingLink?: string;
  @IsOptional() @IsString() chairperson?: string;
  @IsOptional() @IsString() minuteTaker?: string;
  @IsOptional() @IsString() agenda?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AgendaItemDto) agendaItems?: AgendaItemDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) attendees?: string[];
  @IsOptional() @IsEnum(['scheduled', 'completed', 'cancelled']) status?: string;
  @IsOptional() @IsString() minutes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) actionItems?: string[];
}

// ── Workflow ─────────────────────────────────────────────────
export class WorkflowStepDto {
  @IsNumber() order: number;
  @IsString() approverRole: string;
  @IsOptional() @IsString() sla?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) requiredChecks?: string[];
  @IsOptional() @IsBoolean() notifyByEmail?: boolean;
}

export class CreateWorkflowDto {
  @IsString() name: string;
  @IsEnum(['Finance', 'HR', 'Admissions', 'Procurement', 'Documents']) module: string;
  @IsOptional() @IsString() trigger?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto) steps?: WorkflowStepDto[];
  @IsOptional() @IsString() sla?: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsString() escalationContact?: string;
  @IsOptional() @IsString() escalationAfter?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateWorkflowDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(['Finance', 'HR', 'Admissions', 'Procurement', 'Documents']) module?: string;
  @IsOptional() @IsString() trigger?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto) steps?: WorkflowStepDto[];
  @IsOptional() @IsString() sla?: string;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsString() escalationContact?: string;
  @IsOptional() @IsString() escalationAfter?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() description?: string;
}

export class CreateAuthorityDelegationDto {
  @IsString() delegatorName: string;
  @IsOptional() @IsString() delegatorRole?: string;
  @IsString() delegateName: string;
  @IsOptional() @IsString() delegateRole?: string;
  @IsString() scope: string;
  @IsOptional() @IsString() reason?: string;
  @IsString() startDate: string;
  @IsString() endDate: string;
}
