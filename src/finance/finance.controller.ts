import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, Res, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
    };
  }

  // Dashboard
  @Get('dashboard') async getDashboard(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug, ay);
  }

  // COA
  @Get('coa') async getCOA(@Request() req: any, @Query('type') type?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCOA(schoolSlug, type);
  }
  @Post('coa') @HttpCode(HttpStatus.CREATED)
  async createCOA(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCOA({ ...dto, schoolSlug });
  }
  @Post('coa/seed') async seedCOA(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.seedDefaultCOA(schoolSlug);
  }
  @Patch('coa/:id') async updateCOA(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCOA(id, schoolSlug, dto);
  }
  @Delete('coa/:id') async deleteCOA(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteCOA(id, schoolSlug);
  }

  // ── Fiscal Years ──────────────────────────────────────────
  @Get('fiscal-years') async getFiscalYears(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getFiscalYears(schoolSlug);
  }
  @Post('fiscal-years') async createFiscalYear(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createFiscalYear({ ...dto, schoolSlug });
  }
  @Patch('fiscal-years/:id/close') async closeFiscalYear(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.closeFiscalYear(id, schoolSlug, userName);
  }

  // ── Accounting Periods ────────────────────────────────────
  @Get('accounting-periods') async getAccountingPeriods(@Request() req: any, @Query('fiscalYearId') fiscalYearId?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAccountingPeriods(schoolSlug, fiscalYearId);
  }
  @Patch('accounting-periods/:id/status') async setPeriodStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.setPeriodStatus(id, schoolSlug, status);
  }

  // ── Cost Centers ───────────────────────────────────────────
  @Get('cost-centers') async getCostCenters(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCostCenters(schoolSlug);
  }
  @Post('cost-centers') async createCostCenter(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCostCenter({ ...dto, schoolSlug });
  }
  @Patch('cost-centers/:id') async updateCostCenter(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCostCenter(id, schoolSlug, dto);
  }
  @Post('cost-centers/seed') async seedCostCenters(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.seedCostCentersFromCampuses(schoolSlug);
  }

  // ── Payment Terms ──────────────────────────────────────────
  @Get('payment-terms') async getPaymentTerms(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPaymentTerms(schoolSlug);
  }
  @Post('payment-terms') async createPaymentTerm(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createPaymentTerm({ ...dto, schoolSlug });
  }
  @Post('payment-terms/seed') async seedPaymentTerms(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.seedDefaultPaymentTerms(schoolSlug);
  }

  // ── Journal Entries ────────────────────────────────────────
  @Get('journal-entries') async getJournalEntries(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getJournalEntries(schoolSlug, query);
  }
  @Post('journal-entries') async postJournalEntry(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.postJournalEntry(schoolSlug, { ...dto, sourceType: dto.sourceType || 'manual', postedBy: userName });
  }

  // ── Ledger Reports ─────────────────────────────────────────
  @Get('reports/trial-balance') async getTrialBalance(@Request() req: any, @Query('asOf') asOf?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTrialBalance(schoolSlug, asOf);
  }
  @Get('reports/general-ledger') async getGeneralLedger(@Request() req: any, @Query('accountCode') accountCode: string, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getGeneralLedger(schoolSlug, accountCode, from, to);
  }
  @Get('reports/partner-ledger') async getPartnerLedger(@Request() req: any, @Query('partnerType') partnerType: string, @Query('partnerId') partnerId?: string, @Query('partnerName') partnerName?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPartnerLedger(schoolSlug, partnerType, partnerId, partnerName);
  }
  @Get('reports/cost-center') async getCostCenterReport(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCostCenterReport(schoolSlug, from, to);
  }

  // Fee Structures
  @Get('fee-structures') async getFeeStructures(@Request() req: any, @Query('grade') grade?: string, @Query('year') year?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getFeeStructures(schoolSlug, grade, year);
  }
  @Post('fee-structures') @HttpCode(HttpStatus.CREATED)
  async createFeeStructure(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.service.createFeeStructure({ ...dto, schoolSlug, academicYear: dto.academicYear || academicYear });
  }
  @Put('fee-structures/:id') async updateFeeStructure(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateFeeStructure(id, schoolSlug, dto);
  }

  // Invoices
  @Get('invoices') async getInvoices(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getInvoices(schoolSlug, query);
  }
  @Post('invoices') @HttpCode(HttpStatus.CREATED)
  async createInvoice(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createInvoice({ ...dto, schoolSlug, academicYear: dto.academicYear || academicYear, createdBy: userName });
  }
  @Post('invoices/:id/payment')
  async recordPayment(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.recordPayment(id, schoolSlug, { ...dto, collectedBy: dto.collectedBy || userName });
  }

  // Payments
  @Get('payments') async getPayments(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPayments(schoolSlug);
  }
  @Post('payments') @HttpCode(HttpStatus.CREATED)
  async collectFee(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    if (!dto.invoiceId) throw new BadRequestException('invoiceId is required');
    if (!dto.amount || Number(dto.amount) <= 0) throw new BadRequestException('amount must be greater than 0');
    return this.service.recordPayment(dto.invoiceId, schoolSlug, {
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      paymentDate: dto.paymentDate,
      transactionId: dto.referenceNumber,
      chequeNumber: dto.paymentMethod === 'cheque' ? dto.referenceNumber : undefined,
      notes: dto.remarks,
      collectedBy: dto.collectedBy || userName,
    });
  }

  // Expenses
  @Get('expenses') async getExpenses(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getExpenses(schoolSlug, query);
  }
  @Post('expenses') @HttpCode(HttpStatus.CREATED)
  async createExpense(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createExpense({ ...dto, schoolSlug, academicYear: dto.academicYear || academicYear, submittedBy: userName });
  }
  @Patch('expenses/:id/approve') async approveExpense(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.approveExpense(id, schoolSlug, userName);
  }
  @Patch('expenses/:id/pay') async payExpense(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.markExpensePaid(id, schoolSlug, { ...dto, paidBy: dto.paidBy || userName });
  }

  // Budgets
  @Get('budgets') async getBudgets(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBudgets(schoolSlug, ay);
  }
  @Post('budgets') @HttpCode(HttpStatus.CREATED)
  async createBudget(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createBudget({ ...dto, schoolSlug, academicYear: dto.academicYear || academicYear, createdBy: userName });
  }
  @Patch('budgets/:id/approve') async approveBudget(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.approveBudget(id, schoolSlug, userName);
  }

  // Bank Accounts
  @Get('bank-accounts') async getBankAccounts(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBankAccounts(schoolSlug);
  }
  @Post('bank-accounts') @HttpCode(HttpStatus.CREATED)
  async createBankAccount(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createBankAccount({ ...dto, schoolSlug });
  }
  @Patch('bank-accounts/:id/balance') async updateBalance(@Param('id') id: string, @Body('balance') balance: number, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateBankBalance(id, schoolSlug, balance);
  }

  // Reports
  @Get('reports/income-statement') async getIncomeStatement(@Request() req: any, @Query('academicYear') ay: string, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getIncomeStatement(schoolSlug, ay, from, to);
  }
  @Get('reports/fee-collection') async getFeeCollection(@Request() req: any, @Query('month') month: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getFeeCollection(schoolSlug, month);
  }

  private toCsv(rows: any[]): string {
    if (!rows || rows.length === 0) return 'No data\n';
    const flat = rows.map(r => {
      const out: any = {};
      for (const k of Object.keys(r)) {
        const v = (r as any)[k];
        out[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
      }
      return out;
    });
    const headers = Array.from(new Set(flat.flatMap(r => Object.keys(r))));
    const escape = (v: any) => {
      if (v === undefined || v === null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [headers.join(',')];
    for (const row of flat) lines.push(headers.map(h => escape(row[h])).join(','));
    return lines.join('\n');
  }

  @Get('reports/collection')
  async getCollectionReport(@Request() req: any, @Query() query: any, @Res() res: Response) {
    const { schoolSlug } = this.ctx(req);

    if (query.format === 'detail') {
      const detailData = await this.service.getCollectionDetailReport(schoolSlug, {
        from: query.from, to: query.to, month: query.month,
        grade: query.grade, academicYear: query.academicYear,
      });
      return res.json(detailData);
    }

    const data = await this.service.getCollectionReport(schoolSlug, {
      groupBy: query.groupBy || 'summary',
      from: query.from, to: query.to, month: query.month,
      grade: query.grade, academicYear: query.academicYear,
      ...(query.fromSlip ? { fromSlip: query.fromSlip, toSlip: query.toSlip } : {}),
    } as any);

    if (query.format === 'csv') {
      const rows = Array.isArray(data) ? data : [data];
      const csv = this.toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="collection-${query.groupBy || 'summary'}.csv"`);
      return res.send(csv);
    }
    return res.json(data);
  }

  @Get('reports/outstanding')
  async getOutstandingReport(@Request() req: any, @Query() query: any, @Res() res: Response) {
    const { schoolSlug } = this.ctx(req);

    if (query.format === 'detail') {
      const detailData = await this.service.getOutstandingDetailReport(schoolSlug, {
        grade: query.grade, academicYear: query.academicYear,
      });
      return res.json(detailData);
    }

    const data = await this.service.getOutstandingReport(schoolSlug, {
      groupBy: query.groupBy || 'summary',
      grade: query.grade, academicYear: query.academicYear,
    });

    if (query.format === 'csv') {
      const rows = Array.isArray(data) ? data : [data];
      const csv = this.toCsv(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="outstanding-${query.groupBy || 'summary'}.csv"`);
      return res.send(csv);
    }
    return res.json(data);
  }

  @Delete('invoices/:id')
  async deleteInvoice(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.softDeleteInvoice(id, schoolSlug, userName, reason);
  }

  @Post('invoices/bulk-delete') @HttpCode(HttpStatus.OK)
  async bulkDeleteInvoices(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.bulkDeleteInvoices(
      schoolSlug,
      {
        month: dto.month,
        academicYear: dto.academicYear || academicYear,
        scopeType: dto.scopeType,
        scopeValue: dto.scopeValue,
      },
      userName,
      dto.reason,
    );
  }

  @Post('invoices/retag-year') @HttpCode(HttpStatus.OK)
  async retagInvoiceYear(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.service.retagInvoiceYear(schoolSlug, {
      month: dto.month,
      toAcademicYear: dto.toAcademicYear || academicYear,
      scopeType: dto.scopeType,
      scopeValue: dto.scopeValue,
    });
  }

  // ── Discount / Scholarship Programs ─────────────────────────
  @Get('discount-programs') async getDiscountPrograms(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDiscountPrograms(schoolSlug);
  }

  @Post('discount-programs') @HttpCode(HttpStatus.CREATED)
  async createDiscountProgram(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createDiscountProgram({ ...dto, schoolSlug });
  }

  @Put('discount-programs/:id') async updateDiscountProgram(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateDiscountProgram(id, schoolSlug, dto);
  }

  @Delete('discount-programs/:id') async deleteDiscountProgram(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteDiscountProgram(id, schoolSlug);
  }

  // ── Fee Assignments (assign discounts/scholarships to targets) ──
  @Get('fee-assignments') async getFeeAssignments(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getFeeAssignments(schoolSlug);
  }

  @Post('fee-assignments') @HttpCode(HttpStatus.CREATED)
  async createFeeAssignment(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createFeeAssignment({ ...dto, schoolSlug });
  }

  @Delete('fee-assignments/:id') async deleteFeeAssignment(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteFeeAssignment(id, schoolSlug);
  }

  // ── Challan / Invoice Generation ─────────────────────────────
  @Post('invoices/generate') @HttpCode(HttpStatus.CREATED)
  async generateInvoices(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.generateInvoices(schoolSlug, {
      month: dto.month,
      academicYear: dto.academicYear || academicYear,
      scopeType: dto.scopeType,
      scopeValue: dto.scopeValue,
      createdBy: userName,
    });
  }

  // ============================================================
  // PHASE 2 — VENDOR MASTER / ACCOUNTS PAYABLE
  // ============================================================

  // ── Vendors ───────────────────────────────────────────────
  @Get('vendors') async getVendors(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendors(schoolSlug);
  }
  @Post('vendors') @HttpCode(HttpStatus.CREATED)
  async createVendor(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createVendor({ ...dto, schoolSlug });
  }
  @Patch('vendors/:id') async updateVendor(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateVendor(id, schoolSlug, dto);
  }

  // ── Vendor Bills ──────────────────────────────────────────
  @Get('vendor-bills') async getVendorBills(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendorBills(schoolSlug, query);
  }
  @Post('vendor-bills') @HttpCode(HttpStatus.CREATED)
  async createVendorBill(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createVendorBill({ ...dto, schoolSlug });
  }
  @Post('vendor-bills/:id/payments') @HttpCode(HttpStatus.CREATED)
  async recordVendorPayment(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.recordVendorPayment(id, schoolSlug, dto);
  }

  // ── Vendor Payments ───────────────────────────────────────
  @Get('vendor-payments') async getVendorPayments(@Request() req: any, @Query('vendorId') vendorId?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendorPayments(schoolSlug, vendorId);
  }

  // ── AR / AP / Credit / Payment-period reports ────────────
  @Get('reports/ar-aging') async getArAging(@Request() req: any, @Query('asOf') asOf?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getArAging(schoolSlug, asOf);
  }
  @Get('reports/ap-aging') async getApAging(@Request() req: any, @Query('asOf') asOf?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getApAging(schoolSlug, asOf);
  }
  @Get('reports/customer-credit-balance') async getCustomerCreditBalance(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCustomerCreditBalance(schoolSlug);
  }
  @Get('reports/payment-period') async getPaymentPeriodReport(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPaymentPeriodReport(schoolSlug, from, to);
  }
}
