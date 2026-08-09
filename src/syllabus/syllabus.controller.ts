import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SyllabusService } from './syllabus.service';
import {
  CreateSyllabusDto, UpdateSyllabusDto, MarkTopicDto, ApproveSyllabusDto, SyllabusQueryDto,
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

  @Get()
  findAll(@Request() req: any, @Query() query: SyllabusQueryDto) {
    return this.service.findAll(req.user.tenantId, query);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: any, @Body() dto: CreateSyllabusDto) {
    return this.service.create(req.user.tenantId, req.user.institutionId, req.user.userId, req.user.name, dto);
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

  @Patch(':id/behind-schedule')
  setBehindSchedule(@Request() req: any, @Param('id') id: string, @Body('behind') behind: boolean) {
    return this.service.setBehindSchedule(req.user.tenantId, id, behind);
  }
}
