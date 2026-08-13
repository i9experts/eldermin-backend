// ============================================================
// BEHAVIOUR & TARBIYAH CONTROLLER + MODULE
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { BehaviourService } from './behaviour.service';
import { TARBIYAH_TRAITS } from './schemas/behaviour.schema';

// ── CONTROLLER ────────────────────────────────────────────────
@Controller('behaviour')
export class BehaviourController {
  constructor(private readonly service: BehaviourService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
      requestingUser: req?.user,
    };
  }

  // ── Dashboard ────────────────────────────────────────────────
  @Get('dashboard')
  async getDashboard(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug, ay);
  }

  // ── Tarbiyah Traits List (static) ────────────────────────────
  @Get('tarbiyah-traits')
  getTarbiyahTraits() {
    return { traits: TARBIYAH_TRAITS };
  }

  // ── Behaviour Records ─────────────────────────────────────────
  @Get('records')
  async getRecords(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getRecords(schoolSlug, query, requestingUser);
  }

  @Get('records/:id')
  async getRecord(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getRecordById(id, schoolSlug);
  }

  @Post('records')
  @HttpCode(HttpStatus.CREATED)
  async createRecord(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName, requestingUser } = this.ctx(req);
    return this.service.createRecord({
      ...dto, schoolSlug,
      academicYear: dto.academicYear || academicYear,
      reportedBy: dto.reportedBy || userName,
    }, requestingUser);
  }

  @Put('records/:id')
  async updateRecord(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateRecord(id, schoolSlug, dto);
  }

  @Patch('records/:id/resolve')
  async resolveRecord(
    @Param('id') id: string,
    @Body() dto: { note: string },
    @Request() req: any,
  ) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.resolveRecord(id, schoolSlug, dto.note, userName);
  }

  @Get('students/:studentId/profile')
  async getStudentProfile(
    @Param('studentId') studentId: string,
    @Request() req: any,
    @Query('academicYear') ay?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getStudentBehaviourProfile(studentId, schoolSlug, ay);
  }

  // ── Tarbiyah Assessments ──────────────────────────────────────
  @Get('tarbiyah')
  async getTarbiyah(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getTarbiyahAssessments(schoolSlug, query, requestingUser);
  }

  @Get('tarbiyah/analytics')
  async getTarbiyahAnalytics(
    @Request() req: any,
    @Query('grade') grade?: string,
    @Query('period') period?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getTarbiyahTraitAnalytics(schoolSlug, grade, period);
  }

  @Post('tarbiyah')
  @HttpCode(HttpStatus.CREATED)
  async createTarbiyah(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName, requestingUser } = this.ctx(req);
    return this.service.createTarbiyahAssessment(schoolSlug, {
      ...dto, schoolSlug,
      academicYear: dto.academicYear || academicYear,
      assessedBy: dto.assessedBy || userName,
    }, requestingUser);
  }

  @Get('character-settings')
  async getCharacterSettings(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCharacterSettings(schoolSlug);
  }

  @Put('character-settings')
  async updateCharacterSettings(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCharacterSettings(schoolSlug, dto);
  }

  @Put('tarbiyah/:id')
  async updateTarbiyah(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateTarbiyahAssessment(id, schoolSlug, dto);
  }

  // ── Counselling ───────────────────────────────────────────────
  @Get('counselling')
  async getCounselling(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getCounsellingSessions(schoolSlug, query, requestingUser);
  }

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

  @Put('counselling/:id')
  async updateCounselling(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateCounsellingSession(id, schoolSlug, dto);
  }

  @Patch('counselling/:id/complete')
  async completeCounselling(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.completeCounsellingSession(id, schoolSlug, dto);
  }

  // ── Interventions ─────────────────────────────────────────────
  @Get('interventions')
  async getInterventions(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getInterventions(schoolSlug, query, requestingUser);
  }

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

  @Put('interventions/:id')
  async updateIntervention(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateIntervention(id, schoolSlug, dto);
  }

  @Post('interventions/:id/progress')
  async addProgress(@Param('id') id: string, @Body() dto: { note: string }, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.addProgressNote(id, schoolSlug, dto.note, userName);
  }

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
  @Get('contracts')
  async getContracts(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getContracts(schoolSlug, query, requestingUser);
  }

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
