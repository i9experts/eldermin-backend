import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExamService } from './exam.service';
import { RequireModuleAccess } from '../../roles/decorators/require-module-access.decorator';

// Exam scheduling - surfaced to teachers as part of the Timetable tab.
@Controller('teaching/exams')
@UseGuards(AuthGuard('jwt'))
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @RequireModuleAccess('teaching', 'timetable', 'view')
  @Get()
  getExams(@Request() req, @Query() q: any) { return this.examService.getExams(req.user.tenantId, q); }

  @RequireModuleAccess('teaching', 'timetable', 'manage')
  @Post()
  createExam(@Request() req, @Body() body: any) { return this.examService.createExam(req.user.tenantId, req.user.institutionId, body, req.user.userId); }

  @RequireModuleAccess('teaching', 'timetable', 'manage')
  @Patch(':id')
  updateExam(@Request() req, @Param('id') id: string, @Body() body: any) { return this.examService.updateExam(req.user.tenantId, id, body); }

  @RequireModuleAccess('teaching', 'timetable', 'manage')
  @Delete(':id')
  deleteExam(@Request() req, @Param('id') id: string) { return this.examService.deleteExam(req.user.tenantId, id); }
}
