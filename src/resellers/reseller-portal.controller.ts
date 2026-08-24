// ============================================================
// RESELLER PORTAL CONTROLLER — Eldermin Partner Network (Phase 2)
// The partner-facing side of the program: a reseller_admin/
// reseller_support account (see auth/roles.enum.ts, created via
// ResellersController.createPortalUser) logs in through the normal
// /auth/login and lands here, at /reseller-portal — never at
// /super-admin/resellers, which stays Super-Admin-only.
//
// Every method resolves the effective resellerId through
// resolveResellerScope: an explicit query/body resellerId is honored
// only if it matches the caller's own (403 otherwise), and is forced to
// their own resellerId when omitted — a reseller_admin can never see or
// act on another partner's data by passing a different id.
// ============================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Request,
} from '@nestjs/common';
import { ResellersService } from './resellers.service';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';
import { resolveResellerScope } from '../auth/scope.util';

@Roles(UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT)
@Controller('reseller-portal')
export class ResellerPortalController {
  constructor(private readonly service: ResellersService) {}

  private scopedId(req: any, requested?: string): string {
    return resolveResellerScope(req.user, requested) as string;
  }

  @Get('dashboard')
  async dashboard(@Request() req: any) {
    return this.service.getPortalDashboard(this.scopedId(req));
  }

  @Get('commission-ledger')
  async commissionLedger(@Query() query: any, @Request() req: any) {
    return this.service.getCommissionLedger(this.scopedId(req, query.resellerId), query);
  }

  @Get('commission-summary')
  async commissionSummary(@Request() req: any) {
    return this.service.getCommissionSummary(this.scopedId(req));
  }

  @Post('provisioning-requests')
  async submitProvisioningRequest(@Body() dto: any, @Request() req: any) {
    const resellerId = this.scopedId(req, dto?.resellerId);
    return this.service.submitProvisioningRequest(resellerId, dto, req.user.name || req.user.userId);
  }

  @Get('provisioning-requests')
  async provisioningRequests(@Query() query: any, @Request() req: any) {
    return this.service.getProvisioningQueue({ ...query, resellerId: this.scopedId(req, query.resellerId) });
  }

  @Post('deals')
  async registerDeal(@Body() dto: any, @Request() req: any) {
    const resellerId = this.scopedId(req, dto?.resellerId);
    return this.service.registerDeal(resellerId, dto);
  }

  @Get('deals')
  async deals(@Query() query: any, @Request() req: any) {
    return this.service.getDeals({ ...query, resellerId: this.scopedId(req, query.resellerId) });
  }
}
