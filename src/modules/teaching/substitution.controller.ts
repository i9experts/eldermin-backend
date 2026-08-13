import {
  Controller, Get, Post, Patch,
  Body, Param, Query, Request,
} from '@nestjs/common';
import { SubstitutionService } from './substitution.service';

@Controller('teaching/fixtures')
export class SubstitutionController {
  constructor(private readonly service: SubstitutionService) {}

  @Post('generate-for-absence')
  async generateForAbsence(@Body() dto: { teacherId: string; date: string; reason?: string; leaveApplicationId?: string }, @Request() req: any) {
    return this.service.generateFixturesForAbsence(
      req.user.tenantId, req.user.institutionId, dto.teacherId, dto.date,
      (dto.reason as any) || 'absence', dto.leaveApplicationId,
    );
  }

  @Get(':id/suggestions')
  async suggestSubstitutes(@Param('id') id: string, @Request() req: any) {
    return this.service.suggestSubstitutes(id, req.user.tenantId);
  }

  @Post(':id/assign')
  async assign(@Param('id') id: string, @Body() dto: { substituteTeacherId: string }, @Request() req: any) {
    return this.service.assignSubstitute(id, req.user.tenantId, dto.substituteTeacherId, req.user.name);
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @Request() req: any) {
    return this.service.cancelFixture(id, req.user.tenantId);
  }

  @Patch(':id/complete')
  async complete(@Param('id') id: string, @Request() req: any) {
    return this.service.completeFixture(id, req.user.tenantId);
  }

  @Get()
  async getFixtures(@Request() req: any, @Query() query: any) {
    return this.service.getFixtures(req.user.tenantId, query, req.user);
  }

  @Get('reports/lesson-shortfall')
  async getLessonShortfall(@Request() req: any, @Query() query: any) {
    return this.service.getLessonShortfall(req.user.tenantId, query);
  }

  @Get('reports/teacher-wise')
  async getTeacherWiseReport(@Request() req: any, @Query() query: any) {
    return this.service.getTeacherWiseReport(req.user.tenantId, query);
  }
}
