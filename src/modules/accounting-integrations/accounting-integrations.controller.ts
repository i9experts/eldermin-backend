import { Controller, Get, Post, Patch, Body, Param, Query, Request, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../auth/decorators';
import { AccountingIntegrationsService } from './accounting-integrations.service';

@Controller('academics/accounting-integrations')
export class AccountingIntegrationsController {
  constructor(private readonly service: AccountingIntegrationsService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'],
      userEmail: req?.user?.email || 'admin',
    };
  }

  @Get('quickbooks/connection')
  async getConnection(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getConnection(schoolSlug);
  }

  @Post('quickbooks/connect-url')
  async getConnectUrl(@Request() req: any) {
    const { schoolSlug, userEmail } = this.ctx(req);
    return this.service.getConnectUrl(schoolSlug, userEmail);
  }

  // Public: this is Intuit's OAuth redirect landing in the admin's browser,
  // not an Eldermin-authenticated API call - see AccountingIntegrationsService
  // for how schoolSlug/CSRF protection work without a JWT here.
  @Public()
  @Get('quickbooks/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('realmId') realmId: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendBase = process.env.FRONTEND_URL || 'https://app.eldermin.com';
    const redirectTo = `${frontendBase.replace(/\/$/, '')}/finance?tab=accounting-integrations`;
    if (error) {
      return res.redirect(`${redirectTo}&qboError=${encodeURIComponent(error)}`);
    }
    try {
      await this.service.handleQuickBooksCallback(code, state, realmId);
      return res.redirect(`${redirectTo}&qboConnected=1`);
    } catch (e: any) {
      return res.redirect(`${redirectTo}&qboError=${encodeURIComponent(e?.message || 'Connection failed')}`);
    }
  }

  @Post('quickbooks/disconnect')
  async disconnect(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.disconnect(schoolSlug);
  }

  @Get('quickbooks/external-accounts')
  async listExternalAccounts(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.listExternalAccounts(schoolSlug);
  }

  @Get('quickbooks/internal-accounts')
  async listInternalAccounts(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.listInternalAccounts(schoolSlug);
  }

  @Patch('quickbooks/account-mappings')
  async saveAccountMappings(@Body() body: { mappings: any[] }, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    if (!Array.isArray(body?.mappings)) throw new BadRequestException('mappings must be an array');
    return this.service.saveAccountMappings(schoolSlug, body.mappings);
  }

  @Patch('quickbooks/auto-sync')
  async setAutoSync(@Body() body: { enabled: boolean }, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.setAutoSync(schoolSlug, !!body?.enabled);
  }

  @Get('quickbooks/sync-log')
  async getSyncLogs(@Request() req: any, @Query('limit') limit?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getSyncLogs(schoolSlug, limit ? Number(limit) : undefined);
  }

  @Post('quickbooks/sync-now')
  async syncNow(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.syncNow(schoolSlug);
  }

  @Post('quickbooks/sync-log/:id/retry')
  async retryOne(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.retryOne(schoolSlug, id);
  }
}
