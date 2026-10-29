import {
  Controller, Get, Post, Patch,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { AllowNonStaff, Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';
import { SCHOOL_STAFF_ROLES } from '../auth/role-sets';

/**
 * Complaints (R2). STAFF actions (case types, ageing, list-all, read any case, remark, reassign, close, reopen, escalation run) carry a hard
 * @Roles(...SCHOOL_STAFF_ROLES): a parent, student or partner token is 403 in EVERY NonStaffGuard mode (the guard only logs by default).
 * The web's Governance > Complaints tab uses all of them (governance:view roles: super_admin, institution_owner, admin, principal, or a custom
 * role with governance:complaints; src/App.tsx:132-134, governance/index.tsx:50-56, services/complaints.api.ts), all of which are school staff.
 * A parent/student can only (a) file a case (POST /complaints, sanitised in the service) and (b) read back THEIR OWN cases (GET /complaints/mine[/:id]).
 */
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly service: ComplaintsService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
      requestingUser: req?.user,
    };
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Get('case-types')
  async getCaseTypes(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCaseTypes(schoolSlug);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Post('case-types')
  @HttpCode(HttpStatus.CREATED)
  async createCaseType(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCaseType(schoolSlug, dto);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Patch('case-types/:id')
  async updateCaseType(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCaseType(id, schoolSlug, dto);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Get('aging')
  async getAging(@Request() req: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getAgingReport(schoolSlug, requestingUser);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Get()
  async getCases(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getCases(schoolSlug, query, requestingUser);
  }

  // Parent / student: their OWN cases only. Declared before ':id' so 'mine' is never read as a case id.
  @AllowNonStaff()
  @Roles(UserRole.PARENT, UserRole.STUDENT)
  @Get('mine')
  async getMine(@Request() req: any, @Query() q: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getMyCases(schoolSlug, requestingUser, q?.page, q?.limit);
  }

  @AllowNonStaff()
  @Roles(UserRole.PARENT, UserRole.STUDENT)
  @Get('mine/:id')
  async getMineById(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getMyCase(id, schoolSlug, requestingUser);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCaseById(id, schoolSlug);
  }

  // Parent app feedback (parent_api_service.dart). Only this POST is open to parents, not the reads.
  @AllowNonStaff()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCase(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.createCase(schoolSlug, dto, requestingUser);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Post(':id/remarks')
  async addRemark(@Param('id') id: string, @Body() dto: { text: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.addRemark(id, schoolSlug, dto.text, userName);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Patch(':id/reassign')
  async reassign(@Param('id') id: string, @Body() dto: { assigneeId: string; reason?: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.reassignCase(id, schoolSlug, dto.assigneeId, userName, dto.reason);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Patch(':id/close')
  async close(@Param('id') id: string, @Body() dto: { resolutionNotes: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.closeCase(id, schoolSlug, dto.resolutionNotes, userName);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Patch(':id/reopen')
  async reopen(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.reopenCase(id, schoolSlug);
  }

  @Roles(...SCHOOL_STAFF_ROLES)
  @Post('run-escalations-now')
  @HttpCode(HttpStatus.OK)
  async runEscalationsNow() {
    // Manual trigger for the same job @Cron runs hourly - lets you test
    // the whole escalation ladder immediately instead of waiting, same
    // pattern as the fee defaulter engine's run-automated-now endpoint.
    return this.service.runEscalations();
  }
}
