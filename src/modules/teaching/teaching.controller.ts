import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { TeachingService } from './teaching.service';
import { CreateAssignmentDto, UpdateAssignmentDto, GradeSubmissionDto } from './dto/assignment.dto';
import { STAFF_WRITE_ROLES, TEACHING_ADMIN_ROLES } from '../../auth/role-sets';
import { RolesOrModuleManage } from '../../roles/decorators/roles-or-module-manage.decorator';

@Controller('teaching')
@UseGuards(AuthGuard('jwt'))
export class TeachingController {
  constructor(private readonly teachingService: TeachingService) {}

  // ── DASHBOARD ─────────────────────────────────────────────────────────────────

  @Get('dashboard')
  getDashboard(@Request() req) { return this.teachingService.getDashboardStats(req.user.tenantId, req.user); }

  // ── TEACHER PROFILES ──────────────────────────────────────────────────────────

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Post('teachers/sync')
  syncTeachers(@Request() req) { return this.teachingService.syncTeacherProfilesFromHR(req.user.tenantId, req.user.institutionId); }

  @Get('teachers/by-staff/:staffId')
  getByStaff(@Request() req, @Param('staffId') sid: string) { return this.teachingService.getTeacherProfileByStaffId(req.user.tenantId, sid); }

  @Get('teachers')
  getTeachers(@Request() req) { return this.teachingService.getTeacherProfiles(req.user.tenantId, req.user); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Post('teachers')
  createTeacher(@Request() req, @Body() body: any) { return this.teachingService.createTeacherProfile(req.user.tenantId, req.user.institutionId, body); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Patch('teachers/:id')
  updateTeacher(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateTeacherProfile(req.user.tenantId, id, body); }

  /** DELETE /api/v1/teaching/teachers/:id - removes the teaching-config
   * profile only. teacherId across lesson plans, homework, PTM, timetable,
   * and syllabi all reference the underlying Staff record directly, not
   * this profile's own id, so nothing else is orphaned by this. */
  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Delete('teachers/:id')
  deleteTeacher(@Request() req, @Param('id') id: string) { return this.teachingService.deleteTeacherProfile(req.user.tenantId, id); }

  // ── LESSON PLANS ──────────────────────────────────────────────────────────────

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Patch('lesson-plans/:id/approve')
  approvePlan(@Request() req, @Param('id') id: string, @Body() body: { notes: string }) { return this.teachingService.approveLessonPlan(req.user.tenantId, id, req.user.userId, body.notes); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Patch('lesson-plans/:id/reject')
  rejectPlan(@Request() req, @Param('id') id: string, @Body() body: { reason: string }) { return this.teachingService.rejectLessonPlan(req.user.tenantId, id, body.reason); }

  @Get('lesson-plans')
  getLessonPlans(@Request() req, @Query() q: any) { return this.teachingService.getLessonPlans(req.user.tenantId, q, req.user); }

  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('lesson-plans')
  createLessonPlan(@Request() req, @Body() body: any) { return this.teachingService.createLessonPlan(req.user.tenantId, req.user.institutionId, body, req.user); }

  /** POST /api/v1/teaching/lesson-plans/parse-upload - a teacher's own
   * pre-made lesson plan (Word/Excel/txt file, or a "sourceUrl" Google
   * Doc link in the same multipart body) parsed into a draft that
   * pre-fills the Create Lesson Plan form. Never saves a lesson plan
   * itself - the teacher reviews/edits the draft and submits it through
   * the normal createLessonPlan flow above. */
  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('lesson-plans/parse-upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  parseLessonPlanUpload(@UploadedFile() file: any, @Body('sourceUrl') sourceUrl?: string) {
    if (!file && !sourceUrl?.trim()) throw new BadRequestException('Upload a file or paste a Google Doc link.');
    return this.teachingService.parseLessonPlanUpload(file, sourceUrl);
  }

  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('lesson-plans/:id')
  updateLessonPlan(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateLessonPlan(req.user.tenantId, id, body); }

  // ── TIMETABLE ─────────────────────────────────────────────────────────────────

  @Get('timetable/teacher/:staffId')
  getTeacherTimetable(@Request() req, @Param('staffId') sid: string) { return this.teachingService.getTeacherTimetable(req.user.tenantId, sid); }

  @Get('timetable')
  getTimetables(@Request() req, @Query() q: any) { return this.teachingService.getTimetables(req.user.tenantId, q, req.user); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Post('timetable')
  createTimetable(@Request() req, @Body() body: any) { return this.teachingService.createTimetable(req.user.tenantId, req.user.institutionId, body, req.user.userId); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Patch('timetable/:id')
  updateTimetable(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateTimetable(req.user.tenantId, id, body); }

  /** DELETE /api/v1/teaching/timetable/:id - hard-deletes a draft/archived
   * timetable. Refuses to delete an 'active' one (see
   * TeachingService.deleteTimetable) so an admin can't yank the schedule
   * currently being relied on out from under a school without first
   * demoting it to draft via the status toggle. */
  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Delete('timetable/:id')
  deleteTimetable(@Request() req, @Param('id') id: string) { return this.teachingService.deleteTimetable(req.user.tenantId, id); }

  @Get('timetable/:id/pdf')
  async downloadTimetablePdf(@Request() req, @Param('id') id: string, @Query('templateId') templateId: string, @Query('week') week: string, @Res() res: Response) {
    const weekFilter = week === 'A' || week === 'B' ? week : undefined;
    const pdf = await this.teachingService.generateTimetablePdf(req.user.tenantId, req.user.schoolSlug, id, req.user.userId, templateId || undefined, weekFilter);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="timetable-${id}.pdf"`, 'Content-Length': pdf.length });
    res.end(pdf);
  }

  // ── ELECTIVE / CROSS-CLASS GROUPS ───────────────────────────────────────────────

  @Get('electives')
  getElectiveGroups(@Request() req, @Query() q: any) { return this.teachingService.getElectiveGroups(req.user.tenantId, q); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Post('electives')
  createElectiveGroup(@Request() req, @Body() body: any) { return this.teachingService.createElectiveGroup(req.user.tenantId, req.user.institutionId, body, req.user.userId); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Patch('electives/:id')
  updateElectiveGroup(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateElectiveGroup(req.user.tenantId, id, body); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Delete('electives/:id')
  deleteElectiveGroup(@Request() req, @Param('id') id: string) { return this.teachingService.deleteElectiveGroup(req.user.tenantId, id); }

  // ── DUTY ROSTER ──────────────────────────────────────────────────────────────────

  @Get('duty-roster')
  getDutyRoster(@Request() req, @Query() q: any) { return this.teachingService.getDutyRoster(req.user.tenantId, q); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Post('duty-roster')
  createDutyRoster(@Request() req, @Body() body: any) { return this.teachingService.createDutyRoster(req.user.tenantId, req.user.institutionId, body, req.user.userId); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Patch('duty-roster/:id')
  updateDutyRoster(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateDutyRoster(req.user.tenantId, id, body); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Delete('duty-roster/:id')
  deleteDutyRoster(@Request() req, @Param('id') id: string) { return this.teachingService.deleteDutyRoster(req.user.tenantId, id); }

  // ── ROOMS ──────────────────────────────────────────────────────────────────────

  @Get('rooms')
  getRooms(@Request() req, @Query('campusId') campusId?: string) { return this.teachingService.getRooms(req.user.tenantId, campusId, req.user); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Post('rooms')
  createRoom(@Request() req, @Body() body: any) { return this.teachingService.createRoom(req.user.tenantId, req.user.institutionId, body); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Patch('rooms/:id')
  updateRoom(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateRoom(req.user.tenantId, id, body); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Delete('rooms/:id')
  deleteRoom(@Request() req, @Param('id') id: string) { return this.teachingService.deleteRoom(req.user.tenantId, id); }

  // ── PERIOD TEMPLATES ───────────────────────────────────────────────────────────

  @Get('period-templates')
  getPeriodTemplates(@Request() req) { return this.teachingService.getPeriodTemplates(req.user.tenantId, req.user); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Post('period-templates')
  createPeriodTemplate(@Request() req, @Body() body: any) { return this.teachingService.createPeriodTemplate(req.user.tenantId, req.user.institutionId, body); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Post('period-templates/seed-default')
  seedDefaultPeriodTemplate(@Request() req) { return this.teachingService.seedDefaultPeriodTemplate(req.user.tenantId, req.user.institutionId); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Patch('period-templates/:id')
  updatePeriodTemplate(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updatePeriodTemplate(req.user.tenantId, id, body); }

  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES)
  @Delete('period-templates/:id')
  deletePeriodTemplate(@Request() req, @Param('id') id: string) { return this.teachingService.deletePeriodTemplate(req.user.tenantId, id); }

  // Syllabus tracking endpoints have moved to the new unified /syllabus
  // module - the frontend now calls that directly.

  // ── ASSIGNMENTS ───────────────────────────────────────────────────────────────

  @Get('assignments')
  getAssignments(@Request() req, @Query() q: any) { return this.teachingService.getAssignments(req.user.tenantId, q, req.user); }

  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('assignments')
  createAssignment(@Request() req, @Body() body: CreateAssignmentDto) { return this.teachingService.createAssignment(req.user.tenantId, req.user.institutionId, body, req.user); }

  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('assignments/:id')
  updateAssignment(@Request() req, @Param('id') id: string, @Body() body: UpdateAssignmentDto) { return this.teachingService.updateAssignment(req.user.tenantId, id, body, req.user); }

  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Delete('assignments/:id')
  deleteAssignment(@Request() req, @Param('id') id: string) { return this.teachingService.deleteAssignment(req.user.tenantId, id); }

  @Get('assignments/:id/submissions')
  getSubmissions(@Request() req, @Param('id') id: string) { return this.teachingService.getSubmissionsForAssignment(req.user.tenantId, id, req.user); }

  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('assignments/:id/submissions/:submissionId')
  gradeSubmission(@Request() req, @Param('id') id: string, @Param('submissionId') submissionId: string, @Body() body: GradeSubmissionDto) {
    return this.teachingService.gradeSubmission(req.user.tenantId, id, submissionId, body, req.user);
  }

  // ── BEHAVIOUR NOTES ───────────────────────────────────────────────────────────

  @Get('behaviour')
  getBehaviour(@Request() req, @Query() q: any) { return this.teachingService.getBehaviourNotes(req.user.tenantId, q, req.user); }

  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('behaviour')
  createBehaviour(@Request() req, @Body() body: any) { return this.teachingService.createBehaviourNote(req.user.tenantId, req.user.institutionId, body, req.user); }

  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('behaviour/:id')
  updateBehaviour(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateBehaviourNote(req.user.tenantId, id, body); }
}
