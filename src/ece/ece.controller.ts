import {
  Controller, Get, Post, Put, Patch, Body, Param, Query, Request, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { EceService } from './ece.service';
import {
  CreateFrameworkDto, UpdateFrameworkDto, CreateDomainDto, UpdateDomainDto,
  CreateSkillDto, UpdateSkillDto, CreateIndicatorDto, CreateAgeBandDto,
  CreateObservationDto, QuickObserveDto, ObservationQueryDto,
  CreatePortfolioEntryDto, FamilyResponseDto,
  CreateLearningExperienceDto, UpdateLearningExperienceDto, UpsertWeeklyPlanDto,
} from './dto/ece.dto';

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

  @Post('frameworks') @HttpCode(HttpStatus.CREATED)
  createFramework(@Request() req: any, @Body() dto: CreateFrameworkDto) {
    return this.service.createFramework(this.ctx(req).schoolSlug, dto);
  }

  @Patch('frameworks/:id')
  updateFramework(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateFrameworkDto) {
    return this.service.updateFramework(this.ctx(req).schoolSlug, id, dto);
  }

  // ── Domains ────────────────────────────────────────────────
  @Get('domains')
  getDomains(@Request() req: any) {
    return this.service.getDomains(this.ctx(req).schoolSlug);
  }

  @Post('domains') @HttpCode(HttpStatus.CREATED)
  createDomain(@Request() req: any, @Body() dto: CreateDomainDto) {
    return this.service.createDomain(this.ctx(req).schoolSlug, dto);
  }

  @Patch('domains/:id')
  updateDomain(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateDomainDto) {
    return this.service.updateDomain(this.ctx(req).schoolSlug, id, dto);
  }

  @Post('domains/seed-default') @HttpCode(HttpStatus.OK)
  seedDefaultDomains(@Request() req: any) {
    return this.service.seedDefaultDomains(this.ctx(req).schoolSlug);
  }

  // ── Skills ─────────────────────────────────────────────────
  @Get('skills')
  getSkills(@Request() req: any, @Query('domainId') domainId?: string) {
    return this.service.getSkills(this.ctx(req).schoolSlug, domainId);
  }

  @Post('skills') @HttpCode(HttpStatus.CREATED)
  createSkill(@Request() req: any, @Body() dto: CreateSkillDto) {
    return this.service.createSkill(this.ctx(req).schoolSlug, dto);
  }

  @Patch('skills/:id')
  updateSkill(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.service.updateSkill(this.ctx(req).schoolSlug, id, dto);
  }

  // ── Indicators ─────────────────────────────────────────────
  @Get('indicators')
  getIndicators(@Request() req: any, @Query('skillId') skillId?: string) {
    return this.service.getIndicators(this.ctx(req).schoolSlug, skillId);
  }

  @Post('indicators') @HttpCode(HttpStatus.CREATED)
  createIndicator(@Request() req: any, @Body() dto: CreateIndicatorDto) {
    return this.service.createIndicator(this.ctx(req).schoolSlug, dto);
  }

  // ── Age Bands ──────────────────────────────────────────────
  @Get('age-bands')
  getAgeBands(@Request() req: any) {
    return this.service.getAgeBands(this.ctx(req).schoolSlug);
  }

  @Post('age-bands') @HttpCode(HttpStatus.CREATED)
  createAgeBand(@Request() req: any, @Body() dto: CreateAgeBandDto) {
    return this.service.createAgeBand(this.ctx(req).schoolSlug, dto);
  }

  // ── Observations ───────────────────────────────────────────
  @Get('observations')
  getObservations(@Request() req: any, @Query() query: ObservationQueryDto) {
    return this.service.getObservations(this.ctx(req).schoolSlug, query);
  }

  @Post('observations') @HttpCode(HttpStatus.CREATED)
  createObservation(@Request() req: any, @Body() dto: CreateObservationDto) {
    const { schoolSlug, academicYear, userId, userName } = this.ctx(req);
    return this.service.createObservation(schoolSlug, academicYear, userId, userName, dto);
  }

  @Post('observations/quick') @HttpCode(HttpStatus.CREATED)
  quickObserve(@Request() req: any, @Body() dto: QuickObserveDto) {
    const { schoolSlug, academicYear, userId, userName } = this.ctx(req);
    return this.service.quickObserve(schoolSlug, academicYear, userId, userName, dto);
  }

  // ── Development Profile ───────────────────────────────────
  @Get('students/:studentId/profile')
  getProfile(@Request() req: any, @Param('studentId') studentId: string) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.service.getProfile(schoolSlug, studentId, academicYear);
  }

  @Patch('students/:studentId/profile/tags')
  updateProfileTags(@Request() req: any, @Param('studentId') studentId: string, @Body() body: { interests?: string[]; schemas?: string[] }) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.service.updateProfileTags(schoolSlug, studentId, academicYear, body.interests, body.schemas);
  }

  // ── Portfolio ──────────────────────────────────────────────
  @Get('students/:studentId/portfolio')
  getPortfolio(@Request() req: any, @Param('studentId') studentId: string) {
    return this.service.getPortfolio(this.ctx(req).schoolSlug, studentId);
  }

  @Get('students/:studentId/learning-journey-pdf')
  async getLearningJourneyPdf(@Request() req: any, @Param('studentId') studentId: string, @Res() res: Response) {
    const { schoolSlug, academicYear } = this.ctx(req);
    const pdf = await this.service.generateLearningJourneyPdf(schoolSlug, studentId, academicYear);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="learning-journey-${studentId}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }

  @Post('portfolio') @HttpCode(HttpStatus.CREATED)
  createPortfolioEntry(@Request() req: any, @Body() dto: CreatePortfolioEntryDto) {
    return this.service.createPortfolioEntry(this.ctx(req).schoolSlug, dto);
  }

  @Patch('portfolio/:id/share')
  shareEntry(@Request() req: any, @Param('id') id: string, @Body('isVisibleToFamily') isVisibleToFamily: boolean) {
    return this.service.shareEntry(this.ctx(req).schoolSlug, id, isVisibleToFamily);
  }

  @Patch('portfolio/:id/respond')
  respondToEntry(@Request() req: any, @Param('id') id: string, @Body() dto: FamilyResponseDto) {
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

  @Put('weekly-plan') @HttpCode(HttpStatus.OK)
  upsertWeeklyPlan(@Request() req: any, @Body() dto: UpsertWeeklyPlanDto) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.upsertWeeklyPlan(schoolSlug, userName, dto);
  }

  // ── Dashboard ──────────────────────────────────────────────
  @Get('children')
  getChildren(@Request() req: any) {
    return this.service.getChildren(this.ctx(req).schoolSlug);
  }

  @Get('dashboard')
  getDashboard(@Request() req: any) {
    const { schoolSlug, userId } = this.ctx(req);
    return this.service.getTeacherDashboard(schoolSlug, userId);
  }
}
