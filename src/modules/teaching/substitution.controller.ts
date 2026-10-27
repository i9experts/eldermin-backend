import {
  Controller, Get, Post, Patch,
  Body, Param, Query, Request,
} from '@nestjs/common';
import { SubstitutionService } from './substitution.service';
import { STAFF_WRITE_ROLES } from '../../auth/role-sets';
import { RolesOrModuleManage } from '../../roles/decorators/roles-or-module-manage.decorator';
import { RequireModuleAccess } from '../../roles/decorators/require-module-access.decorator';

@Controller('teaching/fixtures')
export class SubstitutionController {
  constructor(private readonly service: SubstitutionService) {}

  @RequireModuleAccess('teaching', 'fixtures', 'manage')
  @Post('generate-for-absence')
  async generateForAbsence(@Body() dto: { teacherId: string; date: string; reason?: string; leaveApplicationId?: string }, @Request() req: any) {
    return this.service.generateFixturesForAbsence(
      req.user.tenantId, req.user.institutionId, dto.teacherId, dto.date,
      (dto.reason as any) || 'absence', dto.leaveApplicationId,
    );
  }

  @RequireModuleAccess('teaching', 'fixtures', 'view')
  @Get(':id/suggestions')
  async suggestSubstitutes(@Param('id') id: string, @Request() req: any) {
    return this.service.suggestSubstitutes(id, req.user.tenantId);
  }

  @RequireModuleAccess('teaching', 'fixtures', 'manage')
  @Post(':id/assign')
  async assign(@Param('id') id: string, @Body() dto: { substituteTeacherId: string }, @Request() req: any) {
    return this.service.assignSubstitute(id, req.user.tenantId, dto.substituteTeacherId, req.user.name);
  }

  @RequireModuleAccess('teaching', 'fixtures', 'manage')
  @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @Request() req: any) {
    return this.service.cancelFixture(id, req.user.tenantId);
  }

  @RequireModuleAccess('teaching', 'fixtures', 'manage')
  @RolesOrModuleManage('teaching', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch(':id/complete')
  async complete(@Param('id') id: string, @Request() req: any) {
    return this.service.completeFixture(id, req.user.tenantId, req.user);
  }

  @RequireModuleAccess('teaching', 'fixtures', 'view')
  @Get()
  async getFixtures(@Request() req: any, @Query() query: any) {
    return this.service.getFixtures(req.user.tenantId, query, req.user);
  }

  @RequireModuleAccess('teaching', 'fixtures', 'view')
  @Get('reports/lesson-shortfall')
  async getLessonShortfall(@Request() req: any, @Query() query: any) {
    return this.service.getLessonShortfall(req.user.tenantId, query);
  }

  @RequireModuleAccess('teaching', 'fixtures', 'view')
  @Get('reports/teacher-wise')
  async getTeacherWiseReport(@Request() req: any, @Query() query: any) {
    return this.service.getTeacherWiseReport(req.user.tenantId, query);
  }
}
