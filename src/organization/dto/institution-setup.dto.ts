import {
  IsString, IsOptional, IsEnum, IsArray, IsDateString,
  IsEmail, IsNumber, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Board Member ─────────────────────────────────────────────
export class CreateBoardMemberDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(['chair', 'vice-chair', 'secretary', 'treasurer', 'member']) boardRole?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsDateString() appointedDate?: string;
  @IsOptional() @IsString() tenure?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateBoardMemberDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(['chair', 'vice-chair', 'secretary', 'treasurer', 'member']) boardRole?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsDateString() appointedDate?: string;
  @IsOptional() @IsString() tenure?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() notes?: string;
}

// ── Committee ────────────────────────────────────────────────
export class CreateCommitteeDto {
  @IsString() name: string;
  @IsOptional() @IsEnum(['academic', 'finance', 'disciplinary', 'examination', 'sports', 'other']) type?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() chairperson?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) members?: string[];
  @IsOptional() @IsDateString() establishedDate?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() meetingFrequency?: string;
}

export class UpdateCommitteeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(['academic', 'finance', 'disciplinary', 'examination', 'sports', 'other']) type?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() chairperson?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) members?: string[];
  @IsOptional() @IsDateString() establishedDate?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() meetingFrequency?: string;
}

// ── Meeting ──────────────────────────────────────────────────
export class CreateMeetingDto {
  @IsString() title: string;
  @IsOptional() @IsEnum(['board', 'committee', 'staff', 'parent', 'emergency', 'other']) type?: string;
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() agenda?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attendees?: string[];
  @IsOptional() @IsEnum(['scheduled', 'completed', 'cancelled']) status?: string;
  @IsOptional() @IsString() minutes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) actionItems?: string[];
}

export class UpdateMeetingDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsEnum(['board', 'committee', 'staff', 'parent', 'emergency', 'other']) type?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() agenda?: string;
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
}

export class CreateWorkflowDto {
  @IsString() name: string;
  @IsEnum(['Finance', 'HR', 'Admissions', 'Procurement', 'Documents']) module: string;
  @IsOptional() @IsString() trigger?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto) steps?: WorkflowStepDto[];
  @IsOptional() @IsString() sla?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateWorkflowDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(['Finance', 'HR', 'Admissions', 'Procurement', 'Documents']) module?: string;
  @IsOptional() @IsString() trigger?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto) steps?: WorkflowStepDto[];
  @IsOptional() @IsString() sla?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?: string;
  @IsOptional() @IsString() description?: string;
}
