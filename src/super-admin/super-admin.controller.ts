// ============================================================
// SUPER ADMIN CONTROLLER
// Eldermin SaaS Platform | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Patch, Body,
  Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

// NOTE: In production, protect ALL routes with SuperAdminGuard
// @UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  private adminUser(req: any) {
    return req?.user?.name || req?.headers['x-admin-user'] || 'Super Admin';
  }

  // ── Business Intelligence ─────────────────────────────────
  @Get('dashboard')
  async getDashboard() {
    return this.service.getBusinessIntelligence();
  }

  // ── Institutions ──────────────────────────────────────────
  @Get('institutions')
  async getInstitutions(@Query() query: any) {
    return this.service.getInstitutions(query);
  }

  @Get('institutions/:slug')
  async getInstitution(@Param('slug') slug: string) {
    return this.service.getInstitutionById(slug);
  }

  @Post('institutions')
  @HttpCode(HttpStatus.CREATED)
  async createInstitution(@Body() dto: any, @Request() req: any) {
    return this.service.createInstitution(dto, this.adminUser(req));
  }

  @Put('institutions/:slug')
  async updateInstitution(@Param('slug') slug: string, @Body() dto: any) {
    return { message: 'Updated', slug };
  }

  @Patch('institutions/:slug/status')
  async updateStatus(
    @Param('slug') slug: string,
    @Body() dto: { status: string; reason: string },
    @Request() req: any,
  ) {
    return this.service.updateInstitutionStatus(slug, dto.status, dto.reason, this.adminUser(req));
  }

  @Patch('institutions/:slug/subscription')
  async updateSubscription(
    @Param('slug') slug: string,
    @Body() dto: any,
    @Request() req: any,
  ) {
    return this.service.updateSubscription(slug, dto, this.adminUser(req));
  }

  @Post('institutions/:slug/impersonate')
  async impersonate(@Param('slug') slug: string, @Request() req: any) {
    const token = await this.service.generateImpersonationToken(slug, this.adminUser(req));
    return { token, message: 'Impersonation token valid for 30 minutes' };
  }

  // ── Platform Analytics ────────────────────────────────────
  @Get('analytics')
  async getAnalytics() {
    return this.service.getPlatformAnalytics();
  }

  @Post('health-scores/recalculate')
  async recalculateHealthScores() {
    return this.service.updateHealthScores();
  }

  @Post('institutions/:slug/usage')
  async recordUsage(@Param('slug') slug: string, @Body() dto: any) {
    return this.service.recordDailyUsage(slug, dto);
  }

  // ── Alerts ────────────────────────────────────────────────
  @Get('alerts')
  async getAlerts() {
    return this.service.getAlerts();
  }

  // ── Announcements ─────────────────────────────────────────
  @Get('announcements')
  async getAnnouncements() {
    return this.service.getAnnouncements();
  }

  @Post('announcements')
  @HttpCode(HttpStatus.CREATED)
  async createAnnouncement(@Body() dto: any, @Request() req: any) {
    return this.service.createAnnouncement({ ...dto, createdBy: this.adminUser(req) });
  }

  // ── Support Tickets ───────────────────────────────────────
  @Get('tickets')
  async getTickets(@Query() query: any) {
    return this.service.getTickets(query);
  }

  @Put('tickets/:id')
  async updateTicket(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateTicket(id, dto);
  }

  @Post('tickets/:id/reply')
  async replyToTicket(@Param('id') id: string, @Body() dto: { message: string }, @Request() req: any) {
    return this.service.replyToTicket(id, dto.message, this.adminUser(req));
  }
}
