import {
  Controller, Get, Post, Delete, Param, Body, Query, Request, Res, HttpCode, HttpStatus, UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles, AllowNonStaff } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';
import { STUDENTS_WRITE_ROLES, NON_STAFF_ROLES } from '../auth/admin-role-sets';
import { assertStudentAccess } from '../auth/scope.util';

const CONSENT_ADMIN_ROLES = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.VICE_PRINCIPAL, UserRole.ADMIN, UserRole.ACADEMIC_COORDINATOR,
];
// Every role except parent/student/reseller. Only used as the method-level @Roles on the two link/unlink routes so they override the
// class-level PARENT default (RolesGuard reads the handler's roles first); the real decision there stays with RolesOrModuleManage.
export const PARENT_PORTAL_STAFF_ROLES: UserRole[] = Object.values(UserRole).filter((r) => !NON_STAFF_ROLES.includes(r));
import { GuardianRefreshInterceptor } from './guardian-refresh.interceptor';
import { ParentPortalService } from './parent-portal.service';
import { HomeTasksService } from '../home-tasks/home-tasks.service';
import { CompleteHomeTaskDto } from '../home-tasks/dto/home-task.dto';

// The Parent app's API. Opens NonStaffGuard only; the staff-only handlers below keep their own
// @Roles / @RolesOrModuleManage, and student routes rely on assertStudentAccess in the service.
@AllowNonStaff()
// Parent-only by default: every route below needs the parent role, and (for student routes) a guardian link to that student, checked in the
// service with assertStudentAccess. The five school-side routes (consent-requests x3, link-guardian, unlink-guardian) carry their own method-level
// @Roles, which replaces this class-level default. Student, reseller and every staff token are refused on the parent routes.
@Roles(UserRole.PARENT)
@Controller('parent-portal')
@UseInterceptors(GuardianRefreshInterceptor)
export class ParentPortalController {
  constructor(
    private readonly service: ParentPortalService,
    private readonly homeTasksService: HomeTasksService,
  ) {}

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
  @Get('consent-requests/:id/results')
  async getConsentRequestResults(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getConsentRequestResults(schoolSlug, id);
  }

  @Roles(...CONSENT_ADMIN_ROLES)
  @Post('consent-requests/:id/close')
  @HttpCode(HttpStatus.OK)
  async closeConsentRequest(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.closeConsentRequest(schoolSlug, id);
  }

  // Staff with students:write only (no web / parent-app / teacher-app caller
  // exists). Parent and student tokens can never pass, even with a custom role.
  @Roles(...PARENT_PORTAL_STAFF_ROLES)
  @RolesOrModuleManage('students', STUDENTS_WRITE_ROLES, { level: 'manage', allowModuleWide: true })
  @Post('link-guardian')
  @HttpCode(HttpStatus.CREATED)
  async linkGuardian(@Body() dto: { email: string; studentIds: string[] }, @Request() req: any) {
    const { schoolSlug, tenantId, institutionId } = this.ctx(req);
    return this.service.linkGuardianToStudents(schoolSlug, tenantId, institutionId, dto.email, dto.studentIds);
  }

  @Roles(...PARENT_PORTAL_STAFF_ROLES)
  @RolesOrModuleManage('students', STUDENTS_WRITE_ROLES, { level: 'manage', allowModuleWide: true })
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

  @Post('device-ping')
  @HttpCode(HttpStatus.OK)
  async pingDevice(@Body() dto: { deviceId: string; platform: string; appVersion?: string }, @Request() req: any) {
    const { userId, tenantId } = this.ctx(req);
    return this.service.recordDevicePing(userId, tenantId, dto);
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
    // Ownership first: the feature-suspended answer below must not be readable for a child that is not this parent's.
    assertStudentAccess(requestingUser, studentId);
    const access = await this.service.checkFeatureSuspended(schoolSlug, requestingUser, studentId, 'school_diary');
    if (access.suspended) {
      res.status(HttpStatus.OK).json({ suspended: true, feature: 'school_diary', reason: access.reason || null });
      return;
    }
    const pdf = await this.service.downloadClassDiaryPdf(studentId, diaryId, requestingUser, tenantId, schoolSlug);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="class-diary-${diaryId}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
  }

  @Get('students/:studentId/learning-resources')
  async getLearningResources(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getLearningResources(studentId, requestingUser, tenantId, schoolSlug);
  }

  // ── LMS Phase 0: "My Learning" hub (courses + assignments + quizzes +
  // certificates, combined) ────────────────────────────────────
  @Get('students/:studentId/my-learning')
  async getMyLearning(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getMyLearning(studentId, requestingUser, tenantId, schoolSlug);
  }

  // ── LMS: My Courses ─────────────────────────────────────────
  @Get('students/:studentId/courses')
  async getMyCourses(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getMyCourses(studentId, requestingUser, tenantId, schoolSlug);
  }

  // ── LMS Phase 4: course discussion forum ─────────────────────
  @Get('students/:studentId/courses/:syllabusId/forum/threads')
  async listCourseForumThreads(@Param('studentId') studentId: string, @Param('syllabusId') syllabusId: string, @Request() req: any) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.listCourseForumThreads(studentId, requestingUser, tenantId, schoolSlug, syllabusId);
  }

  @Get('students/:studentId/courses/:syllabusId/forum/threads/:threadId')
  async getCourseForumThread(
    @Param('studentId') studentId: string, @Param('syllabusId') syllabusId: string, @Param('threadId') threadId: string, @Request() req: any,
  ) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.getCourseForumThread(studentId, requestingUser, tenantId, schoolSlug, syllabusId, threadId);
  }

  @Post('students/:studentId/courses/:syllabusId/forum/threads')
  @HttpCode(HttpStatus.CREATED)
  async createCourseForumThread(
    @Param('studentId') studentId: string, @Param('syllabusId') syllabusId: string, @Body() dto: { title: string; body: string }, @Request() req: any,
  ) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.createCourseForumThread(studentId, requestingUser, tenantId, schoolSlug, syllabusId, dto);
  }

  @Post('students/:studentId/courses/:syllabusId/forum/threads/:threadId/replies')
  @HttpCode(HttpStatus.CREATED)
  async createCourseForumReply(
    @Param('studentId') studentId: string, @Param('syllabusId') syllabusId: string, @Param('threadId') threadId: string,
    @Body() dto: { body: string }, @Request() req: any,
  ) {
    const { requestingUser, tenantId, schoolSlug } = this.ctx(req);
    return this.service.createCourseForumReply(studentId, requestingUser, tenantId, schoolSlug, syllabusId, threadId, dto);
  }

  @Delete('students/:studentId/forum/threads/:threadId')
  async deleteCourseForumThread(@Param('studentId') studentId: string, @Param('threadId') threadId: string, @Request() req: any) {
    const { requestingUser, tenantId } = this.ctx(req);
    return this.service.deleteCourseForumThread(studentId, requestingUser, tenantId, threadId);
  }

  @Delete('students/:studentId/forum/replies/:replyId')
  async deleteCourseForumReply(@Param('studentId') studentId: string, @Param('replyId') replyId: string, @Request() req: any) {
    const { requestingUser, tenantId } = this.ctx(req);
    return this.service.deleteCourseForumReply(studentId, requestingUser, tenantId, replyId);
  }

  // ── LMS Phase 5: gamification ─────────────────────────────────
  @Get('students/:studentId/gamification/summary')
  async getMyGamificationSummary(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getMyGamificationSummary(studentId, requestingUser, schoolSlug);
  }

  @Get('students/:studentId/gamification/leaderboard')
  async getMyClassLeaderboard(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getMyClassLeaderboard(studentId, requestingUser, schoolSlug);
  }

  // ── Qaida/Nazra home recitation log (reference only) ──────────
  @Get('students/:studentId/qaida-nazra/home-log')
  async getMyHomeRecitationLog(
    @Param('studentId') studentId: string, @Query('program') program: string | undefined, @Request() req: any,
  ) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.getMyHomeRecitationLog(studentId, requestingUser, schoolSlug, program);
  }

  @Post('students/:studentId/qaida-nazra/home-log')
  @HttpCode(HttpStatus.CREATED)
  async logMyHomeRecitationEntry(@Param('studentId') studentId: string, @Body() dto: any, @Request() req: any) {
    const { requestingUser, schoolSlug, name } = this.ctx(req);
    return this.service.logMyHomeRecitationEntry(studentId, requestingUser, schoolSlug, name, dto);
  }

  @Delete('students/:studentId/qaida-nazra/home-log/:entryId')
  async deleteMyHomeRecitationEntry(@Param('entryId') entryId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.service.deleteMyHomeRecitationEntry(entryId, requestingUser, schoolSlug);
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

  // ── Home Tasks (Tarbiyah-at-home) ──────────────────────────────
  @Get('students/:studentId/home-tasks')
  async getHomeTasks(@Param('studentId') studentId: string, @Request() req: any) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.homeTasksService.getTasksForStudent(studentId, requestingUser, schoolSlug);
  }

  @Post('students/:studentId/home-tasks/:taskId/complete')
  async completeHomeTask(
    @Param('studentId') studentId: string, @Param('taskId') taskId: string,
    @Body() dto: CompleteHomeTaskDto, @Request() req: any,
  ) {
    const { requestingUser, schoolSlug } = this.ctx(req);
    return this.homeTasksService.completeTask(studentId, taskId, requestingUser, schoolSlug, dto);
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
