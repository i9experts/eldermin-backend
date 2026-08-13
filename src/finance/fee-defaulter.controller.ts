import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FeeDefaulterService } from './fee-defaulter.service';

@Controller('finance/defaulters')
export class FeeDefaulterController {
  constructor(private readonly service: FeeDefaulterService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
      requestingUser: req?.user,
    };
  }

  // ── Policy ───────────────────────────────────────────────────
  @Get('policy')
  async getPolicy(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPolicy(schoolSlug);
  }

  @Put('policy')
  async updatePolicy(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updatePolicy(schoolSlug, dto);
  }

  // ── Aging & list ─────────────────────────────────────────────
  @Get('aging')
  async getAging(@Request() req: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getAgingReport(schoolSlug, requestingUser);
  }

  @Get()
  async getDefaulters(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getDefaulters(schoolSlug, query, requestingUser);
  }

  // ── Reminders ────────────────────────────────────────────────
  @Post(':invoiceId/remind')
  async sendReminder(@Param('invoiceId') invoiceId: string, @Body() dto: { channel: 'email' | 'sms' | 'whatsapp' }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.sendReminder(invoiceId, schoolSlug, dto.channel || 'email', userName);
  }

  @Post('bulk-remind')
  @HttpCode(HttpStatus.OK)
  async sendBulkReminders(@Body() dto: { invoiceIds: string[]; channel: 'email' | 'sms' | 'whatsapp' }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.sendBulkReminders(schoolSlug, dto.invoiceIds || [], dto.channel || 'email', userName);
  }

  @Post('run-automated-now')
  @HttpCode(HttpStatus.OK)
  async runAutomatedNow() {
    // Manual trigger for the same job @Cron runs daily - useful for
    // testing the whole pipeline without waiting for 8am, and for a
    // school that wants to force a run right after changing policy.
    return this.service.runAutomatedReminders();
  }

  // ── Penalties ────────────────────────────────────────────────
  @Post(':invoiceId/penalty')
  async applyPenalty(@Param('invoiceId') invoiceId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.applyPenalty(invoiceId, schoolSlug);
  }

  @Post('bulk-penalty')
  @HttpCode(HttpStatus.OK)
  async applyBulkPenalty(@Body() dto: { invoiceIds: string[] }, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.applyBulkPenalty(dto.invoiceIds || [], schoolSlug);
  }

  // ── Payment Commitments ──────────────────────────────────────
  @Get('commitments')
  async getCommitments(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getCommitments(schoolSlug, query, requestingUser);
  }

  @Post('commitments')
  @HttpCode(HttpStatus.CREATED)
  async createCommitment(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createCommitment(schoolSlug, dto, userName);
  }

  @Patch('commitments/:id/installments/:installmentNumber/pay')
  async payInstallment(
    @Param('id') id: string,
    @Param('installmentNumber') installmentNumber: string,
    @Body() dto: { paidAmount: number },
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.recordInstallmentPayment(id, Number(installmentNumber), schoolSlug, dto.paidAmount);
  }

  @Patch('commitments/:id/installments/:installmentNumber/miss')
  async missInstallment(
    @Param('id') id: string,
    @Param('installmentNumber') installmentNumber: string,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.markInstallmentMissed(id, Number(installmentNumber), schoolSlug);
  }

  @Patch('commitments/:id/break')
  async breakCommitment(@Param('id') id: string, @Body() dto: { reason: string }, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.breakCommitment(id, schoolSlug, dto.reason);
  }
}
