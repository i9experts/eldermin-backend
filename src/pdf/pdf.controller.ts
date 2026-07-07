import {
  Controller, Get, Post, Body, Res, Query,
  UseGuards, Request, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SchoolGuard } from '../auth/school.guard';
import { PdfService, GenerateReportCardDto, GenerateInvoiceDto, BulkReportCardDto } from './pdf.service';
import { IsIn, IsMongoId, IsObject, IsOptional, IsString } from 'class-validator';
import { REPORT_TEMPLATE_TYPES } from '../modules/report-templates/schemas/report-template.schema';

export class GenerateFromTemplateDto {
  @IsOptional() @IsMongoId() templateId?: string;
  @IsIn(REPORT_TEMPLATE_TYPES as unknown as string[]) type: string;
  @IsObject() data: Record<string, any>;
}

export class GenerateFeeReceiptDto {
  @IsMongoId() paymentId: string;
  @IsOptional() @IsMongoId() templateId?: string;
}

export class GenerateVoucherDto {
  @IsOptional() @IsMongoId() expenseId?: string;
  @IsOptional() @IsObject() voucherData?: Record<string, any>;
  @IsOptional() @IsMongoId() templateId?: string;
  @IsOptional() @IsString() type?: string;
}

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

  @Post('generate')
  async generate(
    @Body() dto: GenerateFromTemplateDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const schoolSlug = req.user?.schoolSlug || req.headers['x-school-slug'] || 'demo-school';
    const pdf = await this.pdfService.generateFromTemplate(
      schoolSlug,
      dto.type,
      dto.data,
      req.user?.sub,
      dto.templateId,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${dto.type}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }

  @Post('fee-receipt')
  async feeReceipt(
    @Body() dto: GenerateFeeReceiptDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const schoolSlug = req.user?.schoolSlug || req.headers['x-school-slug'] || 'demo-school';
    const pdf = await this.pdfService.generateFeeReceipt(schoolSlug, dto, req.user?.sub);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="fee-receipt-${dto.paymentId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }

  @Post('voucher')
  async voucher(
    @Body() dto: GenerateVoucherDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const schoolSlug = req.user?.schoolSlug || req.headers['x-school-slug'] || 'demo-school';
    const pdf = await this.pdfService.generateVoucher(schoolSlug, dto, req.user?.sub);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="voucher-${dto.type || 'payment_voucher'}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }
}
