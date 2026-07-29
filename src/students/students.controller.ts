// ============================================================
// STUDENTS CONTROLLER — REST API
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Patch, Body, Param,
  Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CreateStudentDto, UpdateStudentDto, StudentQueryDto,
  MarkAttendanceDto, BulkAttendanceDto, AttendanceQueryDto,
  CreateFeeDto, CollectFeeDto, FeeQueryDto,
  CreateBehaviourDto, UpdateBehaviourDto, BehaviourQueryDto,
  CreateAssessmentResultDto,
} from './dto/student.dto';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
    };
  }

  // ============================================================
  // DASHBOARD
  // ============================================================

  /** GET /api/v1/students/dashboard */
  @Get('dashboard')
  async getDashboard(@Request() req: any, @Query('academicYear') academicYear?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getDashboardStats(schoolSlug, academicYear);
  }

  // ============================================================
  // STUDENTS
  // ============================================================

  /** GET /api/v1/students */
  @Get()
  async getStudents(@Request() req: any, @Query() query: StudentQueryDto) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getStudents(schoolSlug, query);
  }

  // ============================================================
  // BULK IMPORT
  // ============================================================

  /** GET /api/v1/students/bulk-import/template */
  @Get('bulk-import/template')
  async getBulkImportTemplate(@Res() res: any) {
    const csv = this.studentsService.generateImportTemplate();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="student-import-template.csv"');
    res.send(csv);
  }

  /** POST /api/v1/students/bulk-import/preview */
  @Post('bulk-import/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewBulkImport(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.previewBulkImport(schoolSlug, file);
  }

  /** POST /api/v1/students/bulk-import/commit */
  @Post('bulk-import/commit')
  @HttpCode(HttpStatus.CREATED)
  async commitBulkImport(
    @Body() body: { rows: any[]; duplicateAction: 'skip' | 'update' | 'createAnyway' },
    @Request() req: any,
  ) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.studentsService.commitBulkImport(schoolSlug, academicYear, body.rows, body.duplicateAction);
  }


  /** GET /api/v1/students/:id */
  @Get(':id')
  async getStudent(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getStudentById(id, schoolSlug);
  }

  /** GET /api/v1/students/:id/360 */
  @Get(':id/360')
  async getStudent360(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getStudent360(id, schoolSlug);
  }

  /** POST /api/v1/students */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createStudent(@Body() dto: CreateStudentDto, @Request() req: any) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.studentsService.createStudent({
      ...dto, schoolSlug,
      currentAcademicYear: dto.currentAcademicYear || academicYear,
    });
  }

  /** PUT /api/v1/students/:id */
  @Put(':id')
  async updateStudent(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.updateStudent(id, schoolSlug, dto);
  }

  /** POST /api/v1/students/:id/photo */
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() photo: Express.Multer.File,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.uploadPhoto(id, schoolSlug, photo);
  }

  // ============================================================
  // ATTENDANCE
  // ============================================================

  /** GET /api/v1/students/attendance */
  @Get('attendance/list')
  async getAttendance(@Request() req: any, @Query() query: AttendanceQueryDto) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getAttendance(schoolSlug, query);
  }

  /** GET /api/v1/students/:id/attendance/summary */
  @Get(':id/attendance/summary')
  async getAttendanceSummary(
    @Param('id') id: string,
    @Request() req: any,
    @Query('month') month?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getStudentAttendanceSummary(id, schoolSlug, month);
  }

  /** POST /api/v1/students/attendance */
  @Post('attendance')
  @HttpCode(HttpStatus.CREATED)
  async markAttendance(@Body() dto: MarkAttendanceDto, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.studentsService.markAttendance({
      ...dto, schoolSlug, academicYear, markedBy: userName,
    });
  }

  /** POST /api/v1/students/attendance/bulk */
  @Post('attendance/bulk')
  @HttpCode(HttpStatus.CREATED)
  async bulkMarkAttendance(@Body() dto: BulkAttendanceDto, @Request() req: any) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.studentsService.bulkMarkAttendance({ ...dto, schoolSlug, academicYear });
  }

  // ============================================================
  // FEE MANAGEMENT
  // ============================================================

  /** GET /api/v1/students/fees */
  @Get('fees/list')
  async getFees(@Request() req: any, @Query() query: FeeQueryDto) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getFees(schoolSlug, query);
  }

  /** GET /api/v1/students/:id/fees/statement */
  @Get(':id/fees/statement')
  async getFeeStatement(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getFeeStatement(id, schoolSlug);
  }

  /** POST /api/v1/students/fees */
  @Post('fees')
  @HttpCode(HttpStatus.CREATED)
  async createFee(@Body() dto: CreateFeeDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.createFee({ ...dto, schoolSlug });
  }

  /** PATCH /api/v1/students/fees/:id/collect */
  @Patch('fees/:id/collect')
  async collectFee(
    @Param('id') id: string,
    @Body() dto: CollectFeeDto,
    @Request() req: any,
  ) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.studentsService.collectFee(id, schoolSlug, {
      ...dto, collectedBy: dto.collectedBy || userName,
    });
  }

  // ============================================================
  // BEHAVIOUR
  // ============================================================

  /** GET /api/v1/students/behaviour */
  @Get('behaviour/list')
  async getBehaviour(@Request() req: any, @Query() query: BehaviourQueryDto) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getBehaviour(schoolSlug, query);
  }

  /** GET /api/v1/students/:id/behaviour */
  @Get(':id/behaviour')
  async getStudentBehaviour(
    @Param('id') id: string,
    @Request() req: any,
    @Query() query: BehaviourQueryDto,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getBehaviour(schoolSlug, { ...query, studentId: id });
  }

  /** POST /api/v1/students/behaviour */
  @Post('behaviour')
  @HttpCode(HttpStatus.CREATED)
  async createBehaviour(@Body() dto: CreateBehaviourDto, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.studentsService.createBehaviour({
      ...dto, schoolSlug, academicYear, reportedBy: dto.reportedBy || userName,
    });
  }

  /** PUT /api/v1/students/behaviour/:id */
  @Put('behaviour/:id')
  async updateBehaviour(
    @Param('id') id: string,
    @Body() dto: UpdateBehaviourDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.updateBehaviour(id, schoolSlug, dto);
  }

  // ============================================================
  // ASSESSMENT RESULTS
  // ============================================================

  /** GET /api/v1/students/results */
  @Get('results/list')
  async getResults(
    @Request() req: any,
    @Query('studentId') studentId?: string,
    @Query('grade') grade?: string,
    @Query('type') type?: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getResults(schoolSlug, studentId, grade, type);
  }

  /** GET /api/v1/students/:id/results */
  @Get(':id/results')
  async getStudentResults(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getResults(schoolSlug, id);
  }

  /** POST /api/v1/students/results */
  @Post('results')
  @HttpCode(HttpStatus.CREATED)
  async createResult(@Body() dto: CreateAssessmentResultDto, @Request() req: any) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.studentsService.createResult({ ...dto, schoolSlug, academicYear });
  }

  // ============================================================
  // CLASS REPORT
  // ============================================================

  /** GET /api/v1/students/report/class */
  @Get('report/class')
  async getClassReport(
    @Request() req: any,
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('academicYear') academicYear: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getClassReport(schoolSlug, grade, section, academicYear);
  }

}
