import {
  Controller, Get, Post, Param, Body, Query, Request, Res, HttpCode, HttpStatus, UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';

const CONSENT_ADMIN_ROLES = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.VICE_PRINCIPAL, UserRole.ADMIN, UserRole.ACADEMIC_COORDINATOR,
];
import { GuardianRefreshInterceptor } from './guardian-refresh.interceptor';
import { ParentPortalService } from './parent-portal.service';

@Controller('parent-portal')
@UseInterceptors(GuardianRefreshInterceptor)
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

  // ── Consent management (school side) ───────────────────────────
  @Roles(...CONSENT_ADMIN_ROLES)
  @Get('consent-requests')
  async listConsentRequests(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.listConsentRequests(schoolSlug);
  }

  @Roles(...CONSENT_ADMIN_ROLES)
  @Post('consent-requests')
  @HttpCode(HttpStatus.CREATED)
  async createConsentRequest(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, name } = this.ctx(req);
    return this.service.createConsentRequest(schoolSlug, name, dto);
  }

  @Roles(...CONSENT_ADMIN_ROLES)
  @Post('consent-requests/:id/close')
  @HttpCode(HttpStatus.OK)
  async closeConsentRequest(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.closeConsentRequest(schoolSlug, id);
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
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getCirculars(schoolSlug, requestingUser);
  }

  @Post('circulars/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgeCircular(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, requestingUser, name } = this.ctx(req);
    return this.service.acknowledgeCircular(id, requestingUser, schoolSlug, name);
  }

  @Get('events')
  async getEvents(@Request() req: any, @Query() query: any) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getEvents(schoolSlug, query, requestingUser);
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

  @Post('students/:studentId/homework/:assignmentId/submit')
  @HttpCode(HttpStatus.CREATED)
  async submitHomework(
    @Param('studentId') studentId: string, @Param('assignmentId') assignmentId: string,
    @Body() dto: { textResponse?: string; attachmentS3Keys?: string[] }, @Request() req: any,
  ) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.submitHomework(studentId, assignmentId, requestingUser, tenantId, schoolSlug, dto);
  }

  @Get('students/:studentId/class-diary')
  async getClassDiary(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getClassDiary(studentId, requestingUser, tenantId, schoolSlug);
  }

  @Get('students/:studentId/class-diary/:diaryId/pdf')
  async downloadClassDiaryPdf(
    @Param('studentId') studentId: string, @Param('diaryId') diaryId: string,
    @Request() req: any, @Res() res: Response,
  ) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    const pdf = await this.service.downloadClassDiaryPdf(studentId, diaryId, requestingUser, tenantId, schoolSlug);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="class-diary-${diaryId}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
  }

  @Get('students/:studentId/learning-resources')
  async getLearningResources(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getLearningResources(studentId, requestingUser, tenantId, schoolSlug);
  }

  // ── LMS: My Courses ─────────────────────────────────────────
  @Get('students/:studentId/courses')
  async getMyCourses(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getMyCourses(studentId, requestingUser, tenantId, schoolSlug);
  }

  @Post('students/:studentId/lessons/progress')
  @HttpCode(HttpStatus.OK)
  async markLessonProgress(
    @Param('studentId') studentId: string,
    @Body() dto: { syllabusId: string; unitNo: number; topicNo: number; lessonNo: number; status: string },
    @Request() req: any,
  ) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.markLessonProgress(studentId, requestingUser, tenantId, schoolSlug, dto);
  }

  // ── LMS Phase 2: self-paced online quizzes ─────────────────────
  @Get('students/:studentId/quizzes')
  async listMyQuizzes(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.listMyQuizzes(studentId, requestingUser, schoolSlug);
  }

  @Post('students/:studentId/quizzes/start')
  @HttpCode(HttpStatus.OK)
  async startQuiz(@Param('studentId') studentId: string, @Body() dto: { assessmentId: string; subject: string }, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.startQuiz(studentId, requestingUser, schoolSlug, dto);
  }

  @Post('students/:studentId/quizzes/:attemptId/submit')
  @HttpCode(HttpStatus.OK)
  async submitQuiz(
    @Param('studentId') studentId: string, @Param('attemptId') attemptId: string,
    @Body() dto: { answers: { questionId: string; selectedOptionIndex?: number; textAnswer?: string }[] },
    @Request() req: any,
  ) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.submitQuiz(studentId, requestingUser, schoolSlug, attemptId, dto.answers);
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

  @Get('students/:studentId/ptm/teachers')
  async getPTMTeachers(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getPTMTeachers(studentId, requestingUser, tenantId, schoolSlug);
  }

  @Post('students/:studentId/ptm')
  @HttpCode(HttpStatus.CREATED)
  async requestPTM(
    @Param('studentId') studentId: string,
    @Body() dto: { teacherId: string; scheduledDate: string; startTime?: string; endTime?: string; reason?: string },
    @Request() req: any,
  ) {
    const { requestingUser, tenantId, institutionId, schoolSlug, name } = this.ctx(req);
    return this.service.requestPTM(studentId, requestingUser, tenantId, institutionId, schoolSlug, name, dto);
  }

  @Post('students/:studentId/ptm/:meetingId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelPTM(@Param('studentId') studentId: string, @Param('meetingId') meetingId: string, @Request() req: any) {
    const { requestingUser, tenantId, name } = this.ctx(req);
    return this.service.cancelPTMRequest(studentId, meetingId, requestingUser, tenantId, name);
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

  // ── Notifications / Inbox ─────────────────────────────────────
  @Get('notifications')
  async getNotifications(@Request() req: any, @Query() query: any) {
    const { userId, schoolSlug } = this.ctx(req);
    return this.service.getNotifications(userId, schoolSlug, query);
  }

  @Post('notifications/:id/read')
  async markRead(@Param('id') id: string, @Request() req: any) {
    const { userId, schoolSlug } = this.ctx(req);
    return this.service.markNotificationRead(id, userId, schoolSlug);
  }

  @Post('notifications/read-all')
  async markAllRead(@Request() req: any) {
    const { userId, schoolSlug } = this.ctx(req);
    return this.service.markAllNotificationsRead(userId, schoolSlug);
  }

  // ── Messages ──────────────────────────────────────────────────
  @Get('threads')
  async getThreads(@Request() req: any) {
    const { userId, schoolSlug } = this.ctx(req);
    return this.service.getMyThreads(userId, schoolSlug);
  }

  @Post('threads')
  @HttpCode(HttpStatus.CREATED)
  async createThread(@Body() dto: any, @Request() req: any) {
    const { userId, name, requestingUser, schoolSlug } = this.ctx(req);
    return this.service.createThread(userId, name, schoolSlug, requestingUser, dto);
  }

  @Get('threads/:id/messages')
  async getThreadMessages(@Param('id') id: string, @Request() req: any) {
    const { userId, schoolSlug } = this.ctx(req);
    return this.service.getThreadMessages(id, userId, schoolSlug);
  }

  @Post('threads/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(@Param('id') id: string, @Body() dto: { body: string }, @Request() req: any) {
    const { userId, name, schoolSlug } = this.ctx(req);
    return this.service.sendMessage(id, userId, name, schoolSlug, dto.body);
  }
}
