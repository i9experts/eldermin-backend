import {
  Controller, Get, Post, Patch,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { AllowNonStaff, Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';
import { COMPLAINTS_STAFF_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';

// Reads need the governance/complaints VIEW grant, changes the MANAGE grant (a custom role; the base roles above do everything the web offers).
const COMPLAINTS_READ = () => RolesOrModuleManage('governance', COMPLAINTS_STAFF_ROLES, { level: 'view', subModuleKey: 'complaints', allowModuleWide: true });
const COMPLAINTS_WRITE = () => RolesOrModuleManage('governance', COMPLAINTS_STAFF_ROLES, { level: 'manage', subModuleKey: 'complaints', allowModuleWide: true });

/**
 * Complaints (R2.1). STAFF actions (case types, ageing, list-all, read any case, remark, reassign, close, reopen, escalation run) are limited to exactly
 * the roles the web shows the Complaints tab to (COMPLAINTS_STAFF_ROLES, see auth/role-sets.ts for the web citations) plus custom roles holding the
 * governance / complaints grant (view for reads, manage for changes). Everyone else, teachers and every other staff role included, parent, student and
 * partner tokens too, gets 403, always (no flag, independent of NON_STAFF_GUARD_MODE).
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

  @COMPLAINTS_READ()
  @Get('case-types')
  async getCaseTypes(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCaseTypes(schoolSlug);
  }

  @COMPLAINTS_WRITE()
  @Post('case-types')
  @HttpCode(HttpStatus.CREATED)
  async createCaseType(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createCaseType(schoolSlug, dto);
  }

  @COMPLAINTS_WRITE()
  @Patch('case-types/:id')
  async updateCaseType(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCaseType(id, schoolSlug, dto);
  }

  @COMPLAINTS_READ()
  @Get('aging')
  async getAging(@Request() req: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getAgingReport(schoolSlug, requestingUser);
  }

  @COMPLAINTS_READ()
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

  @COMPLAINTS_READ()
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

  @COMPLAINTS_WRITE()
  @Post(':id/remarks')
  async addRemark(@Param('id') id: string, @Body() dto: { text: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.addRemark(id, schoolSlug, dto.text, userName);
  }

  @COMPLAINTS_WRITE()
  @Patch(':id/reassign')
  async reassign(@Param('id') id: string, @Body() dto: { assigneeId: string; reason?: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.reassignCase(id, schoolSlug, dto.assigneeId, userName, dto.reason);
  }

  @COMPLAINTS_WRITE()
  @Patch(':id/close')
  async close(@Param('id') id: string, @Body() dto: { resolutionNotes: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.closeCase(id, schoolSlug, dto.resolutionNotes, userName);
  }

  @COMPLAINTS_WRITE()
  @Patch(':id/reopen')
  async reopen(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.reopenCase(id, schoolSlug);
  }

  @COMPLAINTS_WRITE()
  @Post('run-escalations-now')
  @HttpCode(HttpStatus.OK)
  async runEscalationsNow() {
    // Manual trigger for the same job @Cron runs hourly - lets you test
    // the whole escalation ladder immediately instead of waiting, same
    // pattern as the fee defaulter engine's run-automated-now endpoint.
    return this.service.runEscalations();
  }
}
