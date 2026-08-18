import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SyllabusService } from './syllabus.service';
import {
  CreateSyllabusDto, UpdateSyllabusDto, MarkTopicDto, MarkSubTopicDto, ApproveSyllabusDto, CreateSloTemplateDto, SyllabusQueryDto,
} from './dto/syllabus.dto';

@Controller('syllabus')
export class SyllabusController {
  constructor(private readonly service: SyllabusService) {}

  @Get('dashboard')
  getDashboard(@Request() req: any, @Query('academicYear') academicYear?: string) {
    return this.service.getDashboard(req.user.tenantId, academicYear);
  }

  @Get('report/coverage')
  getCoverageReport(@Request() req: any, @Query() query: SyllabusQueryDto) {
    return this.service.getCoverageReport(req.user.tenantId, query);
  }

  /** GET /api/v1/syllabus/weekly-planner?teacherId=... - a teacher's real
   * "what am I teaching this week" view across every subject/class they're
   * assigned to, computed against the school's actual academic calendar. */
  @Get('weekly-planner')
  getTeacherWeeklyPlanner(@Request() req: any, @Query('teacherId') teacherId: string) {
    return this.service.getTeacherWeeklyPlanner(req.user.tenantId, req.user.schoolSlug, teacherId);
  }

  /** SLO Templates - reusable, sourced curriculum content applied to
   * *start* a new syllabus, never auto-applied silently. */
  @Get('slo-templates')
  listSloTemplates(@Request() req: any, @Query('subjectName') subjectName?: string, @Query('gradeLevel') gradeLevel?: string, @Query('framework') framework?: string) {
    return this.service.listSloTemplates(req.user.schoolSlug, subjectName, gradeLevel, framework);
  }

  @Get('slo-templates/:id')
  getSloTemplate(@Request() req: any, @Param('id') id: string) {
    return this.service.getSloTemplate(req.user.schoolSlug, id);
  }

  @Post('slo-templates')
  createSloTemplate(@Request() req: any, @Body() dto: CreateSloTemplateDto) {
    return this.service.createSloTemplate(req.user.schoolSlug, dto);
  }

  @Put('slo-templates/:id')
  updateSloTemplate(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreateSloTemplateDto>) {
    return this.service.updateSloTemplate(req.user.schoolSlug, id, dto);
  }

  @Delete('slo-templates/:id')
  deleteSloTemplate(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteSloTemplate(req.user.schoolSlug, id);
  }

  /** Real, mathematical week distribution of existing topics/sub-topics
   * across the term's actual available weeks - never invents content. */
  @Post(':id/generate-pacing-guide')
  generatePacingGuide(@Request() req: any, @Param('id') id: string) {
    return this.service.generatePacingGuide(req.user.tenantId, id);
  }

  /** AI-recommended assessment breakdown - a real recommendation, never
   * auto-applied, the coordinator reviews and can override before saving. */
  @Get('recommend-assessment-breakdown')
  recommendAssessmentBreakdown(@Query('subjectName') subjectName: string, @Query('gradeLevel') gradeLevel: string, @Query('framework') framework: string) {
    return this.service.recommendAssessmentBreakdown(subjectName, gradeLevel, framework);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: SyllabusQueryDto) {
    return this.service.findAll(req.user.tenantId, query, req.user);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: any, @Body() dto: CreateSyllabusDto) {
    return this.service.create(req.user.tenantId, req.user.institutionId, req.user.userId, req.user.name, dto, req.user);
  }

  @Put(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateSyllabusDto) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.tenantId, id);
  }

  @Patch(':id/approve')
  approve(@Request() req: any, @Param('id') id: string, @Body() dto: ApproveSyllabusDto) {
    return this.service.approve(req.user.tenantId, id, dto.approverName);
  }

  @Patch(':id/mark-topic')
  markTopic(@Request() req: any, @Param('id') id: string, @Body() dto: MarkTopicDto) {
    return this.service.markTopic(req.user.tenantId, id, dto);
  }

  @Patch(':id/mark-sub-topic')
  markSubTopic(@Request() req: any, @Param('id') id: string, @Body() dto: MarkSubTopicDto) {
    return this.service.markSubTopic(req.user.tenantId, id, dto);
  }

  @Patch(':id/behind-schedule')
  setBehindSchedule(@Request() req: any, @Param('id') id: string, @Body('behind') behind: boolean) {
    return this.service.setBehindSchedule(req.user.tenantId, id, behind);
  }
}
