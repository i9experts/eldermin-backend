import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExamService } from './exam.service';

@Controller('teaching/exams')
@UseGuards(AuthGuard('jwt'))
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @Get()
  getExams(@Request() req, @Query() q: any) { return this.examService.getExams(req.user.tenantId, q); }

  @Post()
  createExam(@Request() req, @Body() body: any) { return this.examService.createExam(req.user.tenantId, req.user.institutionId, body, req.user.userId); }

  @Patch(':id')
  updateExam(@Request() req, @Param('id') id: string, @Body() body: any) { return this.examService.updateExam(req.user.tenantId, id, body); }

  @Delete(':id')
  deleteExam(@Request() req, @Param('id') id: string) { return this.examService.deleteExam(req.user.tenantId, id); }
}
