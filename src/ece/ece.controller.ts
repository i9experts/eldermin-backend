import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Request, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { EceService } from './ece.service';
import {
  CreateFrameworkDto, UpdateFrameworkDto, CreateDomainDto, UpdateDomainDto,
  CreateSkillDto, UpdateSkillDto, CreateIndicatorDto, CreateAgeBandDto,
  CreateObservationDto, QuickObserveDto, ObservationQueryDto,
  CreatePortfolioEntryDto, FamilyResponseDto,
  CreateLearningExperienceDto, UpdateLearningExperienceDto, UpsertWeeklyPlanDto,
  CreateEnvironmentAreaDto, UpdateEnvironmentAreaDto, LogSafetyCheckDto, AddObservationNoteDto,
  CreateFrameworkMappingDto, UpdateFrameworkMappingDto,
  CreateMontessoriMaterialDto, UpsertWorkRecordDto,
  SuggestMappingsDto, CheckQualityDto,
  CreateCareRecordDto, CreateSupportCaseDto, AddSupportStrategyDto, AddSupportReviewDto, UpdateSupportCaseDto,
} from './dto/ece.dto';
import { STAFF_WRITE_ROLES, SCHOOL_STAFF_ROLES, TEACHING_ADMIN_ROLES } from '../auth/role-sets';
import { Roles } from '../auth/decorators';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';

// D9: every /ece route (reads included) is for school staff. Before this only 5 writes were guarded and all reads,
// settings and care/support records were open to any token (parent, student, reseller included). The only callers are the
// staff pages of the web Early Years module; the parent app and the teacher app do not call /ece.
// Handler-level @RolesOrModuleManage on the five writes still applies on top.
@Roles(...SCHOOL_STAFF_ROLES)
@Controller('ece')
export class EceController {
  constructor(private readonly service: EceService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers?.['x-school-slug'],
      academicYear: req?.user?.academicYear || req?.headers?.['x-academic-year'] || 'unset',
      userId: req?.user?.userId,
      userName: req?.user?.name || 'Staff',
    };
  }

  // ── Frameworks ─────────────────────────────────────────────
  @Get('frameworks')
  getFrameworks(@Request() req: any) {
    return this.service.getFrameworks(this.ctx(req).schoolSlug);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Post('frameworks') @HttpCode(HttpStatus.CREATED)
  createFramework(@Request() req: any, @Body() dto: CreateFrameworkDto) {
    return this.service.createFramework(this.ctx(req).schoolSlug, dto);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Patch('frameworks/:id')
  updateFramework(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateFrameworkDto) {
    return this.service.updateFramework(this.ctx(req).schoolSlug, id, dto);
  }

  // ── Domains ────────────────────────────────────────────────
  @Get('domains')
  getDomains(@Request() req: any) {
    return this.service.getDomains(this.ctx(req).schoolSlug);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Post('domains') @HttpCode(HttpStatus.CREATED)
  createDomain(@Request() req: any, @Body() dto: CreateDomainDto) {
    return this.service.createDomain(this.ctx(req).schoolSlug, dto);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Patch('domains/:id')
  updateDomain(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateDomainDto) {
    return this.service.updateDomain(this.ctx(req).schoolSlug, id, dto);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Post('domains/seed-default') @HttpCode(HttpStatus.OK)
  seedDefaultDomains(@Request() req: any) {
    return this.service.seedDefaultDomains(this.ctx(req).schoolSlug);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Post('domains/seed-pakistan-snc') @HttpCode(HttpStatus.OK)
  seedPakistanNationalCurriculum(@Request() req: any) {
    return this.service.seedPakistanNationalCurriculum(this.ctx(req).schoolSlug);
  }

  // ── Skills ─────────────────────────────────────────────────
  @Get('skills')
  getSkills(@Request() req: any, @Query('domainId') domainId?: string) {
    return this.service.getSkills(this.ctx(req).schoolSlug, domainId);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Post('skills') @HttpCode(HttpStatus.CREATED)
  createSkill(@Request() req: any, @Body() dto: CreateSkillDto) {
    return this.service.createSkill(this.ctx(req).schoolSlug, dto);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Patch('skills/:id')
  updateSkill(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.service.updateSkill(this.ctx(req).schoolSlug, id, dto);
  }

  // ── Indicators ─────────────────────────────────────────────
  @Get('indicators')
  getIndicators(@Request() req: any, @Query('skillId') skillId?: string) {
    return this.service.getIndicators(this.ctx(req).schoolSlug, skillId);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Post('indicators') @HttpCode(HttpStatus.CREATED)
  createIndicator(@Request() req: any, @Body() dto: CreateIndicatorDto) {
    return this.service.createIndicator(this.ctx(req).schoolSlug, dto);
  }

  // ── Age Bands ──────────────────────────────────────────────
  @Get('age-bands')
  getAgeBands(@Request() req: any) {
    return this.service.getAgeBands(this.ctx(req).schoolSlug);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Post('age-bands') @HttpCode(HttpStatus.CREATED)
  createAgeBand(@Request() req: any, @Body() dto: CreateAgeBandDto) {
    return this.service.createAgeBand(this.ctx(req).schoolSlug, dto);
  }

  // ── Observations ───────────────────────────────────────────
  @Get('observations')
  getObservations(@Request() req: any, @Query() query: ObservationQueryDto) {
    return this.service.getObservations(this.ctx(req).schoolSlug, query, req.user);
  }

  @RolesOrModuleManage('early-years', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('observations') @HttpCode(HttpStatus.CREATED)
  async createObservation(@Request() req: any, @Body() dto: CreateObservationDto) {
    const { schoolSlug, academicYear, userId, userName } = this.ctx(req);
    await this.service.assertStudentInScope(schoolSlug, dto.studentId, req.user);
    return this.service.createObservation(schoolSlug, academicYear, userId, userName, dto);
  }

  @RolesOrModuleManage('early-years', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('observations/quick') @HttpCode(HttpStatus.CREATED)
  async quickObserve(@Request() req: any, @Body() dto: QuickObserveDto) {
    const { schoolSlug, academicYear, userId, userName } = this.ctx(req);
    await this.service.assertStudentInScope(schoolSlug, dto.studentId, req.user);
    return this.service.quickObserve(schoolSlug, academicYear, userId, userName, dto);
  }

  // ── Development Profile ───────────────────────────────────
  @Get('students/:studentId/profile')
  async getProfile(@Request() req: any, @Param('studentId') studentId: string) {
    const { schoolSlug, academicYear } = this.ctx(req);
    await this.service.assertStudentInScope(schoolSlug, studentId, req.user);
    return this.service.getProfile(schoolSlug, studentId, academicYear);
  }

  @Patch('students/:studentId/profile/tags')
  async updateProfileTags(@Request() req: any, @Param('studentId') studentId: string, @Body() body: { interests?: string[]; schemas?: string[] }) {
    const { schoolSlug, academicYear } = this.ctx(req);
    await this.service.assertStudentInScope(schoolSlug, studentId, req.user);
    return this.service.updateProfileTags(schoolSlug, studentId, academicYear, body.interests, body.schemas);
  }

  // ── Portfolio ──────────────────────────────────────────────
  @Get('students/:studentId/portfolio')
  async getPortfolio(@Request() req: any, @Param('studentId') studentId: string) {
    await this.service.assertStudentInScope(this.ctx(req).schoolSlug, studentId, req.user);
    return this.service.getPortfolio(this.ctx(req).schoolSlug, studentId);
  }

  @Get('students/:studentId/learning-journey-pdf')
  async getLearningJourneyPdf(@Request() req: any, @Param('studentId') studentId: string, @Res() res: Response) {
    const { schoolSlug, academicYear } = this.ctx(req);
    await this.service.assertStudentInScope(schoolSlug, studentId, req.user);
    const pdf = await this.service.generateLearningJourneyPdf(schoolSlug, studentId, academicYear);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="learning-journey-${studentId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }

  @RolesOrModuleManage('early-years', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('portfolio') @HttpCode(HttpStatus.CREATED)
  async createPortfolioEntry(@Request() req: any, @Body() dto: CreatePortfolioEntryDto) {
    await this.service.assertStudentInScope(this.ctx(req).schoolSlug, dto.studentId, req.user);
    return this.service.createPortfolioEntry(this.ctx(req).schoolSlug, dto);
  }

  @RolesOrModuleManage('early-years', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('portfolio/:id/share')
  async shareEntry(@Request() req: any, @Param('id') id: string, @Body('isVisibleToFamily') isVisibleToFamily: boolean) {
    await this.service.assertRecordInScope('portfolio', id, this.ctx(req).schoolSlug, req.user);
    return this.service.shareEntry(this.ctx(req).schoolSlug, id, isVisibleToFamily);
  }

  @Patch('portfolio/:id/respond')
  async respondToEntry(@Request() req: any, @Param('id') id: string, @Body() dto: FamilyResponseDto) {
    await this.service.assertRecordInScope('portfolio', id, this.ctx(req).schoolSlug, req.user);
    return this.service.respondToEntry(this.ctx(req).schoolSlug, id, dto.text, dto.respondedBy);
  }

  // ── Learning Experiences ───────────────────────────────────
  @Get('experiences')
  getExperiences(@Request() req: any, @Query('domainId') domainId?: string) {
    return this.service.getExperiences(this.ctx(req).schoolSlug, domainId);
  }

  @Post('experiences') @HttpCode(HttpStatus.CREATED)
  createExperience(@Request() req: any, @Body() dto: CreateLearningExperienceDto) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createExperience(schoolSlug, userName, dto);
  }

  @Put('experiences/:id')
  updateExperience(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateLearningExperienceDto) {
    return this.service.updateExperience(this.ctx(req).schoolSlug, id, dto);
  }

  @Delete('experiences/:id') @HttpCode(HttpStatus.OK)
  deleteExperience(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteExperience(this.ctx(req).schoolSlug, id);
  }

  // ── Weekly Provision Plan ──────────────────────────────────
  @Get('weekly-plan')
  getWeeklyPlan(
    @Request() req: any,
    @Query('gradeLevel') gradeLevel: string,
    @Query('sectionName') sectionName: string,
    @Query('weekStartDate') weekStartDate: string,
  ) {
    return this.service.getWeeklyPlan(this.ctx(req).schoolSlug, gradeLevel, sectionName, weekStartDate);
  }

  @RolesOrModuleManage('early-years', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Put('weekly-plan') @HttpCode(HttpStatus.OK)
  upsertWeeklyPlan(@Request() req: any, @Body() dto: UpsertWeeklyPlanDto) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.upsertWeeklyPlan(schoolSlug, userName, dto);
  }

  // ── Environment / Provision Areas ──────────────────────────
  @Get('environment-areas')
  getEnvironmentAreas(@Request() req: any) {
    return this.service.getEnvironmentAreas(this.ctx(req).schoolSlug);
  }

  @Post('environment-areas') @HttpCode(HttpStatus.CREATED)
  createEnvironmentArea(@Request() req: any, @Body() dto: CreateEnvironmentAreaDto) {
    return this.service.createEnvironmentArea(this.ctx(req).schoolSlug, dto);
  }

  @Post('environment-areas/seed-default') @HttpCode(HttpStatus.OK)
  seedDefaultEnvironmentAreas(@Request() req: any) {
    return this.service.seedDefaultEnvironmentAreas(this.ctx(req).schoolSlug);
  }

  @Put('environment-areas/:id')
  updateEnvironmentArea(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateEnvironmentAreaDto) {
    return this.service.updateEnvironmentArea(this.ctx(req).schoolSlug, id, dto);
  }

  @Patch('environment-areas/:id/safety-check')
  logSafetyCheck(@Request() req: any, @Param('id') id: string, @Body() dto: LogSafetyCheckDto) {
    return this.service.logSafetyCheck(this.ctx(req).schoolSlug, id, dto.checkedBy);
  }

  @Patch('environment-areas/:id/observation')
  addEnvironmentObservation(@Request() req: any, @Param('id') id: string, @Body() dto: AddObservationNoteDto) {
    return this.service.addEnvironmentObservation(this.ctx(req).schoolSlug, id, dto.note);
  }

  // ── Framework Mapping ───────────────────────────────────────
  @Get('framework-mappings')
  getFrameworkMappings(@Request() req: any, @Query('frameworkId') frameworkId: string) {
    return this.service.getFrameworkMappings(this.ctx(req).schoolSlug, frameworkId);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Post('framework-mappings') @HttpCode(HttpStatus.CREATED)
  createFrameworkMapping(@Request() req: any, @Body() dto: CreateFrameworkMappingDto) {
    return this.service.createFrameworkMapping(this.ctx(req).schoolSlug, dto);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Put('framework-mappings/:id')
  updateFrameworkMapping(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateFrameworkMappingDto) {
    return this.service.updateFrameworkMapping(this.ctx(req).schoolSlug, id, dto);
  }

  @Roles(...TEACHING_ADMIN_ROLES)
  @Delete('framework-mappings/:id')
  deleteFrameworkMapping(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteFrameworkMapping(this.ctx(req).schoolSlug, id);
  }

  // ── Montessori ──────────────────────────────────────────────
  @Get('montessori/materials')
  getMontessoriMaterials(@Request() req: any, @Query('area') area?: string) {
    return this.service.getMontessoriMaterials(this.ctx(req).schoolSlug, area);
  }

  @Post('montessori/materials') @HttpCode(HttpStatus.CREATED)
  createMontessoriMaterial(@Request() req: any, @Body() dto: CreateMontessoriMaterialDto) {
    return this.service.createMontessoriMaterial(this.ctx(req).schoolSlug, dto);
  }

  @Post('montessori/materials/seed-classics') @HttpCode(HttpStatus.OK)
  seedClassicMontessoriMaterials(@Request() req: any) {
    return this.service.seedClassicMontessoriMaterials(this.ctx(req).schoolSlug);
  }

  @Get('montessori/work-records/:studentId')
  getWorkRecords(@Request() req: any, @Param('studentId') studentId: string) {
    return this.service.getWorkRecords(this.ctx(req).schoolSlug, studentId);
  }

  @Put('montessori/work-records') @HttpCode(HttpStatus.OK)
  upsertWorkRecord(@Request() req: any, @Body() dto: UpsertWorkRecordDto) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.upsertWorkRecord(schoolSlug, userName, dto);
  }

  // ── AI Assistance ───────────────────────────────────────────
  @Post('ai/suggest-mappings') @HttpCode(HttpStatus.OK)
  suggestMappings(@Request() req: any, @Body() dto: SuggestMappingsDto) {
    return this.service.suggestObservationMappings(this.ctx(req).schoolSlug, dto.narrative);
  }

  @Post('ai/check-quality') @HttpCode(HttpStatus.OK)
  checkQuality(@Body() dto: CheckQualityDto) {
    return this.service.checkObservationQuality(dto.narrative);
  }

  // ── Care & Wellbeing ────────────────────────────────────────
  @Get('care-records/:studentId')
  async getCareRecords(@Request() req: any, @Param('studentId') studentId: string, @Query('from') from?: string, @Query('to') to?: string) {
    await this.service.assertStudentInScope(this.ctx(req).schoolSlug, studentId, req.user);
    return this.service.getCareRecords(this.ctx(req).schoolSlug, studentId, from, to);
  }

  @Post('care-records') @HttpCode(HttpStatus.CREATED)
  async createCareRecord(@Request() req: any, @Body() dto: CreateCareRecordDto) {
    const { schoolSlug, userName } = this.ctx(req);
    await this.service.assertStudentInScope(schoolSlug, dto.studentId, req.user);
    return this.service.createCareRecord(schoolSlug, userName, dto);
  }

  @Put('care-records/:id')
  async updateCareRecord(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    await this.service.assertRecordInScope('care', id, this.ctx(req).schoolSlug, req.user);
    return this.service.updateCareRecord(id, this.ctx(req).schoolSlug, dto);
  }

  @Get('students/:studentId/allergies')
  async getStudentAllergies(@Request() req: any, @Param('studentId') studentId: string) {
    await this.service.assertStudentInScope(this.ctx(req).schoolSlug, studentId, req.user);
    return this.service.getStudentAllergies(this.ctx(req).schoolSlug, studentId);
  }

  // ── Inclusion & Additional Support ─────────────────────────
  @Get('support-cases')
  getSupportCases(@Request() req: any, @Query('studentId') studentId?: string, @Query('status') status?: string) {
    return this.service.getSupportCases(this.ctx(req).schoolSlug, studentId, status, req.user);
  }

  @Get('support-cases/:id')
  async getSupportCaseById(@Request() req: any, @Param('id') id: string) {
    await this.service.assertRecordInScope('support', id, this.ctx(req).schoolSlug, req.user);
    return this.service.getSupportCaseById(id, this.ctx(req).schoolSlug);
  }

  @Post('support-cases') @HttpCode(HttpStatus.CREATED)
  async createSupportCase(@Request() req: any, @Body() dto: CreateSupportCaseDto) {
    const { schoolSlug, userName } = this.ctx(req);
    await this.service.assertStudentInScope(schoolSlug, dto.studentId, req.user);
    return this.service.createSupportCase(schoolSlug, userName, dto);
  }

  @Post('support-cases/:id/strategies') @HttpCode(HttpStatus.CREATED)
  async addSupportStrategy(@Request() req: any, @Param('id') id: string, @Body() dto: AddSupportStrategyDto) {
    await this.service.assertRecordInScope('support', id, this.ctx(req).schoolSlug, req.user);
    return this.service.addSupportStrategy(id, this.ctx(req).schoolSlug, dto);
  }

  @Post('support-cases/:id/reviews') @HttpCode(HttpStatus.CREATED)
  async addSupportReview(@Request() req: any, @Param('id') id: string, @Body() dto: AddSupportReviewDto) {
    await this.service.assertRecordInScope('support', id, this.ctx(req).schoolSlug, req.user);
    return this.service.addSupportReview(id, this.ctx(req).schoolSlug, dto);
  }

  @Put('support-cases/:id')
  async updateSupportCase(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateSupportCaseDto) {
    await this.service.assertRecordInScope('support', id, this.ctx(req).schoolSlug, req.user);
    return this.service.updateSupportCase(id, this.ctx(req).schoolSlug, dto);
  }

  // ── Dashboard ──────────────────────────────────────────────
  @Get('children')
  getChildren(@Request() req: any) {
    return this.service.getChildren(this.ctx(req).schoolSlug, req.user);
  }

  @Get('dashboard')
  getDashboard(@Request() req: any) {
    const { schoolSlug, userId } = this.ctx(req);
    return this.service.getTeacherDashboard(schoolSlug, userId, req.user);
  }

  @Get('coordinator/coverage')
  getCoordinatorInsights(@Request() req: any) {
    return this.service.getCoordinatorInsights(this.ctx(req).schoolSlug, req.user);
  }
}
