// ============================================================
// BEHAVIOUR & TARBIYAH CONTROLLER + MODULE
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { BehaviourService } from './behaviour.service';
import { TARBIYAH_TRAITS } from './schemas/behaviour.schema';
import { isTeacherCaller, applyTeacherAuthorship } from '../staff-portal/teacher-identity.util';
import { STAFF_WRITE_ROLES, TEACHING_ADMIN_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';
import { BehaviourAccessGuard } from './guards/behaviour-access.guard';
import { BehaviourAccess } from './behaviour-access';

// Counselling sessions and interventions are confidential pastoral records: admin roles, or a custom role with a grant on exactly that
// sub-module (behaviour -> counselling / interventions). A teacher (or the stock module-wide Teacher custom role) is NOT authorised.
const COUNSELLING_READ = () => RolesOrModuleManage('behaviour', TEACHING_ADMIN_ROLES, { level: 'view', subModuleKey: 'counselling' });
const COUNSELLING_WRITE = () => RolesOrModuleManage('behaviour', TEACHING_ADMIN_ROLES, { level: 'manage', subModuleKey: 'counselling' });
const INTERVENTIONS_READ = () => RolesOrModuleManage('behaviour', TEACHING_ADMIN_ROLES, { level: 'view', subModuleKey: 'interventions' });
const INTERVENTIONS_WRITE = () => RolesOrModuleManage('behaviour', TEACHING_ADMIN_ROLES, { level: 'manage', subModuleKey: 'interventions' });

// ── CONTROLLER ────────────────────────────────────────────────
// Every handler carries exactly one @BehaviourAccess policy, evaluated by
// BehaviourAccessGuard (BEHAVIOUR_GUARD_MODE=log|enforce; parent/student tokens
// are denied in both modes). The pre-existing @RolesOrModuleManage on the
// record/tarbiyah writes is unchanged and still enforced immediately.
@Controller('behaviour')
@UseGuards(BehaviourAccessGuard)
export class BehaviourController {
  constructor(private readonly service: BehaviourService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
      requestingUser: req?.user,
      access: req?.behaviourAccess,
    };
  }

  // ── Dashboard ────────────────────────────────────────────────
  @BehaviourAccess('aggregate_read', 'dashboard')
  @Get('dashboard')
  async getDashboard(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug, ay);
  }

  // ── Tarbiyah Traits List (static) ────────────────────────────
  @BehaviourAccess('meta_read', 'tarbiyah')
  @Get('tarbiyah-traits')
  getTarbiyahTraits() {
    return { traits: TARBIYAH_TRAITS };
  }

  // ── Behaviour Records ─────────────────────────────────────────
  @BehaviourAccess('staff_read', 'records')
  @Get('records')
  async getRecords(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser, access } = this.ctx(req);
    return this.service.getRecords(schoolSlug, query, requestingUser, access);
  }

  @BehaviourAccess('staff_read', 'records')
  @Get('records/:id')
  async getRecord(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, requestingUser, access } = this.ctx(req);
    return this.service.getRecordById(id, schoolSlug, requestingUser, access);
  }

  @BehaviourAccess('record_write', 'records')
  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('records')
  @HttpCode(HttpStatus.CREATED)
  async createRecord(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName, requestingUser, access } = this.ctx(req);
    const body = { ...dto, schoolSlug, academicYear: dto.academicYear || academicYear, reportedBy: dto.reportedBy || userName };
    // TEACHER callers: authorship is derived server-side. The display name
    // is overridden from the token; reportedById must be me (or absent) else 403.
    if (isTeacherCaller(requestingUser)) applyTeacherAuthorship(body, requestingUser, userName);
    return this.service.createRecord(body, requestingUser, access);
  }

  @BehaviourAccess('record_write', 'records')
  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Put('records/:id')
  async updateRecord(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, requestingUser, access } = this.ctx(req);
    // A teacher cannot re-attribute a record to someone else (or tenancy fields) via PUT.
    if (isTeacherCaller(requestingUser)) {
      dto = { ...dto };
      delete dto.reportedBy; delete dto.reportedById; delete dto.schoolSlug; delete dto.campusId; delete dto.verifiedBy;
    }
    return this.service.updateRecord(id, schoolSlug, dto, requestingUser, access);
  }

  @BehaviourAccess('record_write', 'records')
  // D7: was unguarded (any token, parents and students included). Same guard as create / edit; the web's
  // Resolve button is shown to every role with the Behaviour page and keeps working for them.
  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('records/:id/resolve')
  async resolveRecord(
    @Param('id') id: string,
    @Body() dto: { note: string },
    @Request() req: any,
  ) {
    const { schoolSlug, userName, requestingUser, access } = this.ctx(req);
    return this.service.resolveRecord(id, schoolSlug, dto?.note, userName, requestingUser, access);
  }

  @BehaviourAccess('staff_read', 'records')
  @Get('students/:studentId/profile')
  async getStudentProfile(
    @Param('studentId') studentId: string,
    @Request() req: any,
    @Query('academicYear') ay?: string,
  ) {
    const { schoolSlug, requestingUser, access } = this.ctx(req);
    return this.service.getStudentBehaviourProfile(studentId, schoolSlug, ay, requestingUser, access);
  }

  // ── Tarbiyah Assessments ──────────────────────────────────────
  @BehaviourAccess('staff_read', 'tarbiyah')
  @Get('tarbiyah')
  async getTarbiyah(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser, access } = this.ctx(req);
    return this.service.getTarbiyahAssessments(schoolSlug, query, requestingUser, access);
  }

  @BehaviourAccess('aggregate_read', 'tarbiyah')
  @Get('tarbiyah/analytics')
  async getTarbiyahAnalytics(
    @Request() req: any,
    @Query('grade') grade?: string,
    @Query('period') period?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTarbiyahTraitAnalytics(schoolSlug, grade, period);
  }

  // Class-wise / school-wide / consolidated leaderboard behind the
  // Tarbiyah "Reports" tab - see BehaviourService.getTarbiyahReportData.
  @BehaviourAccess('aggregate_read', 'tarbiyah')
  @Get('tarbiyah/report')
  async getTarbiyahReport(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getTarbiyahReportData(schoolSlug, query, requestingUser);
  }

  @BehaviourAccess('record_write', 'tarbiyah')
  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('tarbiyah')
  @HttpCode(HttpStatus.CREATED)
  async createTarbiyah(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName, requestingUser, access } = this.ctx(req);
    const body: any = { ...dto, schoolSlug, academicYear: dto.academicYear || academicYear, assessedBy: dto.assessedBy || userName };
    // Authorship is derived server-side so the author-or-admin rule on PUT has something to check: admin roles may name an author,
    // everyone else is always recorded as themselves.
    const role = requestingUser?.role || requestingUser?.primaryRole;
    if (!TEACHING_ADMIN_ROLES.includes(role as any) || !body.assessedById) {
      body.assessedById = requestingUser?.userId;
      if (!TEACHING_ADMIN_ROLES.includes(role as any)) body.assessedBy = userName;
    }
    return this.service.createTarbiyahAssessment(schoolSlug, body, requestingUser, access);
  }

  @BehaviourAccess('meta_read', 'tarbiyah')
  @Get('character-settings')
  async getCharacterSettings(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCharacterSettings(schoolSlug);
  }

  @BehaviourAccess('settings_write', 'tarbiyah')
  @Put('character-settings')
  async updateCharacterSettings(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCharacterSettings(schoolSlug, dto);
  }

  @BehaviourAccess('record_write', 'tarbiyah')
  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Put('tarbiyah/:id')
  async updateTarbiyah(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, requestingUser, access } = this.ctx(req);
    return this.service.updateTarbiyahAssessment(id, schoolSlug, dto, requestingUser, access);
  }

  // ── Counselling ───────────────────────────────────────────────
  @BehaviourAccess('confidential_read', 'counselling')
  @COUNSELLING_READ()
  @Get('counselling')
  async getCounselling(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getCounsellingSessions(schoolSlug, query, requestingUser);
  }

  @BehaviourAccess('confidential_write', 'counselling')
  @COUNSELLING_WRITE()
  @Post('counselling')
  @HttpCode(HttpStatus.CREATED)
  async createCounselling(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName, requestingUser } = this.ctx(req);
    return this.service.createCounsellingSession({
      ...dto, schoolSlug,
      academicYear: dto.academicYear || academicYear,
      counsellor: dto.counsellor || userName,
    }, requestingUser);
  }

  @BehaviourAccess('confidential_write', 'counselling')
  @COUNSELLING_WRITE()
  @Put('counselling/:id')
  async updateCounselling(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCounsellingSession(id, schoolSlug, dto);
  }

  @BehaviourAccess('confidential_write', 'counselling')
  @COUNSELLING_WRITE()
  @Patch('counselling/:id/complete')
  async completeCounselling(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.completeCounsellingSession(id, schoolSlug, dto);
  }

  // ── Interventions ─────────────────────────────────────────────
  @BehaviourAccess('confidential_read', 'interventions')
  @INTERVENTIONS_READ()
  @Get('interventions')
  async getInterventions(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getInterventions(schoolSlug, query, requestingUser);
  }

  @BehaviourAccess('confidential_write', 'interventions')
  @INTERVENTIONS_WRITE()
  @Post('interventions')
  @HttpCode(HttpStatus.CREATED)
  async createIntervention(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName, requestingUser } = this.ctx(req);
    return this.service.createIntervention({
      ...dto, schoolSlug,
      academicYear: dto.academicYear || academicYear,
      createdBy: dto.createdBy || userName,
    }, requestingUser);
  }

  @BehaviourAccess('confidential_write', 'interventions')
  @INTERVENTIONS_WRITE()
  @Put('interventions/:id')
  async updateIntervention(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateIntervention(id, schoolSlug, dto);
  }

  @BehaviourAccess('confidential_write', 'interventions')
  @INTERVENTIONS_WRITE()
  @Post('interventions/:id/progress')
  async addProgress(@Param('id') id: string, @Body() dto: { note: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.addProgressNote(id, schoolSlug, dto.note, userName);
  }

  @BehaviourAccess('confidential_write', 'interventions')
  @INTERVENTIONS_WRITE()
  @Patch('interventions/:id/action/:actionId')
  async updateAction(
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() dto: { status: string; completionNote?: string },
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateActionStatus(id, schoolSlug, actionId, dto.status, dto.completionNote);
  }

  // ── Behaviour Contracts ───────────────────────────────────────
  @BehaviourAccess('confidential_read', 'interventions')
  @Get('contracts')
  async getContracts(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getContracts(schoolSlug, query, requestingUser);
  }

  @BehaviourAccess('confidential_write', 'interventions')
  @Post('contracts')
  @HttpCode(HttpStatus.CREATED)
  async createContract(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName, requestingUser } = this.ctx(req);
    return this.service.createContract({
      ...dto, schoolSlug,
      academicYear: dto.academicYear || academicYear,
      createdBy: userName,
    }, requestingUser);
  }

  @BehaviourAccess('confidential_write', 'interventions')
  @Patch('contracts/:id/sign')
  async signContract(
    @Param('id') id: string,
    @Body('signedBy') signedBy: 'student' | 'parent' | 'teacher',
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.signContract(id, schoolSlug, signedBy);
  }

  // ── Reports ───────────────────────────────────────────────────
  @BehaviourAccess('aggregate_read', 'reports')
  @Get('reports')
  async getReport(
    @Request() req: any,
    @Query('academicYear') academicYear: string,
    @Query('grade') grade?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getBehaviourReport(schoolSlug, academicYear, grade, from, to);
  }
}
