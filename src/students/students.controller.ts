// ============================================================
// STUDENTS CONTROLLER — REST API
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  Query, Request, HttpCode, HttpStatus, BadRequestException,
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
import { resolveClassSectionScope } from '../auth/scope.util';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
      requestingUser: req?.user,
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
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.studentsService.getStudents(schoolSlug, query, requestingUser);
  }

  /** GET /api/v1/students/filters/grades-sections */
  @Get('filters/grades-sections')
  async getDistinctGradesSections(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getDistinctGradesSections(schoolSlug);
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
    @Body() body: { rows: any[]; duplicateAction: 'skip' | 'update' | 'createAnyway'; campusId?: string },
    @Request() req: any,
  ) {
    const { schoolSlug, academicYear } = this.ctx(req);
    return this.studentsService.commitBulkImport(schoolSlug, academicYear, body.rows, body.duplicateAction, body.campusId);
  }


  // ============================================================
  // ENROLLMENT FIELDS (must stay above the :id routes below)
  // ============================================================

  /** GET /api/v1/students/enrollment-fields */
  @Get('enrollment-fields')
  async getEnrollmentFields(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getEnrollmentFields(schoolSlug);
  }

  /** POST /api/v1/students/enrollment-fields/seed-defaults */
  @Post('enrollment-fields/seed-defaults')
  async seedDefaultEnrollmentFields(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.seedDefaultEnrollmentFields(schoolSlug);
  }

  /** POST /api/v1/students/enrollment-fields */
  @Post('enrollment-fields')
  async createEnrollmentField(@Request() req: any, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.createEnrollmentField(schoolSlug, body);
  }

  /** PATCH /api/v1/students/enrollment-fields/:id */
  @Patch('enrollment-fields/:id')
  async updateEnrollmentField(@Param('id') id: string, @Request() req: any, @Body() body: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.updateEnrollmentField(schoolSlug, id, body);
  }

  /** DELETE /api/v1/students/enrollment-fields/:id */
  @Delete('enrollment-fields/:id')
  async deleteEnrollmentField(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.deleteEnrollmentField(schoolSlug, id);
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

  // ============================================================
  // MEDICAL RECORD — Health tab
  // ============================================================

  /** GET /api/v1/students/:id/medical */
  @Get(':id/medical')
  async getMedicalRecord(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getMedicalRecord(schoolSlug, id);
  }

  /** POST /api/v1/students/:id/medical */
  @Post(':id/medical')
  async upsertMedicalRecord(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.upsertMedicalRecord(schoolSlug, id, body);
  }

  // ============================================================
  // STUDENT NOTES — Notes tab
  // ============================================================

  /** GET /api/v1/students/:id/notes */
  @Get(':id/notes')
  async getStudentNotes(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getStudentNotes(schoolSlug, id);
  }

  /** POST /api/v1/students/:id/notes */
  @Post(':id/notes')
  async createStudentNote(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.studentsService.createStudentNote(schoolSlug, id, body, userName);
  }

  // ============================================================
  // STUDENT DOCUMENTS — Documents tab
  // ============================================================

  /** GET /api/v1/students/:id/documents */
  @Get(':id/documents')
  async getStudentDocuments(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getStudentDocuments(schoolSlug, id);
  }

  /** POST /api/v1/students/:id/documents */
  @Post(':id/documents')
  async createStudentDocument(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.studentsService.createStudentDocument(schoolSlug, id, body, userName);
  }

  // ============================================================
  // ACADEMIC HISTORY — History tab
  // ============================================================

  /** GET /api/v1/students/:id/academic-history */
  @Get(':id/academic-history')
  async getAcademicHistory(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getAcademicHistory(schoolSlug, id);
  }

  /** POST /api/v1/students/:id/academic-history */
  @Post(':id/academic-history')
  async createAcademicHistory(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.createAcademicHistory(schoolSlug, id, body);
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

  /** GET /api/v1/students/guardians/list */
  @Get('guardians/list')
  async getGuardians(@Query('studentId') studentId: string, @Query('search') search: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.getAllGuardians(schoolSlug, studentId, search);
  }

  /** POST /api/v1/students/guardians - requires studentId (guardians are
   * embedded on the real student they belong to, not a standalone record) */
  @Post('guardians')
  @HttpCode(HttpStatus.CREATED)
  async createGuardian(@Body() body: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    if (!body.studentId) throw new BadRequestException('studentId is required - a guardian must be linked to a real student');
    return this.studentsService.addGuardianToStudent(body.studentId, schoolSlug, body);
  }

  /** POST /api/v1/students/guardians/deduplicate - one-time cleanup for
   * duplicate guardian records created before the duplicate check was
   * added to addGuardianToStudent. Returns a summary of what was fixed. */
  @Post('guardians/deduplicate')
  async deduplicateGuardians(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.deduplicateGuardians(schoolSlug);
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

  /**
   * PATCH /api/v1/students/bulk-assign-campus
   * Backfill fix: students created via bulk CSV import never got a
   * campusId at all (only the Admissions -> Enrollment flow sets it),
   * which silently breaks any campus-scoped matching downstream (e.g.
   * Finance's Fee Structure -> student matching). Only touches students
   * missing a campusId, never overwrites an existing assignment.
   */
  @Patch('bulk-assign-campus')
  async bulkAssignCampus(
    @Body() dto: { campusId: string; grade?: string; section?: string },
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.bulkAssignCampus(schoolSlug, dto.campusId, dto.grade, dto.section);
  }

  /** PATCH /api/v1/students/bulk-status - suspend/withdraw/graduate/transfer
   * multiple students at once. The safe, reversible action for almost
   * every real case - keeps all history intact. */
  @Patch('bulk-status')
  async bulkUpdateStatus(
    @Body() dto: { studentIds: string[]; status: string; leftDate?: string; leftReason?: string },
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.bulkUpdateStatus(schoolSlug, dto.studentIds, dto.status, dto.leftDate, dto.leftReason);
  }

  /** DELETE /api/v1/students/:id - real hard delete, only for genuine
   * mistakes. Blocks itself if the student has any real recorded
   * activity - use bulk-status/status update for every other case. */
  @Delete(':id')
  async deleteStudent(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.studentsService.deleteStudent(id, schoolSlug);
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

  /** POST /api/v1/students/:id/profile-pdf */
  @Post(':id/profile-pdf')
  async generateProfilePdf(
    @Param('id') id: string,
    @Body('fields') fields: string[],
    @Body('institutionId') institutionId: string,
    @Request() req: any,
    @Res() res: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    const pdfBuffer = await this.studentsService.generateProfilePdf(id, schoolSlug, fields || [], institutionId || undefined);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="student-profile-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  /** POST /api/v1/students/reports/print-list */
  @Post('reports/print-list')
  async generateStudentListPdf(
    @Body() body: { grades?: string[]; sections?: string[]; statuses?: string[] },
    @Request() req: any,
    @Res() res: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    const pdfBuffer = await this.studentsService.generateStudentListPdf(schoolSlug, {
      grades: body.grades, sections: body.sections, statuses: body.statuses,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="student-list-report.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  /** POST /api/v1/students/reports/gr-register */
  @Post('reports/gr-register')
  async generateGrRegisterPdf(
    @Body() body: { grades?: string[]; sections?: string[]; campusId?: string; institutionId?: string },
    @Request() req: any,
    @Res() res: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    const pdfBuffer = await this.studentsService.generateGrRegisterPdf(schoolSlug, {
      grades: body.grades, sections: body.sections, campusId: body.campusId, institutionId: body.institutionId,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="gr-register.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  // ============================================================
  // ATTENDANCE
  // ============================================================

  /** GET /api/v1/students/attendance */
  @Get('attendance/list')
  async getAttendance(@Request() req: any, @Query() query: AttendanceQueryDto) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    const { grade, section } = resolveClassSectionScope(requestingUser, query.grade, query.section);
    return this.studentsService.getAttendance(schoolSlug, { ...query, grade, section });
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
    const { schoolSlug, academicYear, userName, requestingUser } = this.ctx(req);
    resolveClassSectionScope(requestingUser, dto.grade, dto.section);
    return this.studentsService.markAttendance({
      ...dto, schoolSlug, academicYear, markedBy: userName,
    });
  }

  /** POST /api/v1/students/attendance/bulk */
  @Post('attendance/bulk')
  @HttpCode(HttpStatus.CREATED)
  async bulkMarkAttendance(@Body() dto: BulkAttendanceDto, @Request() req: any) {
    const { schoolSlug, academicYear, requestingUser } = this.ctx(req);
    // Every record checked individually - a class teacher scoped to
    // Grade 3-Girls shouldn't be able to sneak a Grade 5-A record into
    // an otherwise-legitimate bulk request for their own class.
    for (const record of dto.records) {
      resolveClassSectionScope(requestingUser, record.grade, record.section);
    }
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
