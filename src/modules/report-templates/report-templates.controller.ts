// ============================================================
// REPORT TEMPLATES CONTROLLER — REST API
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Delete, Body, Param,
  Request, Res, UseGuards, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SchoolGuard } from '../../auth/school.guard';
import { ReportTemplatesService } from './report-templates.service';
import { CreateReportTemplateDto, UpdateReportTemplateDto } from './dto/report-template.dto';
import { PdfService } from '../../pdf/pdf.service';
import { sampleDataForType } from '../../pdf/pdf.service';

@Controller('report-templates')
@UseGuards(JwtAuthGuard, SchoolGuard)
export class ReportTemplatesController {
  constructor(
    private readonly reportTemplatesService: ReportTemplatesService,
    private readonly pdfService: PdfService,
  ) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userId: req?.user?.sub || req?.user?._id || 'system',
    };
  }

  /** GET /api/v1/report-templates */
  @Get()
  async list(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reportTemplatesService.list(schoolSlug);
  }

  /** GET /api/v1/report-templates/:type */
  @Get(':type')
  async getDefaultForType(@Param('type') type: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reportTemplatesService.getDefaultForType(schoolSlug, type);
  }

  /** POST /api/v1/report-templates */
  @Post()
  async create(@Body() dto: CreateReportTemplateDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reportTemplatesService.create(schoolSlug, dto);
  }

  /** PUT /api/v1/report-templates/:id */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReportTemplateDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.reportTemplatesService.update(id, schoolSlug, dto);
  }

  /** DELETE /api/v1/report-templates/:id */
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reportTemplatesService.remove(id, schoolSlug);
  }

  /** POST /api/v1/report-templates/:id/default */
  @Post(':id/default')
  async setDefault(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reportTemplatesService.setDefault(id, schoolSlug);
  }

  /** POST /api/v1/report-templates/:id/preview */
  @Post(':id/preview')
  async preview(
    @Param('id') id: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const { schoolSlug, userId } = this.ctx(req);
    const template = await this.reportTemplatesService.findById(id, schoolSlug);
    const sampleData = sampleDataForType(template.type);
    const pdf = await this.pdfService.generateFromTemplate(
      schoolSlug,
      template.type,
      sampleData,
      userId,
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="preview-${template.type}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }

  /** POST /api/v1/report-templates/:id/duplicate */
  @Post(':id/duplicate')
  async duplicate(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reportTemplatesService.duplicate(id, schoolSlug);
  }
}
