// ============================================================
// ID CARD CONTROLLER — Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Request, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { IdCardsService } from './id-cards.service';
import { CreateIdCardTemplateDto, UpdateIdCardTemplateDto, GenerateIdCardsDto } from './dto/id-card.dto';
import { Roles } from '../../auth/decorators';
import { UserRole } from '../../auth/roles.enum';

// Creating/editing/deleting templates and printing official ID documents
// is restricted the same way question-bank/exam-paper mutation is
// (assessment.controller.ts) - any authenticated role can still be
// blocked by CustomRoleGuard's finer per-module grants, but at the base
// UserRole level only school leadership/admin roles can produce official
// identity documents.
const ID_CARD_MANAGER_ROLES = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.VICE_PRINCIPAL, UserRole.ADMIN, UserRole.HR_MANAGER, UserRole.ACADEMIC_COORDINATOR,
];

@Controller('id-cards')
export class IdCardsController {
  constructor(private readonly service: IdCardsService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      tenantId: req?.user?.tenantId,
      userName: req?.user?.name || 'Admin',
    };
  }

  @Get('templates')
  async listTemplates(@Request() req: any, @Query('entityType') entityType?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.listTemplates(schoolSlug, entityType);
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...ID_CARD_MANAGER_ROLES)
  async createTemplate(@Body() dto: CreateIdCardTemplateDto, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createTemplate(schoolSlug, userName, dto);
  }

  @Put('templates/:id')
  @Roles(...ID_CARD_MANAGER_ROLES)
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateIdCardTemplateDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateTemplate(id, schoolSlug, dto);
  }

  @Delete('templates/:id')
  @Roles(...ID_CARD_MANAGER_ROLES)
  async deleteTemplate(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteTemplate(id, schoolSlug);
  }

  @Post('templates/:id/set-default')
  @Roles(...ID_CARD_MANAGER_ROLES)
  async setDefaultTemplate(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.setDefaultTemplate(id, schoolSlug);
  }

  @Post('generate')
  @Roles(...ID_CARD_MANAGER_ROLES)
  async generate(@Body() dto: GenerateIdCardsDto, @Request() req: any, @Res() res: Response) {
    const { schoolSlug, tenantId } = this.ctx(req);
    const pdf = await this.service.generateIdCardsPdf(
      schoolSlug, tenantId, dto.entityType, dto.ids, dto.templateId, dto.includeBack ?? false,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="id-cards-${dto.entityType}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }
}
