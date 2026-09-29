import { IsString, IsOptional, IsEnum, IsBoolean, IsArray, IsMongoId, ArrayMinSize, IsNumber, Min, Max } from 'class-validator';

export class CreateIdCardTemplateDto {
  @IsEnum(['student', 'staff']) entityType: string;
  @IsString() name: string;
  @IsOptional() @IsEnum(['classic', 'modern', 'minimal', 'vibrant']) layoutStyle?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() backgroundImageUrl?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1) backgroundImageOpacity?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) showFields?: string[];
  @IsOptional() @IsBoolean() showQrCode?: boolean;
  @IsOptional() @IsBoolean() showBarcode?: boolean;
  @IsOptional() @IsBoolean() showSignatureLine?: boolean;
  @IsOptional() @IsString() validityText?: string;
  @IsOptional() @IsString() noteText?: string;
}

export class UpdateIdCardTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(['classic', 'modern', 'minimal', 'vibrant']) layoutStyle?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() backgroundImageUrl?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1) backgroundImageOpacity?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) showFields?: string[];
  @IsOptional() @IsBoolean() showQrCode?: boolean;
  @IsOptional() @IsBoolean() showBarcode?: boolean;
  @IsOptional() @IsBoolean() showSignatureLine?: boolean;
  @IsOptional() @IsString() validityText?: string;
  @IsOptional() @IsString() noteText?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class GenerateIdCardsDto {
  @IsEnum(['student', 'staff']) entityType: string;
  @IsOptional() @IsMongoId() templateId?: string;
  @IsArray() @ArrayMinSize(1) @IsMongoId({ each: true }) ids: string[];
  @IsOptional() @IsBoolean() includeBack?: boolean;
}
