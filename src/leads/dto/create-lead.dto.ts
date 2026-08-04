import { IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsIn(['onboarding_wizard', 'contact_form', 'manual'])
  source: 'onboarding_wizard' | 'contact_form' | 'manual';

  @IsString() @MaxLength(200)
  schoolName: string;

  @IsOptional() @IsString() schoolType?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() city?: string;

  @IsString() @MaxLength(120)
  adminName: string;

  @IsEmail()
  adminEmail: string;

  @IsOptional() @IsString() adminPhone?: string;
  @IsOptional() @IsString() adminRole?: string;

  @IsOptional() @IsString() studentCount?: string;
  @IsOptional() @IsString() staffCount?: string;
  @IsOptional() @IsString() classCount?: string;
  @IsOptional() @IsString() gradeRange?: string;

  @IsOptional() @IsArray() modulesRequested?: string[];
  @IsOptional() @IsString() planRequested?: string;
  @IsOptional() @IsString() billingCycle?: string;
  @IsOptional() @IsArray() integrationsRequested?: string[];

  @IsOptional() @IsString() preferredTrainingDate?: string;
  @IsOptional() @IsString() preferredTrainingTime?: string;
  @IsOptional() @IsString() trainingMode?: string;

  @IsOptional() @IsString() inquiryType?: string;
  @IsOptional() @IsString() @MaxLength(3000) message?: string;
}
