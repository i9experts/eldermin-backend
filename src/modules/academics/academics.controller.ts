import {
  Controller, Get, Post, Patch, Body,
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
    return this.academicsService.getSubjects(req.user.tenantId, q);
  }

  @Post('subjects/seed-defaults')
  seedSubjects(@Request() req) {
    return this.academicsService.seedDefaultSubjects(req.user.tenantId, req.user.institutionId);
  }

  @Post('subjects')
  createSubject(@Request() req, @Body() body: any) {
    return this.academicsService.createSubject(req.user.tenantId, req.user.institutionId, body);
  }

  @Patch('subjects/:id')
  updateSubject(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.academicsService.updateSubject(req.user.tenantId, id, body);
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

  // ─── SYLLABUS ─────────────────────────────────────────────────────────────────

  @Get('syllabus')
  getSyllabi(@Request() req, @Query() q: any) {
    return this.academicsService.getSyllabi(req.user.tenantId, q);
  }

  @Post('syllabus')
  createSyllabus(@Request() req, @Body() body: any) {
    return this.academicsService.createSyllabus(
      req.user.tenantId, req.user.institutionId, body, req.user.userId,
    );
  }

  @Get('syllabus/:id')
  getSyllabusById(@Request() req, @Param('id') id: string) {
    return this.academicsService.getSyllabusById(req.user.tenantId, id);
  }

  @Patch('syllabus/:id')
  updateSyllabus(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.academicsService.updateSyllabus(req.user.tenantId, id, body);
  }

  @Post('syllabus/:id/unit')
  addUnit(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.academicsService.addUnit(req.user.tenantId, id, body);
  }

  @Patch('syllabus/:id/approve')
  approveSyllabus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { approverName: string },
  ) {
    return this.academicsService.approveSyllabus(
      req.user.tenantId, id, body.approverName ?? req.user.email,
    );
  }

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
    return this.academicsService.getBooks(req.user.tenantId, q);
  }

  @Post('library/books')
  createBook(@Request() req, @Body() body: any) {
    return this.academicsService.createBook(req.user.tenantId, req.user.institutionId, body);
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
    return this.academicsService.getIssues(req.user.tenantId, q);
  }

  @Get('library/overdue')
  getOverdue(@Request() req) {
    return this.academicsService.getOverdueIssues(req.user.tenantId);
  }

  @Post('library/issue')
  issueBook(@Request() req, @Body() body: any) {
    return this.academicsService.issueBook(
      req.user.tenantId, req.user.institutionId, body, req.user.userId,
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
