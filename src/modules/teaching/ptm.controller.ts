import {
  Controller, Get, Post, Patch,
  Body, Param, Query, Request,
} from '@nestjs/common';
import { PTMService } from './ptm.service';

@Controller('teaching/ptm')
export class PTMController {
  constructor(private readonly service: PTMService) {}

  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    return this.service.getDashboardStats(req.user.tenantId);
  }

  @Get()
  async getMeetings(@Request() req: any, @Query() query: any) {
    return this.service.getMeetings(req.user.tenantId, query, req.user);
  }

  @Get('upcoming/mine')
  async getMyUpcoming(@Query('teacherId') teacherId: string, @Request() req: any) {
    // Meetings are keyed by Staff._id - req.user's own staffId isn't
    // guaranteed to be on every JWT yet, so this accepts an explicit
    // teacherId query param for now rather than guessing.
    return this.service.getUpcomingForTeacher(teacherId, req.user.tenantId);
  }

  @Get('student/:studentId/history')
  async getStudentHistory(@Param('studentId') studentId: string, @Request() req: any) {
    return this.service.getStudentHistory(studentId, req.user.tenantId);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.service.getMeetingById(id, req.user.tenantId);
  }

  @Post()
  async create(@Body() dto: any, @Request() req: any) {
    return this.service.createMeeting(req.user.tenantId, req.user.institutionId, dto, req.user.name);
  }

  @Patch(':id/confirm')
  async confirm(@Param('id') id: string, @Request() req: any) {
    return this.service.confirmMeeting(id, req.user.tenantId);
  }

  @Patch(':id/reschedule')
  async reschedule(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.service.reschedule(id, req.user.tenantId, dto);
  }

  @Patch(':id/outcome')
  async recordOutcome(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.service.recordOutcome(id, req.user.tenantId, dto);
  }

  @Patch(':id/action-items/:actionItemId')
  async updateActionItem(
    @Param('id') id: string, @Param('actionItemId') actionItemId: string,
    @Body() dto: { status: 'pending' | 'done' }, @Request() req: any,
  ) {
    return this.service.updateActionItem(id, actionItemId, req.user.tenantId, dto.status);
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @Body() dto: { reason: string }, @Request() req: any) {
    return this.service.cancelMeeting(id, req.user.tenantId, dto.reason, req.user.name);
  }
}
