import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FinanceService } from './finance.service';

@Controller('finance')
@UseGuards(AuthGuard('jwt'))
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('dashboard')
  getDashboard(@Request() req) {
    return this.financeService.getDashboardStats(req.user.tenantId);
  }

  @Get('fee-heads')
  getFeeHeads(@Request() req) {
    return this.financeService.getFeeHeads(req.user.tenantId);
  }

  @Post('fee-heads')
  createFeeHead(@Request() req, @Body() body: any) {
    return this.financeService.createFeeHead(req.user.tenantId, req.user.institutionId, body);
  }

  @Patch('fee-heads/:id')
  updateFeeHead(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.financeService.updateFeeHead(req.user.tenantId, id, body);
  }

  @Get('invoices')
  getInvoices(@Request() req, @Query() query: any) {
    return this.financeService.getInvoices(req.user.tenantId, query);
  }

  @Post('invoices')
  createInvoice(@Request() req, @Body() body: any) {
    return this.financeService.createInvoice(req.user.tenantId, req.user.institutionId, body);
  }

  @Get('invoices/:id')
  getInvoice(@Request() req, @Param('id') id: string) {
    return this.financeService.getInvoiceById(req.user.tenantId, id);
  }

  @Get('payments')
  getPayments(@Request() req) {
    return this.financeService.getPayments(req.user.tenantId);
  }

  @Post('payments')
  createPayment(@Request() req, @Body() body: any) {
    return this.financeService.createPayment(req.user.tenantId, req.user.institutionId, body);
  }

  @Get('expenses')
  getExpenses(@Request() req) {
    return this.financeService.getExpenses(req.user.tenantId);
  }

  @Post('expenses')
  createExpense(@Request() req, @Body() body: any) {
    return this.financeService.createExpense(req.user.tenantId, req.user.institutionId, req.user.campusId, body);
  }

  // ── Chart of Accounts (/accounts routes) ─────────────────────────────
  @Get('accounts')
  getChartOfAccounts(@Request() req) {
    return this.financeService.getChartOfAccounts(req.user.tenantId);
  }

  @Post('accounts/seed')
  seedCOA(@Request() req) {
    return this.financeService.seedStandardCOA(req.user.tenantId, req.user.institutionId);
  }

  @Post('accounts')
  createAccount(@Request() req, @Body() body: any) {
    return this.financeService.createAccount(req.user.tenantId, req.user.institutionId, body);
  }

  @Patch('accounts/:id')
  updateAccount(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.financeService.updateAccount(req.user.tenantId, id, body);
  }

  @Delete('accounts/:id')
  deleteAccount(@Request() req, @Param('id') id: string) {
    return this.financeService.deleteAccount(req.user.tenantId, id);
  }

  // ── Chart of Accounts (/coa alias routes) ────────────────────────────
  @Get('coa')
  getCOA(@Request() req) {
    return this.financeService.getChartOfAccounts(req.user.tenantId);
  }

  @Post('coa/apply-standard')
  applyStandardCOA(@Request() req, @Body() body: any) {
    return this.financeService.seedStandardCOA(req.user.tenantId, req.user.institutionId);
  }

  @Post('coa')
  createCOAAccount(@Request() req, @Body() body: any) {
    return this.financeService.createAccount(req.user.tenantId, req.user.institutionId, body);
  }

  @Patch('coa/:id')
  updateCOAAccount(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.financeService.updateAccount(req.user.tenantId, id, body);
  }

  @Delete('coa/:id')
  deleteCOAAccount(@Request() req, @Param('id') id: string) {
    return this.financeService.deleteAccount(req.user.tenantId, id);
  }
}
