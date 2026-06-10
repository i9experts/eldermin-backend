import { Controller, Get, Post, Patch, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TeachingService } from './teaching.service';

@Controller('teaching')
@UseGuards(AuthGuard('jwt'))
export class TeachingController {
  constructor(private readonly teachingService: TeachingService) {}

  // ── DASHBOARD ─────────────────────────────────────────────────────────────────

  @Get('dashboard')
  getDashboard(@Request() req) { return this.teachingService.getDashboardStats(req.user.tenantId); }

  // ── TEACHER PROFILES ──────────────────────────────────────────────────────────

  @Post('teachers/sync')
  syncTeachers(@Request() req) { return this.teachingService.syncTeacherProfilesFromHR(req.user.tenantId, req.user.institutionId); }

  @Get('teachers/by-staff/:staffId')
  getByStaff(@Request() req, @Param('staffId') sid: string) { return this.teachingService.getTeacherProfileByStaffId(req.user.tenantId, sid); }

  @Get('teachers')
  getTeachers(@Request() req) { return this.teachingService.getTeacherProfiles(req.user.tenantId); }

  @Post('teachers')
  createTeacher(@Request() req, @Body() body: any) { return this.teachingService.createTeacherProfile(req.user.tenantId, req.user.institutionId, body); }

  @Patch('teachers/:id')
  updateTeacher(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateTeacherProfile(req.user.tenantId, id, body); }

  // ── LESSON PLANS ──────────────────────────────────────────────────────────────

  @Patch('lesson-plans/:id/approve')
  approvePlan(@Request() req, @Param('id') id: string, @Body() body: { notes: string }) { return this.teachingService.approveLessonPlan(req.user.tenantId, id, req.user.userId, body.notes); }

  @Patch('lesson-plans/:id/reject')
  rejectPlan(@Request() req, @Param('id') id: string, @Body() body: { reason: string }) { return this.teachingService.rejectLessonPlan(req.user.tenantId, id, body.reason); }

  @Get('lesson-plans')
  getLessonPlans(@Request() req, @Query() q: any) { return this.teachingService.getLessonPlans(req.user.tenantId, q); }

  @Post('lesson-plans')
  createLessonPlan(@Request() req, @Body() body: any) { return this.teachingService.createLessonPlan(req.user.tenantId, req.user.institutionId, body); }

  @Patch('lesson-plans/:id')
  updateLessonPlan(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateLessonPlan(req.user.tenantId, id, body); }

  // ── TIMETABLE ─────────────────────────────────────────────────────────────────

  @Get('timetable/teacher/:staffId')
  getTeacherTimetable(@Request() req, @Param('staffId') sid: string) { return this.teachingService.getTeacherTimetable(req.user.tenantId, sid); }

  @Get('timetable')
  getTimetables(@Request() req, @Query() q: any) { return this.teachingService.getTimetables(req.user.tenantId, q); }

  @Post('timetable')
  createTimetable(@Request() req, @Body() body: any) { return this.teachingService.createTimetable(req.user.tenantId, req.user.institutionId, body, req.user.userId); }

  @Patch('timetable/:id')
  updateTimetable(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateTimetable(req.user.tenantId, id, body); }

  // ── SYLLABUS ──────────────────────────────────────────────────────────────────

  @Patch('syllabus/:id/chapter/:index')
  updateChapter(@Request() req, @Param('id') id: string, @Param('index') idx: string, @Body() body: any) { return this.teachingService.updateChapterCoverage(req.user.tenantId, id, parseInt(idx), body); }

  @Get('syllabus')
  getSyllabus(@Request() req, @Query() q: any) { return this.teachingService.getSyllabusCoverage(req.user.tenantId, q); }

  @Post('syllabus')
  upsertSyllabus(@Request() req, @Body() body: any) { return this.teachingService.upsertSyllabusCoverage(req.user.tenantId, req.user.institutionId, body); }

  // ── ASSIGNMENTS ───────────────────────────────────────────────────────────────

  @Get('assignments')
  getAssignments(@Request() req, @Query() q: any) { return this.teachingService.getAssignments(req.user.tenantId, q); }

  @Post('assignments')
  createAssignment(@Request() req, @Body() body: any) { return this.teachingService.createAssignment(req.user.tenantId, req.user.institutionId, body); }

  @Patch('assignments/:id')
  updateAssignment(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateAssignment(req.user.tenantId, id, body); }

  // ── BEHAVIOUR NOTES ───────────────────────────────────────────────────────────

  @Get('behaviour')
  getBehaviour(@Request() req, @Query() q: any) { return this.teachingService.getBehaviourNotes(req.user.tenantId, q); }

  @Post('behaviour')
  createBehaviour(@Request() req, @Body() body: any) { return this.teachingService.createBehaviourNote(req.user.tenantId, req.user.institutionId, body); }

  @Patch('behaviour/:id')
  updateBehaviour(@Request() req, @Param('id') id: string, @Body() body: any) { return this.teachingService.updateBehaviourNote(req.user.tenantId, id, body); }
}
