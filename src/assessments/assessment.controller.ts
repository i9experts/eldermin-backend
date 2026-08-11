// ============================================================
// ASSESSMENT CONTROLLER — Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AssessmentService } from './assessment.service';
import {
  CreateAssessmentDto, UpdateAssessmentDto, AssessmentQueryDto,
  CreateQuestionDto, QuestionQueryDto,
  BulkMarkEntryDto, VerifyMarksDto, MarkQueryDto,
  GenerateReportCardsDto, UpdateReportCardRemarksDto,
  PublishResultDto, ReportCardQueryDto, ClassifyBloomsLevelDto,
  CreateExamPaperDto, UpdateExamPaperDto,
} from './dto/assessment.dto';

@Controller('assessments')
export class AssessmentController {
  constructor(private readonly service: AssessmentService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
    };
  }

  // ── Dashboard ─────────────────────────────────────────────────
  @Get('dashboard')
  async getDashboard(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug, ay);
  }

  // ── Assessments (static GET routes must precede :id) ──────────
  @Get()
  async findAll(@Request() req: any, @Query() query: AssessmentQueryDto) {
    const { schoolSlug } = this.ctx(req);
    return this.service.findAll(schoolSlug, query);
  }

  // ── Question Bank ─────────────────────────────────────────────
  @Get('questions/list')
  async getQuestions(@Request() req: any, @Query() query: QuestionQueryDto) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getQuestions(schoolSlug, query);
  }

  @Get('questions/stats')
  async getQuestionStats(
    @Request() req: any,
    @Query('subject') subject?: string,
    @Query('grade') grade?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getQuestionStats(schoolSlug, subject, grade);
  }

  // ── Mark Entry ────────────────────────────────────────────────
  @Get('marks/list')
  async getMarks(@Request() req: any, @Query() query: MarkQueryDto) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getMarks(schoolSlug, query);
  }

  @Get('marks/summary')
  async getMarkSheet(
    @Request() req: any,
    @Query('assessmentId') assessmentId: string,
    @Query('grade') grade: string,
    @Query('subject') subject: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getMarkSheetSummary(assessmentId, grade, subject, schoolSlug);
  }

  // ── Report Cards (static before :id) ─────────────────────────
  @Get('report-cards')
  async getReportCards(@Request() req: any, @Query() query: ReportCardQueryDto) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getReportCards(schoolSlug, query);
  }

  @Get('report-cards/:assessmentId/:studentId')
  async getStudentReportCard(
    @Param('assessmentId') assessmentId: string,
    @Param('studentId') studentId: string,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getStudentReportCard(assessmentId, studentId, schoolSlug);
  }

  @Post('report-cards/generate')
  async generateReportCards(@Body() dto: GenerateReportCardsDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.generateReportCards({ ...dto, schoolSlug });
  }

  @Patch('report-cards/:id/remarks')
  async updateRemarks(
    @Param('id') id: string,
    @Body() dto: UpdateReportCardRemarksDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateReportCardRemarks(id, schoolSlug, dto);
  }

  @Post('report-cards/publish')
  async publishResults(@Body() dto: PublishResultDto, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.publishResults({ ...dto, schoolSlug, publishedBy: userName });
  }

  // ── Analytics ─────────────────────────────────────────────────
  @Get('analytics/performance')
  async getAnalytics(
    @Request() req: any,
    @Query('academicYear') academicYear: string,
    @Query('grade') grade?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPerformanceAnalytics(schoolSlug, academicYear, grade);
  }

  // ── Dynamic :id (must come AFTER all static GET routes) ───────
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.findOne(id, schoolSlug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAssessmentDto, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.create({ ...dto, schoolSlug, createdBy: userName });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAssessmentDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.update(id, schoolSlug, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateStatus(id, schoolSlug, status);
  }

  @Post('questions')
  @HttpCode(HttpStatus.CREATED)
  async createQuestion(@Body() dto: CreateQuestionDto, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createQuestion({ ...dto, schoolSlug, addedBy: userName });
  }

  @Delete('questions/:id')
  async deleteQuestion(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteQuestion(id, schoolSlug);
  }

  @Post('questions/ai-classify-blooms') @HttpCode(HttpStatus.OK)
  async classifyBloomsLevel(@Body() dto: ClassifyBloomsLevelDto) {
    return this.service.classifyBloomsLevel(dto.questionText, dto.questionType, dto.options);
  }

  // ── Exam Papers ──────────────────────────────────────────────
  @Get('papers') async getExamPapers(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getExamPapers(schoolSlug, query);
  }

  @Get('papers/:id') async getExamPaperById(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getExamPaperById(id, schoolSlug);
  }

  @Post('papers') @HttpCode(HttpStatus.CREATED)
  async createExamPaper(@Body() dto: CreateExamPaperDto, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createExamPaper(schoolSlug, userName, dto);
  }

  @Put('papers/:id') async updateExamPaper(@Param('id') id: string, @Body() dto: UpdateExamPaperDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateExamPaper(id, schoolSlug, dto);
  }

  @Delete('papers/:id') async deleteExamPaper(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteExamPaper(id, schoolSlug);
  }

  @Get('papers/:id/pdf')
  async downloadExamPaperPdf(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const { schoolSlug } = this.ctx(req);
    const pdf = await this.service.generateExamPaperPdf(id, schoolSlug);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="exam-paper-${id}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).end(pdf);
  }

  @Post('marks/bulk')
  @HttpCode(HttpStatus.CREATED)
  async bulkEnterMarks(@Body() dto: BulkMarkEntryDto, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.bulkEnterMarks({ ...dto, schoolSlug, academicYear, enteredBy: userName });
  }

  @Patch('marks/verify')
  async verifyMarks(@Body() dto: VerifyMarksDto, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.verifyMarks({ ...dto, schoolSlug, verifiedBy: userName });
  }
}
