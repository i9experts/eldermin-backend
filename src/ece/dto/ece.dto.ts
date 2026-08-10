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
  @IsOptional() @IsString() tryThisAtHome?: string;
}

export class FamilyResponseDto {
  @IsString() text: string;
  @IsString() respondedBy: string;
}

// ── Learning Experience ─────────────────────────────────────
export class DifferentiationDto {
  @IsOptional() @IsString() support?: string;
  @IsOptional() @IsString() core?: string;
  @IsOptional() @IsString() extension?: string;
}
export class CreateLearningExperienceDto {
  @IsString() title: string;
  @IsOptional() @IsString() ageRangeLabel?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) domainIds?: string[];
  @IsOptional() @IsArray() @IsMongoId({ each: true }) skillIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) resources?: string[];
  @IsOptional() @IsString() learningIntent?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) observationOpportunities?: string[];
  @IsOptional() @ValidateNested() @Type(() => DifferentiationDto) differentiation?: DifferentiationDto;
}
export class UpdateLearningExperienceDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() ageRangeLabel?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) domainIds?: string[];
  @IsOptional() @IsArray() @IsMongoId({ each: true }) skillIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) resources?: string[];
  @IsOptional() @IsString() learningIntent?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) observationOpportunities?: string[];
  @IsOptional() @ValidateNested() @Type(() => DifferentiationDto) differentiation?: DifferentiationDto;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Weekly Provision Plan ────────────────────────────────────
export class PlannedExperienceDto {
  @IsNumber() day: number;
  @IsMongoId() experienceId: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpsertWeeklyPlanDto {
  @IsString() weekStartDate: string;
  @IsString() gradeLevel: string;
  @IsOptional() @IsString() sectionName?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PlannedExperienceDto) plannedExperiences: PlannedExperienceDto[];
}

// ── Environment / Provision Areas ────────────────────────────
export class CreateEnvironmentAreaDto {
  @IsString() name: string;
  @IsOptional() @IsString() gradeLevel?: string;
  @IsOptional() @IsString() sectionName?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) resources?: string[];
  @IsOptional() @IsString() currentProvocation?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) targetDomainIds?: string[];
}
export class UpdateEnvironmentAreaDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) resources?: string[];
  @IsOptional() @IsString() currentProvocation?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) targetDomainIds?: string[];
  @IsOptional() @IsString() rotationDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class LogSafetyCheckDto {
  @IsString() checkedBy: string;
}
export class AddObservationNoteDto {
  @IsString() note: string;
}

// ── Framework Mapping ─────────────────────────────────────────
export class CreateFrameworkMappingDto {
  @IsMongoId() frameworkId: string;
  @IsMongoId() skillId: string;
  @IsString() displayDomainName: string;
  @IsString() displaySkillName: string;
}
export class UpdateFrameworkMappingDto {
  @IsOptional() @IsString() displayDomainName?: string;
  @IsOptional() @IsString() displaySkillName?: string;
}

// ── Montessori ────────────────────────────────────────────────
export class CreateMontessoriMaterialDto {
  @IsString() name: string;
  @IsEnum(['practical_life', 'sensorial', 'language', 'mathematics', 'culture']) area: string;
  @IsOptional() @IsString() ageRangeLabel?: string;
  @IsOptional() @IsString() prerequisites?: string;
  @IsOptional() @IsString() directAim?: string;
  @IsOptional() @IsString() indirectAim?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) presentationSteps?: string[];
  @IsOptional() @IsString() controlOfError?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) pointsOfInterest?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) vocabulary?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) extensions?: string[];
  @IsOptional() @IsArray() @IsMongoId({ each: true }) linkedSkillIds?: string[];
}

export class UpsertWorkRecordDto {
  @IsMongoId() studentId: string;
  @IsMongoId() materialId: string;
  @IsEnum(['presented', 'practising', 'repeated_independently', 'needs_representation', 'mastered', 'ready_for_extension']) status: string;
  @IsOptional() @IsString() note?: string;
}

// ── AI Assistance ─────────────────────────────────────────────
export class SuggestMappingsDto {
  @IsString() narrative: string;
}
export class CheckQualityDto {
  @IsString() narrative: string;
}
