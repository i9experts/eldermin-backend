import {
  Controller, Get, Post, Body, Res, Query,
  UseGuards, Request, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SchoolGuard } from '../auth/school.guard';
import { PdfService, GenerateReportCardDto, GenerateInvoiceDto, BulkReportCardDto } from './pdf.service';

@Controller('pdf')
@UseGuards(JwtAuthGuard, SchoolGuard)
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Post('report-card')
  async generateReportCard(
    @Body() dto: GenerateReportCardDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const schoolSlug = req.headers['x-school-slug'];
    const pdf = await this.pdfService.generateReportCard(schoolSlug, dto, req.user.sub);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report-card-${dto.studentId}-${dto.academicYear}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }

  @Post('invoice')
  async generateInvoice(
    @Body() dto: GenerateInvoiceDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const schoolSlug = req.headers['x-school-slug'];
    const pdf = await this.pdfService.generateInvoice(schoolSlug, dto, req.user.sub);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${dto.invoiceId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }

  @Post('report-cards/bulk')
  async bulkReportCards(
    @Body() dto: BulkReportCardDto,
    @Request() req: any,
  ) {
    const schoolSlug = req.headers['x-school-slug'];
    return this.pdfService.generateBulkReportCards(schoolSlug, dto, req.user.sub);
  }

  @Get('logs')
  async getLogs(
    @Request() req: any,
    @Query('type') type?: string,
  ) {
    const schoolSlug = req.headers['x-school-slug'];
    return this.pdfService.getPdfLogs(schoolSlug, type);
  }
}
