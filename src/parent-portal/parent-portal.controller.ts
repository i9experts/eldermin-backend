import {
  Controller, Get, Post, Param, Body, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ParentPortalService } from './parent-portal.service';

@Controller('parent-portal')
export class ParentPortalController {
  constructor(private readonly service: ParentPortalService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      tenantId: req?.user?.tenantId,
      institutionId: req?.user?.institutionId,
      requestingUser: req?.user,
      userId: req?.user?.userId,
      name: req?.user?.name || 'Parent',
    };
  }

  @Post('link-guardian')
  @HttpCode(HttpStatus.CREATED)
  async linkGuardian(@Body() dto: { email: string; studentIds: string[] }, @Request() req: any) {
    const { schoolSlug, tenantId, institutionId } = this.ctx(req);
    return this.service.linkGuardianToStudents(schoolSlug, tenantId, institutionId, dto.email, dto.studentIds);
  }

  @Post('unlink-guardian')
  async unlinkGuardian(@Body() dto: { email: string; studentId: string }, @Request() req: any) {
    const { tenantId } = this.ctx(req);
    return this.service.unlinkGuardianFromStudent(tenantId, dto.email, dto.studentId);
  }

  @Get('my-students')
  async getMyStudents(@Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getMyStudents(requestingUser, schoolSlug);
  }

  @Get('circulars')
  async getCirculars(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getCirculars(schoolSlug);
  }

  @Get('events')
  async getEvents(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getEvents(schoolSlug, query);
  }

  @Get('students/:studentId/profile')
  async getProfile(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getStudentProfile(studentId, requestingUser, schoolSlug);
  }

  @Get('students/:studentId/medical')
  async getMedical(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getMedical(studentId, requestingUser, schoolSlug);
  }

  @Get('students/:studentId/documents')
  async getDocuments(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getAcademicDocuments(studentId, requestingUser, schoolSlug);
  }

  @Get('students/:studentId/attendance')
  async getAttendance(@Param('studentId') studentId: string, @Request() req: any, @Query() query: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getAttendance(studentId, requestingUser, schoolSlug, query);
  }

  @Get('students/:studentId/homework')
  async getHomework(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getHomework(studentId, requestingUser, tenantId, schoolSlug);
  }

  @Get('students/:studentId/results')
  async getResults(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getResults(studentId, requestingUser, schoolSlug);
  }

  @Get('students/:studentId/dues')
  async getDues(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getDues(studentId, requestingUser, schoolSlug);
  }

  @Get('students/:studentId/behaviour')
  async getBehaviour(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getBehaviourAndTarbiyah(studentId, requestingUser, schoolSlug);
  }

  @Get('students/:studentId/timetable')
  async getTimetable(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getTimetable(studentId, requestingUser, tenantId, schoolSlug);
  }

  @Get('students/:studentId/datesheet')
  async getDatesheet(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getDatesheet(studentId, requestingUser, schoolSlug);
  }

  @Get('students/:studentId/library')
  async getLibrary(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId } = this.ctx(req);
    return this.service.getLibrary(studentId, requestingUser, tenantId);
  }

  @Get('students/:studentId/ptm')
  async getPTM(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId } = this.ctx(req);
    return this.service.getPTMHistory(studentId, requestingUser, tenantId);
  }

  @Get('students/:studentId/consent')
  async getConsent(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getConsentRequests(studentId, requestingUser, schoolSlug);
  }

  @Post('students/:studentId/consent/:consentRequestId/respond')
  async respondToConsent(
    @Param('studentId') studentId: string, @Param('consentRequestId') consentRequestId: string,
    @Body() dto: { decision: 'granted' | 'declined'; notes?: string }, @Request() req: any,
  ) {
    const { requestingUser, userId, name, schoolSlug } = this.ctx(req);
    return this.service.respondToConsent(consentRequestId, studentId, requestingUser, userId, schoolSlug, dto.decision, name, dto.notes);
  }

  @Get('students/:studentId/leaves')
  async getLeaves(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getStudentLeaves(studentId, requestingUser, schoolSlug);
  }

  @Post('students/:studentId/leaves')
  @HttpCode(HttpStatus.CREATED)
  async createLeave(@Param('studentId') studentId: string, @Body() dto: any, @Request() req: any) {
    const { requestingUser, userId, name, schoolSlug } = this.ctx(req);
    return this.service.createStudentLeave(studentId, requestingUser, userId, name, schoolSlug, dto);
  }
}
