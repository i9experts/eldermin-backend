// ============================================================
// CERTIFICATES CONTROLLER — Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Request, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { CertificatesService } from './certificates.service';
import { CreateCertificateTemplateDto, UpdateCertificateTemplateDto, GenerateCertificatesDto } from './dto/certificate.dto';
import { Roles } from '../../auth/decorators';
import { UserRole } from '../../auth/roles.enum';

// Same "who may produce an official document" bar as ID cards
// (id-cards.controller.ts) - a Transfer Certificate carries real legal
// weight, so template management and generation are restricted the same
// way, subject to the same CustomRoleGuard fine-grained overrides.
const CERTIFICATE_MANAGER_ROLES = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.VICE_PRINCIPAL, UserRole.ADMIN, UserRole.ACADEMIC_COORDINATOR,
];

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly service: CertificatesService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
    };
  }

  @Get('templates')
  async listTemplates(@Request() req: any, @Query('certificateType') certificateType?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.listTemplates(schoolSlug, certificateType);
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...CERTIFICATE_MANAGER_ROLES)
  async createTemplate(@Body() dto: CreateCertificateTemplateDto, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createTemplate(schoolSlug, userName, dto);
  }

  @Put('templates/:id')
  @Roles(...CERTIFICATE_MANAGER_ROLES)
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateCertificateTemplateDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateTemplate(id, schoolSlug, dto);
  }

  @Delete('templates/:id')
  @Roles(...CERTIFICATE_MANAGER_ROLES)
  async deleteTemplate(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteTemplate(id, schoolSlug);
  }

  @Post('templates/:id/set-default')
  @Roles(...CERTIFICATE_MANAGER_ROLES)
  async setDefaultTemplate(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.setDefaultTemplate(id, schoolSlug);
  }

  @Get('students/:studentId/issued')
  async getIssuedForStudent(@Param('studentId') studentId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getIssuedForStudent(schoolSlug, studentId);
  }

  @Post('generate')
  @Roles(...CERTIFICATE_MANAGER_ROLES)
  async generate(@Body() dto: GenerateCertificatesDto, @Request() req: any, @Res() res: Response) {
    const { schoolSlug, userName } = this.ctx(req);
    const pdf = await this.service.generateCertificatesPdf(
      schoolSlug, dto.templateId, dto.studentIds, dto.extraFields, dto.issueDate, userName,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificates.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }
}
