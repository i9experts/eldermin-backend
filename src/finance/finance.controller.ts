import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, Res, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FinanceService } from './finance.service';
import { RequireModuleAccess } from '../roles/decorators/require-module-access.decorator';

// Real, enforced pilot of the custom-role sub-module permission system (see
// CustomRoleGuard) — Finance is the ONLY module with live server-side
// enforcement in this pass. Every route below is mapped to the Finance
// sub-module it actually belongs to on the frontend (src/pages/finance/
// index.tsx's FinTab) and to 'view' (GET) or 'manage' (POST/PUT/PATCH/
// DELETE). This guard only ever adds a check for users who have a
// Role.customRoleId assigned — everyone else (the standard UserRole system)
// is completely unaffected; RolesGuard/PERMISSIONS_MATRIX still runs too.
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
  @RequireModuleAccess('finance', 'dashboard', 'view')
  @Get('dashboard') async getDashboard(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug, ay);
  }

  // COA
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('coa') async getCOA(@Request() req: any, @Query('type') type?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCOA(schoolSlug, type);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('coa') @HttpCode(HttpStatus.CREATED)
  async createCOA(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCOA({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('coa/seed') async seedCOA(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.seedDefaultCOA(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('coa/bulk-import') async bulkImportCOA(@Body() dto: { rows: any[] }, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.bulkImportCOA(schoolSlug, dto?.rows || []);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('coa/:id') async updateCOA(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCOA(id, schoolSlug, dto);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Delete('coa/:id') async deleteCOA(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteCOA(id, schoolSlug);
  }

  // ── Fiscal Years ──────────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('fiscal-years') async getFiscalYears(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getFiscalYears(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('fiscal-years') async createFiscalYear(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createFiscalYear({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('fiscal-years/:id/close') async closeFiscalYear(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.closeFiscalYear(id, schoolSlug, userName);
  }

  // ── Opening Balances (Phase 8) ─────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('opening-balances') async getOpeningBalances(@Request() req: any, @Query('fiscalYearId') fiscalYearId?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getOpeningBalances(schoolSlug, fiscalYearId);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('opening-balances') async setOpeningBalance(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.setOpeningBalance(schoolSlug, dto.accountCode, dto.fiscalYearId, Number(dto.amount), userName);
  }

  // ── Accounting Periods ────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('accounting-periods') async getAccountingPeriods(@Request() req: any, @Query('fiscalYearId') fiscalYearId?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAccountingPeriods(schoolSlug, fiscalYearId);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('accounting-periods/:id/status') async setPeriodStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.setPeriodStatus(id, schoolSlug, status);
  }

  // ── Cost Centers ───────────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('cost-centers') async getCostCenters(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCostCenters(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('cost-centers') async createCostCenter(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCostCenter({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('cost-centers/:id') async updateCostCenter(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCostCenter(id, schoolSlug, dto);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('cost-centers/seed') async seedCostCenters(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.seedCostCentersFromCampuses(schoolSlug);
  }

  // ── Payment Terms ──────────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('payment-terms') async getPaymentTerms(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPaymentTerms(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('payment-terms') async createPaymentTerm(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createPaymentTerm({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('payment-terms/seed') async seedPaymentTerms(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.seedDefaultPaymentTerms(schoolSlug);
  }

  // ── Journal Entries ────────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('journal-entries') async getJournalEntries(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getJournalEntries(schoolSlug, query);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('journal-entries') async postJournalEntry(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.postJournalEntry(schoolSlug, { ...dto, sourceType: dto.sourceType || 'manual', postedBy: userName });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('journal-entries/:id/save-as-template') async saveAsTemplate(@Param('id') id: string, @Body('templateName') templateName: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.saveAsTemplate(schoolSlug, id, templateName);
  }

  // ── Journal Entry Templates (Phase 8) ──────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('journal-templates') async getTemplates(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTemplates(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('journal-templates/:id/instantiate') async createFromTemplate(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createFromTemplate(schoolSlug, id, dto.date, { narration: dto.narration, reference: dto.reference, lines: dto.lines }, userName);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Delete('journal-templates/:id') async deleteTemplate(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteTemplate(schoolSlug, id);
  }

  // ── Ledger Reports ─────────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('reports/trial-balance') async getTrialBalance(@Request() req: any, @Query('asOf') asOf?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTrialBalance(schoolSlug, asOf);
  }
  // Item 42 — Balance Sheet, "as of" a date rather than a range (it's a
  // point-in-time position statement, not a period-activity report).
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('reports/balance-sheet') async getBalanceSheet(@Request() req: any, @Query('asOf') asOf?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBalanceSheet(schoolSlug, asOf);
  }
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('reports/general-ledger') async getGeneralLedger(@Request() req: any, @Query('accountCode') accountCode: string, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getGeneralLedger(schoolSlug, accountCode, from, to);
  }
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('reports/partner-ledger') async getPartnerLedger(@Request() req: any, @Query('partnerType') partnerType: string, @Query('partnerId') partnerId?: string, @Query('partnerName') partnerName?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPartnerLedger(schoolSlug, partnerType, partnerId, partnerName);
  }
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('reports/cost-center') async getCostCenterReport(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCostCenterReport(schoolSlug, from, to);
  }

  // ── Accounting Dimensions (Phase 8) ────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('dimensions') async getDimensions(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDimensions(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('dimensions') async createDimension(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createDimension({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('dimensions/:id/values') async getDimensionValues(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDimensionValues(schoolSlug, id);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('dimensions/:id/values') async createDimensionValue(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createDimensionValue({ ...dto, dimensionId: id, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('reports/dimension') async getDimensionReport(@Request() req: any, @Query('dimensionId') dimensionId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDimensionReport(schoolSlug, dimensionId, from, to);
  }

  // Fee Structures
  @RequireModuleAccess('finance', 'fee', 'view')
  @Get('fee-structures') async getFeeStructures(@Request() req: any, @Query('grade') grade?: string, @Query('year') year?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getFeeStructures(schoolSlug, grade, year);
  }
  @RequireModuleAccess('finance', 'fee', 'manage')
  @Post('fee-structures') @HttpCode(HttpStatus.CREATED)
  async createFeeStructure(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.service.createFeeStructure({ ...dto, schoolSlug, academicYear: dto.academicYear || academicYear });
  }
  @RequireModuleAccess('finance', 'fee', 'manage')
  @Put('fee-structures/:id') async updateFeeStructure(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateFeeStructure(id, schoolSlug, dto);
  }

  // Invoices
  @RequireModuleAccess('finance', 'fee', 'view')
  @Get('invoices') async getInvoices(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getInvoices(schoolSlug, query);
  }
  @RequireModuleAccess('finance', 'fee', 'manage')
  @Post('invoices') @HttpCode(HttpStatus.CREATED)
  async createInvoice(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createInvoice({ ...dto, schoolSlug, academicYear: dto.academicYear || academicYear, createdBy: userName });
  }
  @RequireModuleAccess('finance', 'fee', 'manage')
  @Post('invoices/:id/payment')
  async recordPayment(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.recordPayment(id, schoolSlug, { ...dto, collectedBy: dto.collectedBy || userName });
  }
  @RequireModuleAccess('finance', 'receivable', 'manage')
  @Patch('invoices/:id')
  async updateInvoice(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.updateInvoice(id, schoolSlug, { ...dto, updatedBy: dto.updatedBy || userName });
  }

  // Payments
  @RequireModuleAccess('finance', 'fee', 'view')
  @Get('payments') async getPayments(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPayments(schoolSlug);
  }
  @RequireModuleAccess('finance', 'fee', 'manage')
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

  // Reverts ("undoes") an already-collected receipt — the explicit,
  // auditable alternative to ever deleting a receipted payment. Un-applies
  // it from the invoice and reverses whatever it posted to the ledger.
  @RequireModuleAccess('finance', 'receivable', 'manage')
  @Post('payments/:id/reverse') @HttpCode(HttpStatus.OK)
  async reversePayment(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.reversePayment(id, schoolSlug, userName, reason);
  }

  // Expenses
  @RequireModuleAccess('finance', 'payable', 'view')
  @Get('expenses') async getExpenses(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getExpenses(schoolSlug, query, req?.user);
  }
  @RequireModuleAccess('finance', 'payable', 'manage')
  @Post('expenses') @HttpCode(HttpStatus.CREATED)
  async createExpense(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createExpense({ ...dto, schoolSlug, academicYear: dto.academicYear || academicYear, submittedBy: userName });
  }
  @RequireModuleAccess('finance', 'payable', 'manage')
  @Patch('expenses/:id/approve') async approveExpense(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.approveExpense(id, schoolSlug, userName);
  }
  @RequireModuleAccess('finance', 'payable', 'manage')
  @Patch('expenses/:id/pay') async payExpense(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.markExpensePaid(id, schoolSlug, { ...dto, paidBy: dto.paidBy || userName });
  }

  // Budgets
  @RequireModuleAccess('finance', 'budgeting', 'view')
  @Get('budgets') async getBudgets(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBudgets(schoolSlug, ay, req?.user);
  }
  @RequireModuleAccess('finance', 'budgeting', 'manage')
  @Post('budgets') @HttpCode(HttpStatus.CREATED)
  async createBudget(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createBudget({ ...dto, schoolSlug, academicYear: dto.academicYear || academicYear, createdBy: userName });
  }
  @RequireModuleAccess('finance', 'budgeting', 'manage')
  @Patch('budgets/:id/approve') async approveBudget(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.approveBudget(id, schoolSlug, userName);
  }
  @RequireModuleAccess('finance', 'budgeting', 'view')
  @Get('budgets/summary') async getBudgetSummary(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBudgetSummaryAcrossAll(schoolSlug, ay);
  }
  @RequireModuleAccess('finance', 'budgeting', 'view')
  @Get('budgets/:id/vs-actual') async getBudgetVsActual(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBudgetVsActual(schoolSlug, id);
  }

  // Bank Accounts
  @RequireModuleAccess('finance', 'banking', 'view')
  @Get('bank-accounts') async getBankAccounts(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBankAccounts(schoolSlug);
  }
  @RequireModuleAccess('finance', 'banking', 'manage')
  @Post('bank-accounts') @HttpCode(HttpStatus.CREATED)
  async createBankAccount(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createBankAccount({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'banking', 'manage')
  @Patch('bank-accounts/:id/balance') async updateBalance(@Param('id') id: string, @Body('balance') balance: number, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateBankBalance(id, schoolSlug, balance);
  }

  // ============================================================
  // PHASE 6 — BANK RECONCILIATION
  // ============================================================
  @RequireModuleAccess('finance', 'reconciliation', 'manage')
  @Post('bank-accounts/:id/statement-lines/import') @HttpCode(HttpStatus.CREATED)
  async importBankStatementLines(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.importBankStatementLines(schoolSlug, id, dto.lines || []);
  }
  @RequireModuleAccess('finance', 'reconciliation', 'view')
  @Get('bank-accounts/:id/statement-lines') async getBankStatementLines(@Param('id') id: string, @Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBankStatementLines(schoolSlug, id, query);
  }
  @RequireModuleAccess('finance', 'reconciliation', 'view')
  @Get('bank-accounts/:id/unmatched-ledger-lines') async getUnmatchedLedgerLines(@Param('id') id: string, @Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getUnmatchedLedgerLines(schoolSlug, id, from, to);
  }
  @RequireModuleAccess('finance', 'reconciliation', 'view')
  @Get('bank-accounts/:id/reconciliation-summary') async getReconciliationSummary(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getReconciliationSummary(schoolSlug, id);
  }
  @RequireModuleAccess('finance', 'reconciliation', 'manage')
  @Post('statement-lines/:id/match') async matchStatementLine(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.matchStatementLine(schoolSlug, id, dto.matches || []);
  }
  @RequireModuleAccess('finance', 'reconciliation', 'manage')
  @Post('statement-lines/:id/unmatch') async unmatchStatementLine(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.unmatchStatementLine(schoolSlug, id);
  }
  @RequireModuleAccess('finance', 'reconciliation', 'manage')
  @Post('statement-lines/:id/ignore') async ignoreStatementLine(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.ignoreStatementLine(schoolSlug, id);
  }

  // ── Reconciliation Sessions ────────────────────────────────
  @RequireModuleAccess('finance', 'reconciliation', 'view')
  @Get('bank-accounts/:id/reconciliations') async getReconciliations(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getReconciliations(schoolSlug, id);
  }
  @RequireModuleAccess('finance', 'reconciliation', 'manage')
  @Post('bank-accounts/:id/reconciliations') @HttpCode(HttpStatus.CREATED)
  async startReconciliation(@Param('id') id: string, @Body('periodEnd') periodEnd: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.startReconciliation(schoolSlug, id, periodEnd);
  }
  @RequireModuleAccess('finance', 'reconciliation', 'manage')
  @Patch('reconciliations/:id/complete') async completeReconciliation(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.completeReconciliation(schoolSlug, id, userName);
  }

  // Reports
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/income-statement') async getIncomeStatement(@Request() req: any, @Query('academicYear') ay: string, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getIncomeStatement(schoolSlug, ay, from, to);
  }
  @RequireModuleAccess('finance', 'reports', 'view')
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

  @RequireModuleAccess('finance', 'reports', 'view')
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

  @RequireModuleAccess('finance', 'reports', 'view')
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

  @RequireModuleAccess('finance', 'receivable', 'manage')
  @Delete('invoices/:id')
  async deleteInvoice(@Param('id') id: string, @Body('reason') reason: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.softDeleteInvoice(id, schoolSlug, userName, reason);
  }

  @RequireModuleAccess('finance', 'fee', 'manage')
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

  @RequireModuleAccess('finance', 'fee', 'manage')
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
  @RequireModuleAccess('finance', 'assignments', 'view')
  @Get('discount-programs') async getDiscountPrograms(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDiscountPrograms(schoolSlug);
  }

  @RequireModuleAccess('finance', 'assignments', 'manage')
  @Post('discount-programs') @HttpCode(HttpStatus.CREATED)
  async createDiscountProgram(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createDiscountProgram({ ...dto, schoolSlug });
  }

  @RequireModuleAccess('finance', 'assignments', 'manage')
  @Put('discount-programs/:id') async updateDiscountProgram(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateDiscountProgram(id, schoolSlug, dto);
  }

  @RequireModuleAccess('finance', 'assignments', 'manage')
  @Delete('discount-programs/:id') async deleteDiscountProgram(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteDiscountProgram(id, schoolSlug);
  }

  // ── Fee Assignments (assign discounts/scholarships to targets) ──
  @RequireModuleAccess('finance', 'assignments', 'view')
  @Get('fee-assignments') async getFeeAssignments(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getFeeAssignments(schoolSlug);
  }

  @RequireModuleAccess('finance', 'assignments', 'manage')
  @Post('fee-assignments') @HttpCode(HttpStatus.CREATED)
  async createFeeAssignment(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createFeeAssignment({ ...dto, schoolSlug });
  }

  @RequireModuleAccess('finance', 'assignments', 'manage')
  @Delete('fee-assignments/:id') async deleteFeeAssignment(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteFeeAssignment(id, schoolSlug);
  }

  // ── Student Fee Assignments (assign a FEE STRUCTURE to a student - the
  // real "Assign Fee" workflow, distinct from the discount assignments
  // above - see FEE-01/FEE-02) ──
  @RequireModuleAccess('finance', 'assignments', 'view')
  @Get('student-fee-assignments') async getStudentFeeAssignments(@Request() req: any, @Query('studentId') studentId?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getStudentFeeAssignments(schoolSlug, studentId);
  }

  @RequireModuleAccess('finance', 'assignments', 'manage')
  @Post('student-fee-assignments') @HttpCode(HttpStatus.CREATED)
  async assignFeeStructure(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.assignFeeStructure(schoolSlug, { ...dto, academicYear: dto.academicYear || academicYear, assignedBy: dto.assignedBy || userName });
  }

  @RequireModuleAccess('finance', 'assignments', 'manage')
  @Post('student-fee-assignments/bulk') @HttpCode(HttpStatus.CREATED)
  async bulkAssignFeeStructure(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.bulkAssignFeeStructure(schoolSlug, { ...dto, academicYear: dto.academicYear || academicYear, assignedBy: dto.assignedBy || userName });
  }

  @RequireModuleAccess('finance', 'assignments', 'manage')
  @Delete('student-fee-assignments/:id') async deleteStudentFeeAssignment(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteStudentFeeAssignment(id, schoolSlug);
  }

  // ── Challan / Invoice Generation ─────────────────────────────
  @RequireModuleAccess('finance', 'fee', 'manage')
  @Post('invoices/generate') @HttpCode(HttpStatus.CREATED)
  async generateInvoices(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.generateInvoices(schoolSlug, {
      month: dto.month,
      academicYear: dto.academicYear || academicYear,
      scopeType: dto.scopeType,
      scopeValue: dto.scopeValue,
      createdBy: userName,
      dryRun: !!dto.dryRun,
    });
  }

  // ============================================================
  // PHASE 2 — VENDOR MASTER / ACCOUNTS PAYABLE
  // ============================================================

  // ── Vendors ───────────────────────────────────────────────
  @RequireModuleAccess('finance', 'payable', 'view')
  @Get('vendors') async getVendors(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendors(schoolSlug);
  }
  @RequireModuleAccess('finance', 'payable', 'manage')
  @Post('vendors') @HttpCode(HttpStatus.CREATED)
  async createVendor(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createVendor({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'payable', 'manage')
  @Patch('vendors/:id') async updateVendor(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateVendor(id, schoolSlug, dto);
  }

  // ── Vendor Bills ──────────────────────────────────────────
  @RequireModuleAccess('finance', 'payable', 'view')
  @Get('vendor-bills') async getVendorBills(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendorBills(schoolSlug, query);
  }
  @RequireModuleAccess('finance', 'payable', 'manage')
  @Post('vendor-bills') @HttpCode(HttpStatus.CREATED)
  async createVendorBill(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createVendorBill({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'payable', 'manage')
  @Post('vendor-bills/:id/payments') @HttpCode(HttpStatus.CREATED)
  async recordVendorPayment(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.recordVendorPayment(id, schoolSlug, dto);
  }

  // ── Vendor Payments ───────────────────────────────────────
  @RequireModuleAccess('finance', 'payable', 'view')
  @Get('vendor-payments') async getVendorPayments(@Request() req: any, @Query('vendorId') vendorId?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendorPayments(schoolSlug, vendorId);
  }

  // ── AR / AP / Credit / Payment-period reports ────────────
  @RequireModuleAccess('finance', 'receivable', 'view')
  @Get('reports/ar-aging') async getArAging(@Request() req: any, @Query('asOf') asOf?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getArAging(schoolSlug, asOf);
  }
  @RequireModuleAccess('finance', 'payable', 'view')
  @Get('reports/ap-aging') async getApAging(@Request() req: any, @Query('asOf') asOf?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getApAging(schoolSlug, asOf);
  }
  @RequireModuleAccess('finance', 'receivable', 'view')
  @Get('reports/customer-credit-balance') async getCustomerCreditBalance(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCustomerCreditBalance(schoolSlug);
  }
  @RequireModuleAccess('finance', 'receivable', 'view')
  @Get('reports/payment-period') async getPaymentPeriodReport(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPaymentPeriodReport(schoolSlug, from, to);
  }

  // ============================================================
  // PHASE 3 — TAX ENGINE
  // ============================================================

  // ── Tax Templates ─────────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('tax-templates') async getTaxTemplates(@Request() req: any, @Query('type') type?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTaxTemplates(schoolSlug, type);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('tax-templates') @HttpCode(HttpStatus.CREATED)
  async createTaxTemplate(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createTaxTemplate({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('tax-templates/:id') async updateTaxTemplate(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateTaxTemplate(id, schoolSlug, dto);
  }

  // ── Item Tax Templates ────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('item-tax-templates') async getItemTaxTemplates(@Request() req: any, @Query('direction') direction?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getItemTaxTemplates(schoolSlug, direction);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('item-tax-templates') @HttpCode(HttpStatus.CREATED)
  async createItemTaxTemplate(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createItemTaxTemplate({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('item-tax-templates/:id') async updateItemTaxTemplate(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateItemTaxTemplate(id, schoolSlug, dto);
  }

  // ── Tax Rules ──────────────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('tax-rules') async getTaxRules(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTaxRules(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('tax-rules') @HttpCode(HttpStatus.CREATED)
  async createTaxRule(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createTaxRule({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('tax-rules/:id') async updateTaxRule(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateTaxRule(id, schoolSlug, dto);
  }

  // ── Withholding Tax Categories ─────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('withholding-categories') async getWithholdingCategories(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getWithholdingCategories(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('withholding-categories') @HttpCode(HttpStatus.CREATED)
  async createWithholdingCategory(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createWithholdingCategory({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('withholding-categories/:id') async updateWithholdingCategory(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateWithholdingCategory(id, schoolSlug, dto);
  }

  // ── Tax Summary Report ────────────────────────────────────
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/tax-summary') async getTaxSummaryReport(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTaxSummaryReport(schoolSlug, from, to);
  }

  // ============================================================
  // PHASE 5 — MULTI-CURRENCY
  // ============================================================

  // ── Currencies ─────────────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('currencies') async getCurrencies(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCurrencies(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('currencies') @HttpCode(HttpStatus.CREATED)
  async createCurrency(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCurrency({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('currencies/seed') async seedCurrencies(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.seedCommonCurrencies(schoolSlug);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('currencies/:id/set-base') async setBaseCurrency(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.setBaseCurrency(id, schoolSlug);
  }

  // ── Exchange Rates ─────────────────────────────────────────
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('exchange-rates') async getExchangeRates(@Request() req: any, @Query('fromCurrency') fromCurrency?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getExchangeRates(schoolSlug, fromCurrency);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('exchange-rates') @HttpCode(HttpStatus.CREATED)
  async createExchangeRate(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createExchangeRate({ ...dto, schoolSlug });
  }

  // ── FX Exposure Report ─────────────────────────────────────
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/fx-exposure') async getFxExposure(@Request() req: any, @Query('asOf') asOf?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getUnrealizedFxExposure(schoolSlug, asOf);
  }

  // ============================================================
  // PHASE 7 — REPORT SUITE
  // ============================================================

  // ── Sales Commission — rules & assignments (setup) ─────────
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('commission-rules') async getSalesCommissionRules(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getSalesCommissionRules(schoolSlug);
  }
  @RequireModuleAccess('finance', 'reports', 'manage')
  @Post('commission-rules') @HttpCode(HttpStatus.CREATED)
  async createSalesCommissionRule(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createSalesCommissionRule({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'reports', 'manage')
  @Patch('commission-rules/:id') async updateSalesCommissionRule(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateSalesCommissionRule(id, schoolSlug, dto);
  }
  @RequireModuleAccess('finance', 'reports', 'manage')
  @Delete('commission-rules/:id') async deleteSalesCommissionRule(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteSalesCommissionRule(id, schoolSlug);
  }

  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('commission-assignments') async getCommissionAssignments(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCommissionAssignments(schoolSlug);
  }
  @RequireModuleAccess('finance', 'reports', 'manage')
  @Post('commission-assignments') @HttpCode(HttpStatus.CREATED)
  async createCommissionAssignment(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCommissionAssignment({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'reports', 'manage')
  @Delete('commission-assignments/:id') async deleteCommissionAssignment(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteCommissionAssignment(id, schoolSlug);
  }

  // ── Phase 7 Reports ─────────────────────────────────────────
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/sales-commission') async getSalesCommissionReport(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getSalesCommissionReport(schoolSlug, from, to);
  }
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/payment-summary') async getPaymentSummaryReport(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string, @Query('groupBy') groupBy?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPaymentSummaryReport(schoolSlug, from, to, groupBy);
  }
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/vendor-contacts') async getVendorContactsReport(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendorContactsReport(schoolSlug);
  }
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/tax-detail') async getTaxDetailReport(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTaxDetailReport(schoolSlug, from, to);
  }
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/gross-profit') async getGrossProfit(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getGrossProfit(schoolSlug, from, to);
  }
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/profitability-by-cost-center') async getProfitabilityByCostCenter(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getProfitabilityByCostCenter(schoolSlug, from, to);
  }
  @RequireModuleAccess('finance', 'reports', 'view')
  @Get('reports/trends') async getMonthlyTrends(@Request() req: any, @Query('months') months?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getMonthlyTrends(schoolSlug, months ? Number(months) : 12);
  }

  // ============================================================
  // PHASE 8 — Terms & Conditions Templates
  // ============================================================
  @RequireModuleAccess('finance', 'ledger', 'view')
  @Get('terms-templates') async getTermsTemplates(@Request() req: any, @Query('appliesTo') appliesTo?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTermsTemplates(schoolSlug, appliesTo);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Post('terms-templates') @HttpCode(HttpStatus.CREATED)
  async createTermsTemplate(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createTermsTemplate({ ...dto, schoolSlug });
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Patch('terms-templates/:id') async updateTermsTemplate(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateTermsTemplate(id, schoolSlug, dto);
  }
  @RequireModuleAccess('finance', 'ledger', 'manage')
  @Delete('terms-templates/:id') async deleteTermsTemplate(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteTermsTemplate(id, schoolSlug);
  }

  // ============================================================
  // PHASE 8 — Payment Gateway (integration-ready scaffolding only — no
  // live gateway is wired up, see FinanceService for details)
  // ============================================================
  @RequireModuleAccess('finance', 'banking', 'view')
  @Get('payment-gateway/config') async getPaymentGatewayConfig(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPaymentGatewayConfig(schoolSlug);
  }
  @RequireModuleAccess('finance', 'banking', 'manage')
  @Post('payment-gateway/config') async upsertPaymentGatewayConfig(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.upsertPaymentGatewayConfig(schoolSlug, dto);
  }
  @RequireModuleAccess('finance', 'fee', 'manage')
  @Post('payment-gateway/intent') async createOnlinePaymentIntent(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createOnlinePaymentIntent(schoolSlug, dto.invoiceId, Number(dto.amount));
  }
  @Post('payment-gateway/webhook') @HttpCode(HttpStatus.OK)
  async paymentGatewayWebhook(@Body() payload: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.handlePaymentGatewayWebhook(schoolSlug, payload);
  }

  // ============================================================
  // Payment / Receipt Vouchers — client-requested quick-entry feature
  // (ERPNext "Payment Entry" equivalent). See FinanceService for the
  // full write-up of the unified receive/pay/transfer model.
  // ============================================================
  @RequireModuleAccess('finance', 'vouchers', 'view')
  @Get('vouchers/party-balance') async getVoucherPartyBalance(
    @Request() req: any,
    @Query('partyType') partyType: string,
    @Query('partyId') partyId?: string,
    @Query('partyName') partyName?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVoucherPartyBalance(schoolSlug, partyType, partyId, partyName);
  }
  @RequireModuleAccess('finance', 'vouchers', 'view')
  @Get('vouchers') async getVouchers(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVouchers(schoolSlug, query);
  }
  @RequireModuleAccess('finance', 'vouchers', 'view')
  @Get('vouchers/:id') async getVoucherById(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVoucherById(schoolSlug, id);
  }
  @RequireModuleAccess('finance', 'vouchers', 'manage')
  @Post('vouchers') @HttpCode(HttpStatus.CREATED)
  async createVoucher(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createVoucher(schoolSlug, dto, userName);
  }
  @RequireModuleAccess('finance', 'vouchers', 'manage')
  @Post('vouchers/:id/cancel') async cancelVoucher(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.cancelVoucher(schoolSlug, id, userName);
  }
}
