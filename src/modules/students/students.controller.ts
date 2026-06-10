import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StudentsService } from './students.service';

@Controller('students')
@UseGuards(AuthGuard('jwt'))
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('dashboard')
  getDashboard(@Request() req) { return this.studentsService.getDashboardStats(req.user.tenantId); }

  @Get()
  getStudents(@Request() req, @Query() query: any) { return this.studentsService.getStudents(req.user.tenantId, query); }

  @Get('guardians/list')
  getGuardians(@Request() req, @Query('studentId') studentId: string) { return this.studentsService.getGuardians(req.user.tenantId, studentId); }

  @Post('guardians')
  createGuardian(@Request() req, @Body() body: any) { return this.studentsService.createGuardian(req.user.tenantId, req.user.institutionId, body); }

  @Post('attendance/bulk')
  markAttendance(@Request() req, @Body() body: { records: any[] }) { return this.studentsService.markAttendance(req.user.tenantId, body.records); }

  @Get('attendance/list')
  getAttendance(@Request() req, @Query() query: any) { return this.studentsService.getAttendance(req.user.tenantId, query); }

  @Get('enrollment-fields')
  getEnrollmentFields(@Request() req) {
    return this.studentsService.getEnrollmentFields(req.user.tenantId);
  }

  @Post('enrollment-fields/seed-defaults')
  seedDefaultFields(@Request() req) {
    return this.studentsService.seedDefaultEnrollmentFields(req.user.tenantId, req.user.institutionId);
  }

  @Post('enrollment-fields')
  createEnrollmentField(@Request() req, @Body() body: any) {
    return this.studentsService.createEnrollmentField(req.user.tenantId, req.user.institutionId, body);
  }

  @Patch('enrollment-fields/:id')
  updateEnrollmentField(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.studentsService.updateEnrollmentField(req.user.tenantId, id, body);
  }

  @Delete('enrollment-fields/:id')
  deleteEnrollmentField(@Request() req, @Param('id') id: string) {
    return this.studentsService.deleteEnrollmentField(req.user.tenantId, id);
  }

  @Post()
  createStudent(@Request() req, @Body() body: any) { return this.studentsService.createStudent(req.user.tenantId, req.user.institutionId, req.user.campusId, body); }

  @Get(':id')
  getStudent(@Request() req, @Param('id') id: string) { return this.studentsService.getStudentById(req.user.tenantId, id); }

  @Patch(':id')
  updateStudent(@Request() req, @Param('id') id: string, @Body() body: any) { return this.studentsService.updateStudent(req.user.tenantId, id, body); }

  @Get(':id/medical')
  getMedical(@Request() req, @Param('id') id: string) { return this.studentsService.getMedicalRecord(req.user.tenantId, id); }

  @Post(':id/medical')
  upsertMedical(@Request() req, @Param('id') id: string, @Body() body: any) { return this.studentsService.upsertMedicalRecord(req.user.tenantId, id, body); }

  @Get(':id/notes')
  getNotes(@Request() req, @Param('id') id: string) { return this.studentsService.getStudentNotes(req.user.tenantId, id); }

  @Post(':id/notes')
  createNote(@Request() req, @Param('id') id: string, @Body() body: any) {
    const user = req.user;
    return this.studentsService.createStudentNote(user.tenantId, user.institutionId, id, body, user.userId, body.createdByName || 'Staff');
  }

  @Get(':id/documents')
  getDocuments(@Request() req, @Param('id') id: string) { return this.studentsService.getStudentDocuments(req.user.tenantId, id); }

  @Post(':id/documents')
  createDocument(@Request() req, @Param('id') id: string, @Body() body: any) { return this.studentsService.createStudentDocument(req.user.tenantId, id, body, req.user.userId); }

  @Get(':id/academic-history')
  getHistory(@Request() req, @Param('id') id: string) { return this.studentsService.getAcademicHistory(req.user.tenantId, id); }

  @Post(':id/academic-history')
  createHistory(@Request() req, @Param('id') id: string, @Body() body: any) { return this.studentsService.createAcademicHistory(req.user.tenantId, id, body); }
}
