import {
  IsString, IsOptional, IsNumber, IsArray, IsEnum, IsBoolean, IsMongoId,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Framework ──────────────────────────────────────────────
export class CreateFrameworkDto {
  @IsString() name: string;
  @IsEnum(['montessori', 'kindergarten', 'head_start', 'play_based', 'reggio', 'eccd', 'national', 'custom']) type: string;
  @IsOptional() @IsArray() @IsString({ each: true }) progressionLevels?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) campusIds?: string[];
}
export class UpdateFrameworkDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) progressionLevels?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Domain ──────────────────────────────────────────────────
export class CreateDomainDto {
  @IsString() name: string;
  @IsString() canonicalKey: string;
  @IsOptional() @IsNumber() order?: number;
}
export class UpdateDomainDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Skill ───────────────────────────────────────────────────
export class CreateSkillDto {
  @IsMongoId() domainId: string;
  @IsOptional() @IsString() subDomainName?: string;
  @IsString() name: string;
  @IsString() canonicalKey: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) ageBandIds?: string[];
}
export class UpdateSkillDto {
  @IsOptional() @IsString() subDomainName?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) ageBandIds?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Indicator ───────────────────────────────────────────────
export class CreateIndicatorDto {
  @IsMongoId() skillId: string;
  @IsString() text: string;
  @IsOptional() @IsMongoId() ageBandId?: string;
}

// ── Age Band ────────────────────────────────────────────────
export class CreateAgeBandDto {
  @IsString() label: string;
  @IsNumber() minMonths: number;
  @IsNumber() maxMonths: number;
  @IsOptional() @IsNumber() order?: number;
}

// ── Observation ─────────────────────────────────────────────
export class SkillMappingDto {
  @IsMongoId() skillId: string;
  @IsOptional() @IsMongoId() indicatorId?: string;
  @IsString() progressionLevel: string;
}
export class EvidenceItemDto {
  @IsEnum(['photo', 'video', 'voice_note', 'work_sample', 'document']) type: string;
  @IsString() url: string;
  @IsOptional() @IsString() caption?: string;
}
export class CreateObservationDto {
  @IsMongoId() studentId: string;
  @IsOptional() @IsEnum(['spontaneous', 'planned', 'montessori_presentation', 'learning_story']) observationType?: string;
  @IsOptional() @IsString() context?: string;
  @IsString() narrative: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SkillMappingDto) skillMappings?: SkillMappingDto[];
  @IsOptional() @IsString() nextStep?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EvidenceItemDto) evidence?: EvidenceItemDto[];
  @IsOptional() @IsBoolean() isSharedWithFamily?: boolean;
}

export class QuickObserveDto {
  @IsMongoId() studentId: string;
  @IsMongoId() skillId: string;
  @IsString() progressionLevel: string;
  @IsOptional() @IsString() voiceNoteUrl?: string;
  @IsOptional() @IsString() narrative?: string;
}

export class ObservationQueryDto {
  @IsOptional() @IsMongoId() studentId?: string;
  @IsOptional() @IsMongoId() skillId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

// ── Portfolio ───────────────────────────────────────────────
export class CreatePortfolioEntryDto {
  @IsMongoId() studentId: string;
  @IsOptional() @IsMongoId() sourceObservationId?: string;
  @IsString() title: string;
  @IsString() narrative: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EvidenceItemDto) evidence?: EvidenceItemDto[];
  @IsOptional() @IsBoolean() isVisibleToFamily?: boolean;
}

export class FamilyResponseDto {
  @IsString() text: string;
  @IsString() respondedBy: string;
}
