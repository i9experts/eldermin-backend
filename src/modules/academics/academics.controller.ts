import {
  Controller, Get, Post, Patch, Delete, Body,
  Param, Query, Request, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AcademicsService } from './academics.service';

@Controller('academics')
@UseGuards(AuthGuard('jwt'))
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  // ─── DASHBOARD ────────────────────────────────────────────────────────────────

  @Get('dashboard')
  getDashboard(@Request() req) {
    return this.academicsService.getDashboardStats(req.user.tenantId);
  }

  // ─── SUBJECTS ─────────────────────────────────────────────────────────────────

  @Get('subjects')
  getSubjects(@Request() req, @Query() q: any) {
    return this.academicsService.getSubjects(req.user.tenantId, q, req.user);
  }

  @Post('subjects/seed-defaults')
  seedSubjects(@Request() req) {
    return this.academicsService.seedDefaultSubjects(req.user.tenantId, req.user.institutionId);
  }

  @Post('subjects')
  createSubject(@Request() req, @Body() body: any) {
    return this.academicsService.createSubject(req.user.tenantId, req.user.institutionId, body, req.user);
  }

  @Patch('subjects/:id')
  updateSubject(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.academicsService.updateSubject(req.user.tenantId, id, body, req.user);
  }

  @Delete('subjects/:id')
  deleteSubject(@Request() req, @Param('id') id: string) {
    return this.academicsService.deleteSubject(req.user.tenantId, id);
  }

  @Post('subjects/assign-to-class')
  assignSubjectsToClass(@Request() req, @Body() body: any) {
    return this.academicsService.assignSubjectsToClass(
      req.user.tenantId, body.subjectIds || [], body.gradeLevel, body.sectionName, req.user,
    );
  }

  // ─── SUBJECT GROUPS ───────────────────────────────────────────────────────────

  @Get('subject-groups')
  getSubjectGroups(@Request() req, @Query() q: any) {
    return this.academicsService.getSubjectGroups(req.user.tenantId, q, req.user);
  }

  @Post('subject-groups')
  createSubjectGroup(@Request() req, @Body() body: any) {
    return this.academicsService.createSubjectGroup(req.user.tenantId, req.user.institutionId, body, req.user.userId, req.user);
  }

  @Patch('subject-groups/:id')
  updateSubjectGroup(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.academicsService.updateSubjectGroup(req.user.tenantId, id, body, req.user);
  }

  @Delete('subject-groups/:id')
  deleteSubjectGroup(@Request() req, @Param('id') id: string) {
    return this.academicsService.deleteSubjectGroup(req.user.tenantId, id);
  }

  @Post('subject-groups/:id/assign')
  assignSubjectGroupToClass(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.academicsService.assignSubjectGroupToClass(req.user.tenantId, id, body, req.user);
  }

  // ─── CURRICULUM ───────────────────────────────────────────────────────────────

  @Get('curriculum')
  getCurricula(@Request() req, @Query() q: any) {
    return this.academicsService.getCurricula(req.user.tenantId, q);
  }

  @Post('curriculum')
  createCurriculum(@Request() req, @Body() body: any) {
    return this.academicsService.createCurriculum(
      req.user.tenantId, req.user.institutionId, body, req.user.userId,
    );
  }

  @Get('curriculum/:id')
  getCurriculumById(@Request() req, @Param('id') id: string) {
    return this.academicsService.getCurriculumById(req.user.tenantId, id);
  }

  @Patch('curriculum/:id')
  updateCurriculum(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.academicsService.updateCurriculum(req.user.tenantId, id, body);
  }

  @Post('curriculum/:id/slo')
  addSLO(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.academicsService.addSLO(req.user.tenantId, id, body);
  }

  // Syllabus endpoints have moved to the new unified /syllabus module -
  // the frontend now calls that directly instead of /academics/syllabus.

  // ─── LIBRARY — BOOKS ──────────────────────────────────────────────────────────

  @Get('library/stats')
  getLibraryStats(@Request() req) {
    return this.academicsService.getLibraryStats(req.user.tenantId);
  }

  @Get('library/search')
  searchBooks(@Request() req, @Query('q') q: string) {
    return this.academicsService.searchBooks(req.user.tenantId, q);
  }

  @Get('library/books')
  getBooks(@Request() req, @Query() q: any) {
    return this.academicsService.getBooks(req.user.tenantId, q, req.user);
  }

  @Post('library/books')
  createBook(@Request() req, @Body() body: any) {
    return this.academicsService.createBook(req.user.tenantId, req.user.institutionId, body, req.user);
  }

  @Get('library/books/:id')
  getBookById(@Request() req, @Param('id') id: string) {
    return this.academicsService.getBookById(req.user.tenantId, id);
  }

  @Patch('library/books/:id')
  updateBook(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.academicsService.updateBook(req.user.tenantId, id, body);
  }

  // ─── LIBRARY — ISSUES ─────────────────────────────────────────────────────────

  @Get('library/issues')
  getIssues(@Request() req, @Query() q: any) {
    return this.academicsService.getIssues(req.user.tenantId, q, req.user);
  }

  @Get('library/overdue')
  getOverdue(@Request() req) {
    return this.academicsService.getOverdueIssues(req.user.tenantId);
  }

  @Post('library/issue')
  issueBook(@Request() req, @Body() body: any) {
    return this.academicsService.issueBook(
      req.user.tenantId, req.user.institutionId, body, req.user.userId, req.user,
    );
  }

  @Patch('library/return/:issueId')
  returnBook(@Request() req, @Param('issueId') id: string, @Body() body: any) {
    return this.academicsService.returnBook(
      req.user.tenantId, id, body, req.user.userId,
    );
  }

  @Patch('library/issues/:id/fine-paid')
  markFinePaid(@Request() req, @Param('id') id: string) {
    return this.academicsService.markFinePaid(req.user.tenantId, id);
  }
}
