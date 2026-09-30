import {
  IsString, IsOptional, IsEnum, IsBoolean, IsArray, IsMongoId, ArrayMinSize,
  IsNumber, Min, Max, ValidateNested, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CERTIFICATE_TYPES } from '../schemas/certificate-template.schema';

class SignatoryDto {
  @IsString() label: string;
}

export class CreateCertificateTemplateDto {
  @IsString() name: string;
  @IsEnum(CERTIFICATE_TYPES) certificateType: string;
  @IsOptional() @IsEnum(['portrait', 'landscape']) orientation?: string;
  @IsOptional() @IsEnum(['formal', 'classic', 'modern', 'minimal']) layoutStyle?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() backgroundImageUrl?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1) backgroundImageOpacity?: number;
  @IsOptional() @IsBoolean() showBorder?: boolean;
  @IsOptional() @IsBoolean() showQrCode?: boolean;
  @IsOptional() @IsBoolean() showSeal?: boolean;
  @IsOptional() @IsString() sealImageUrl?: string;
  @IsString() bodyTemplate: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SignatoryDto) signatories?: SignatoryDto[];
  @IsOptional() @IsString() footerNote?: string;
}

export class UpdateCertificateTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(CERTIFICATE_TYPES) certificateType?: string;
  @IsOptional() @IsEnum(['portrait', 'landscape']) orientation?: string;
  @IsOptional() @IsEnum(['formal', 'classic', 'modern', 'minimal']) layoutStyle?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() backgroundImageUrl?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1) backgroundImageOpacity?: number;
  @IsOptional() @IsBoolean() showBorder?: boolean;
  @IsOptional() @IsBoolean() showQrCode?: boolean;
  @IsOptional() @IsBoolean() showSeal?: boolean;
  @IsOptional() @IsString() sealImageUrl?: string;
  @IsOptional() @IsString() bodyTemplate?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SignatoryDto) signatories?: SignatoryDto[];
  @IsOptional() @IsString() footerNote?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class GenerateCertificatesDto {
  @IsMongoId() templateId: string;
  @IsArray() @ArrayMinSize(1) @IsMongoId({ each: true }) studentIds: string[];
  // Shared across every student in this batch - the common case (a whole
  // class's Merit Certificates for the same event, a same-day batch of
  // Transfer Certificates). Per-student overrides aren't supported yet;
  // a template needing a different value per student is generated one
  // student at a time.
  @IsOptional() @IsObject() extraFields?: Record<string, string>;
  @IsOptional() @IsString() issueDate?: string;
}
