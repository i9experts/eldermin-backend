// ============================================================
// REPORT TEMPLATE DTOs
// Eldermin ERP | NestJS
// ============================================================

import { IsString, IsOptional, IsIn, IsBoolean, IsArray } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { REPORT_TEMPLATE_TYPES } from '../schemas/report-template.schema';

export class CreateReportTemplateDto {
  @IsString() name: string;

  @IsIn(REPORT_TEMPLATE_TYPES as unknown as string[])
  type: string;

  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional() letterhead?: Record<string, any>;
  @IsOptional() header?: Record<string, any>;
  @IsOptional() @IsArray() sections?: any[];
  @IsOptional() footer?: Record<string, any>;
  @IsOptional() page?: Record<string, any>;

  // Injected by controller
  schoolSlug?: string;
  tenantId?: string;
}

export class UpdateReportTemplateDto extends PartialType(CreateReportTemplateDto) {}
