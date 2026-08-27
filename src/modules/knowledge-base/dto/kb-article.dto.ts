// ============================================================
// KB ARTICLE DTOs
// Eldermin ERP | NestJS
// ============================================================

import { IsString, IsOptional, IsArray, IsInt, IsNotEmpty } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateKbArticleDto {
  @IsString() @IsNotEmpty() module: string;
  @IsString() @IsNotEmpty() tabKey: string;
  @IsString() @IsNotEmpty() title: string;

  @IsOptional() @IsString() tagline?: string;
  @IsOptional() @IsString() body?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) steps?: string[];

  @IsOptional() @IsInt() order?: number;
}

export class UpdateKbArticleDto extends PartialType(CreateKbArticleDto) {}
