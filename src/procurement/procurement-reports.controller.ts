// ============================================================
// PROCUREMENT REPORTS CONTROLLER — Eldermin ERP | NestJS
// Split out from ProcurementController (already at ~390 lines before this)
// for the same reason ProcurementSettingsService got its own controller
// section — keeps each file a sane size. Mounted under the same
// `procurement` prefix so frontend routes read naturally as
// `/procurement/reports/...` and `/procurement/scheduled-reports/...`.
// ============================================================

import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Request, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ProcurementReportsService } from './procurement-reports.service';

@Controller('procurement')
export class ProcurementReportsController {
  constructor(private readonly reports: ProcurementReportsService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userId: req?.user?.sub || req?.user?.id,
    };
  }

  private filters(query: any) {
    return { from: query.from, to: query.to, campusId: query.campusId };
  }

  // ── Report data (on-screen preview) ──────────────────────────
  @Get('reports/:key')
  async getReportData(@Param('key') key: string, @Query() query: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reports.getReportData(schoolSlug, key, this.filters(query));
  }

  // ── Export (PDF via the same ReportTemplate engine every other
  // printed document in this app uses; Excel/CSV via XLSX) ────
  @Get('reports/:key/export')
  async exportReport(
    @Param('key') key: string,
    @Query('format') format: 'pdf' | 'excel' | 'csv' = 'pdf',
    @Query() query: any,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const { schoolSlug, userId } = this.ctx(req);
    const { buffer, contentType, filename } = await this.reports.generateReportBuffer(
      schoolSlug, key, format, this.filters(query), userId,
    );
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  // ── Scheduled Reports CRUD ────────────────────────────────────
  @Get('scheduled-reports')
  async getScheduledReports(@Query() query: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reports.getScheduledReports(schoolSlug, query);
  }

  @Post('scheduled-reports')
  @HttpCode(HttpStatus.CREATED)
  async createScheduledReport(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reports.createScheduledReport(schoolSlug, dto, req?.user?.name);
  }

  @Put('scheduled-reports/:id')
  async updateScheduledReport(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reports.updateScheduledReport(id, schoolSlug, dto);
  }

  @Delete('scheduled-reports/:id')
  async deleteScheduledReport(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reports.deleteScheduledReport(id, schoolSlug);
  }

  @Post('scheduled-reports/:id/run-now')
  async runScheduledReportNow(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.reports.runScheduledReportNow(id, schoolSlug);
  }
}
