// ============================================================
// ADMISSIONS CONTROLLER — REST API Endpoints
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  Query, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AdmissionsService } from './admissions.service';
import {
  CreateLeadDto, UpdateLeadDto, LeadQueryDto, ConvertLeadDto,
  CreateApplicantDto, UpdateApplicantDto, ApplicantQueryDto, UpdateDocumentDto,
  CreateEntranceTestDto, SubmitTestResultDto,
  CreateInterviewDto, SubmitInterviewResultDto,
  CreateEnrollmentDto, UpdateEnrollmentDto,
  CreateRetentionDto, UpdateRetentionDto,
} from './dto/admissions.dto';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { SchoolGuard } from '../auth/guards/school.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

// NOTE: Uncomment guards when auth is wired in.
// @UseGuards(JwtAuthGuard, SchoolGuard)
@Controller('admissions')
export class AdmissionsController {

  constructor(private readonly admissionsService: AdmissionsService) {}

  // ── Helper: extract school context from request ─────────────
  private getSchoolCtx(req: any) {
    // schoolSlug comes from JWT payload via SchoolGuard
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
    };
  }

  // ============================================================
  // DASHBOARD
  // ============================================================

  /** GET /api/admissions/dashboard */
  @Get('dashboard')
  async getDashboard(@Request() req: any, @Query('academicYear') academicYear?: string) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getDashboardStats(schoolSlug, academicYear);
  }

  // ============================================================
  // LEADS
  // ============================================================

  /** GET /api/admissions/leads */
  @Get('leads')
  async getLeads(@Request() req: any, @Query() query: LeadQueryDto) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getLeads(schoolSlug, query);
  }

  /** GET /api/admissions/leads/stats */
  @Get('leads/stats')
  async getLeadStats(@Request() req: any) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getLeadStats(schoolSlug);
  }

  /** GET /api/admissions/leads/:id */
  @Get('leads/:id')
  async getLeadById(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getLeadById(id, schoolSlug);
  }

  /** POST /api/admissions/leads */
  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  async createLead(@Body() dto: CreateLeadDto, @Request() req: any) {
    const { schoolSlug, academicYear } = this.getSchoolCtx(req);
    return this.admissionsService.createLead({ ...dto, schoolSlug, academicYear });
  }

  /** PUT /api/admissions/leads/:id */
  @Put('leads/:id')
  async updateLead(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.updateLead(id, schoolSlug, dto);
  }

  /** DELETE /api/admissions/leads/:id */
  @Delete('leads/:id')
  async deleteLead(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.deleteLead(id, schoolSlug);
  }

  /** POST /api/admissions/leads/:id/convert */
  @Post('leads/:id/convert')
  async convertLead(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.convertLead(id, schoolSlug, dto);
  }

  // ============================================================
  // APPLICANTS
  // ============================================================

  /** GET /api/admissions/applicants */
  @Get('applicants')
  async getApplicants(@Request() req: any, @Query() query: ApplicantQueryDto) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getApplicants(schoolSlug, query);
  }

  /** GET /api/admissions/applicants/:id */
  @Get('applicants/:id')
  async getApplicantById(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getApplicantById(id, schoolSlug);
  }

  /** POST /api/admissions/applicants */
  @Post('applicants')
  @HttpCode(HttpStatus.CREATED)
  async createApplicant(@Body() dto: CreateApplicantDto, @Request() req: any) {
    const { schoolSlug, academicYear } = this.getSchoolCtx(req);
    return this.admissionsService.createApplicant({ ...dto, schoolSlug, academicYear });
  }

  /** PUT /api/admissions/applicants/:id */
  @Put('applicants/:id')
  async updateApplicant(
    @Param('id') id: string,
    @Body() dto: UpdateApplicantDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.updateApplicant(id, schoolSlug, dto);
  }

  /** PATCH /api/admissions/applicants/:id/document */
  @Patch('applicants/:id/document')
  async updateDocument(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.updateDocumentStatus(id, schoolSlug, dto);
  }

  // ============================================================
  // ENTRANCE TESTS
  // ============================================================

  /** GET /api/admissions/tests */
  @Get('tests')
  async getTests(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getEntranceTests(schoolSlug, query);
  }

  /** POST /api/admissions/tests */
  @Post('tests')
  @HttpCode(HttpStatus.CREATED)
  async createTest(@Body() dto: CreateEntranceTestDto, @Request() req: any) {
    const { schoolSlug, academicYear } = this.getSchoolCtx(req);
    return this.admissionsService.createEntranceTest({ ...dto, schoolSlug, academicYear });
  }

  /** PATCH /api/admissions/tests/:id/result */
  @Patch('tests/:id/result')
  async submitTestResult(
    @Param('id') id: string,
    @Body() dto: SubmitTestResultDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.submitTestResult(id, schoolSlug, dto);
  }

  // ============================================================
  // INTERVIEWS
  // ============================================================

  /** GET /api/admissions/interviews */
  @Get('interviews')
  async getInterviews(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getInterviews(schoolSlug, query);
  }

  /** POST /api/admissions/interviews */
  @Post('interviews')
  @HttpCode(HttpStatus.CREATED)
  async createInterview(@Body() dto: CreateInterviewDto, @Request() req: any) {
    const { schoolSlug, academicYear } = this.getSchoolCtx(req);
    return this.admissionsService.createInterview({ ...dto, schoolSlug, academicYear });
  }

  /** PATCH /api/admissions/interviews/:id/result */
  @Patch('interviews/:id/result')
  async submitInterviewResult(
    @Param('id') id: string,
    @Body() dto: SubmitInterviewResultDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.submitInterviewResult(id, schoolSlug, dto);
  }

  // ============================================================
  // ENROLLMENT
  // ============================================================

  /** GET /api/admissions/enrollments */
  @Get('enrollments')
  async getEnrollments(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getEnrollments(schoolSlug, query);
  }

  /** POST /api/admissions/enrollments */
  @Post('enrollments')
  @HttpCode(HttpStatus.CREATED)
  async createEnrollment(@Body() dto: CreateEnrollmentDto, @Request() req: any) {
    const { schoolSlug, academicYear } = this.getSchoolCtx(req);
    return this.admissionsService.createEnrollment({ ...dto, schoolSlug, academicYear });
  }

  /** PUT /api/admissions/enrollments/:id */
  @Put('enrollments/:id')
  async updateEnrollment(
    @Param('id') id: string,
    @Body() dto: UpdateEnrollmentDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.updateEnrollment(id, schoolSlug, dto);
  }

  // ============================================================
  // RETENTION
  // ============================================================

  /** GET /api/admissions/retention */
  @Get('retention')
  async getRetention(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getRetentionRecords(schoolSlug, query);
  }

  /** POST /api/admissions/retention */
  @Post('retention')
  @HttpCode(HttpStatus.CREATED)
  async createRetention(@Body() dto: CreateRetentionDto, @Request() req: any) {
    const { schoolSlug, academicYear } = this.getSchoolCtx(req);
    return this.admissionsService.createRetention({ ...dto, schoolSlug, academicYear });
  }

  /** PUT /api/admissions/retention/:id */
  @Put('retention/:id')
  async updateRetention(
    @Param('id') id: string,
    @Body() dto: UpdateRetentionDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.updateRetention(id, schoolSlug, dto);
  }

  // ============================================================
  // REPORTS
  // ============================================================

  /** GET /api/admissions/reports */
  @Get('reports')
  async getReport(
    @Request() req: any,
    @Query('academicYear') academicYear: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { schoolSlug } = this.getSchoolCtx(req);
    return this.admissionsService.getAdmissionReport(schoolSlug, academicYear, from, to);
  }
}
