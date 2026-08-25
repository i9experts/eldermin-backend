// ============================================================
// RESELLERS CONTROLLER — Eldermin Partner Network (Phase 1 + Phase 2)
// Super-Admin-only. Reserved at /super-admin/resellers so it reads as
// part of the same platform-management surface as institutions,
// tickets, and announcements.
//
// Route ordering matters here: every literal single-segment route
// (commission-batch/run, provisioning-requests, deals) is declared
// BEFORE the generic @Get(':id')/@Patch(':id') handlers below it —
// Nest/Express matches routes in declaration order, so a literal route
// declared after ':id' would never be reached (":id" would swallow it
// first, treating "deals" as an id).
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ResellersService } from './resellers.service';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';

@Roles(UserRole.SUPER_ADMIN)
@Controller('super-admin/resellers')
export class ResellersController {
  constructor(private readonly service: ResellersService) {}

  private adminUser(req: any) {
    return req?.user?.name || req?.headers['x-admin-user'] || 'Super Admin';
  }

  @Get()
  async list(@Query() query: any) {
    return this.service.getResellers(query);
  }

  // ── Commission & Billing Engine (Phase 2) ─────────────────
  @Post('commission-batch/run')
  @HttpCode(HttpStatus.OK)
  async runCommissionBatch(@Body() dto: { periodMonth?: string }, @Request() req: any) {
    return this.service.runCommissionBatch(dto?.periodMonth, this.adminUser(req));
  }

  // ── Self-serve provisioning queue (Phase 2) ───────────────
  @Get('provisioning-requests')
  async provisioningQueue(@Query() query: any) {
    return this.service.getProvisioningQueue(query);
  }

  @Patch('provisioning-requests/:id/review')
  async reviewProvisioningRequest(
    @Param('id') id: string,
    @Body() dto: { decision: 'approved' | 'rejected'; reviewNote?: string },
    @Request() req: any,
  ) {
    return this.service.reviewProvisioningRequest(id, dto.decision, this.adminUser(req), dto.reviewNote);
  }

  // ── Deal registration (Phase 2) ───────────────────────────
  @Get('deals')
  async deals(@Query() query: any) {
    return this.service.getDeals(query);
  }

  @Patch('deals/:id/convert')
  async convertDeal(@Param('id') id: string, @Body() dto: { institutionId: string }, @Request() req: any) {
    return this.service.convertDeal(id, dto.institutionId, this.adminUser(req));
  }

  @Patch('deals/:id/reject')
  async rejectDeal(@Param('id') id: string, @Body() dto: { reviewNote?: string }, @Request() req: any) {
    return this.service.rejectDeal(id, this.adminUser(req), dto?.reviewNote);
  }

  // ── MDF claims queue (Phase 3) ────────────────────────────
  @Get('mdf-claims')
  async mdfClaims(@Query() query: any) {
    return this.service.getMdfClaims(query);
  }

  @Patch('mdf-claims/:id/review')
  async reviewMdfClaim(
    @Param('id') id: string,
    @Body() dto: { decision: 'approved' | 'rejected'; amountApproved?: number; reviewNote?: string },
    @Request() req: any,
  ) {
    return this.service.reviewMdfClaim(id, dto.decision, this.adminUser(req), dto.amountApproved, dto.reviewNote);
  }

  @Patch('mdf-claims/:id/pay')
  async payMdfClaim(
    @Param('id') id: string,
    @Body() dto: { paymentMethod: string; bankAccountId?: string; referenceNumber?: string; paymentDate?: string },
    @Request() req: any,
  ) {
    return this.service.payMdfClaim(id, dto, this.adminUser(req));
  }

  // ── Partner Directory (Phase 1) — generic :id routes below;
  // nothing literal may be added after this point without moving above ──
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.getResellerById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: any, @Request() req: any) {
    return this.service.createReseller(dto, this.adminUser(req));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateReseller(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: { status: string; reason?: string },
    @Request() req: any,
  ) {
    return this.service.updateResellerStatus(
      id,
      dto.status,
      dto.reason || '',
      this.adminUser(req),
    );
  }

  @Post(':id/institutions')
  @HttpCode(HttpStatus.CREATED)
  async provisionInstitution(
    @Param('id') id: string,
    @Body() dto: any,
    @Request() req: any,
  ) {
    return this.service.provisionInstitution(id, dto, this.adminUser(req));
  }

  @Get(':id/commission-summary')
  async commissionSummary(@Param('id') id: string) {
    return this.service.getCommissionSummary(id);
  }

  @Get(':id/commission-ledger')
  async commissionLedger(@Param('id') id: string, @Query() query: any) {
    return this.service.getCommissionLedger(id, query);
  }

  // ── MDF budget (Phase 3, Regional Partner tier) ────────────
  @Patch(':id/mdf-budget')
  async setMdfBudget(@Param('id') id: string, @Body() dto: { amount: number; fiscalYear: number }) {
    return this.service.setMdfBudget(id, dto.amount, dto.fiscalYear);
  }

  @Get(':id/mdf-summary')
  async mdfSummary(@Param('id') id: string) {
    return this.service.getMdfSummary(id);
  }

  // ── Branding (Phase 3, Regional Partner tier) ──────────────
  @Patch(':id/branding')
  async setBranding(@Param('id') id: string, @Body() dto: { logoUrl?: string; accentColor?: string }) {
    return this.service.setBranding(id, dto);
  }

  // ── Reseller Portal v1 — account provisioning ─────────────
  @Post(':id/portal-users')
  @HttpCode(HttpStatus.CREATED)
  async createPortalUser(
    @Param('id') id: string,
    @Body() dto: { email: string; name?: string; role?: string },
    @Request() req: any,
  ) {
    return this.service.createPortalUser(id, dto, this.adminUser(req));
  }

  @Get(':id/portal-users')
  async portalUsers(@Param('id') id: string) {
    return this.service.getPortalUsers(id);
  }
}
