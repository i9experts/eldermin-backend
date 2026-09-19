import { IsString, IsOptional, IsEnum, IsBoolean, IsArray, IsMongoId, ArrayMinSize } from 'class-validator';

export class CreateIdCardTemplateDto {
  @IsEnum(['student', 'staff']) entityType: string;
  @IsString() name: string;
  @IsOptional() @IsEnum(['classic', 'modern', 'minimal']) layoutStyle?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() backgroundImageUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) showFields?: string[];
  @IsOptional() @IsBoolean() showQrCode?: boolean;
  @IsOptional() @IsBoolean() showBarcode?: boolean;
  @IsOptional() @IsBoolean() showSignatureLine?: boolean;
  @IsOptional() @IsString() validityText?: string;
}

export class UpdateIdCardTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(['classic', 'modern', 'minimal']) layoutStyle?: string;
  @IsOptional() @IsString() primaryColor?: string;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() backgroundImageUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) showFields?: string[];
  @IsOptional() @IsBoolean() showQrCode?: boolean;
  @IsOptional() @IsBoolean() showBarcode?: boolean;
  @IsOptional() @IsBoolean() showSignatureLine?: boolean;
  @IsOptional() @IsString() validityText?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class GenerateIdCardsDto {
  @IsEnum(['student', 'staff']) entityType: string;
  @IsOptional() @IsMongoId() templateId?: string;
  @IsArray() @ArrayMinSize(1) @IsMongoId({ each: true }) ids: string[];
  @IsOptional() @IsBoolean() includeBack?: boolean;
}
