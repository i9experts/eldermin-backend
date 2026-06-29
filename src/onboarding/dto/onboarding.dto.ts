import {
  IsString, IsEmail, IsOptional, IsArray, IsNumber, MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsString() schoolName: string;
  @IsOptional() @IsString() role?: string;
}

export class OnboardingStep1Dto {
  @IsOptional() @IsString() institutionType?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() academicSystem?: string[];
  @IsOptional() @IsString() logoUrl?: string;
}

export class OnboardingStep2Dto {
  @IsOptional() @IsString() campusType?: string;
  @IsOptional() @IsArray() campuses?: {
    name: string; code: string; address?: string;
    head?: string; phone?: string;
  }[];
}

export class OnboardingStep3Dto {
  @IsOptional() @IsString() academicYearStart?: string;
  @IsOptional() @IsString() academicYearEnd?: string;
  @IsOptional() @IsArray() terms?: string[];
  @IsOptional() @IsArray() grades?: string[];
  @IsOptional() @IsNumber() sectionsPerGrade?: number;
  @IsOptional() @IsArray() subjects?: string[];
}

export class OnboardingStep4Dto {
  @IsOptional() @IsArray() userRoles?: string[];
}

export class OnboardingStep5Dto {
  @IsOptional() @IsString() selectedBundle?: string;
  @IsOptional() @IsArray() selectedModules?: string[];
}

export class OnboardingStep6Dto {
  @IsOptional() @IsString() feeFrequency?: string;
  @IsOptional() @IsString() lateFeePolicy?: string;
  @IsOptional() @IsString() bankAccount?: string;
  @IsOptional() @IsArray() feeHeads?: string[];
  @IsOptional() @IsString() payrollStructure?: string;
}

export class OnboardingStep7Dto {
  @IsOptional() @IsArray() admissionDocs?: string[];
  @IsOptional() @IsArray() employeeDocs?: string[];
  @IsOptional() @IsArray() policyDocs?: string[];
}

export class SaveStepDto {
  @IsNumber() step: number;
  data: any;
}
