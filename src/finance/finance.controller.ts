import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
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
}
