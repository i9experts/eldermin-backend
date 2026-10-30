// ============================================================
// QAIDA/NAZRA EXTRAS CONTROLLER — settings, invigilator assessments,
// home recitation log (staff/teacher side)
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Patch, Body, Param, Query, Request, UseGuards,
} from '@nestjs/common';
import { QaidaNazraExtrasService } from './qaida-nazra-extras.service';
import {
  RecordInvigilatorAssessmentsDto, UpdateQaidaNazraSettingsDto,
} from './dto/qaida-nazra-extras.dto';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';
import { BehaviourStaffOnlyGuard } from './guards/behaviour-staff-only.guard';

// Same guard as QaidaController/NazraController - parent/student/reseller
// tokens are denied on every route; the separate Parent Portal routes (for
// the home-log, which a guardian IS allowed to write) live under
// parent-portal.controller.ts instead, each with their own student-access
// and feature-suspension checks.
@Controller('behaviour/qaida-nazra')
@UseGuards(BehaviourStaffOnlyGuard)
export class QaidaNazraExtrasController {
  constructor(private readonly service: QaidaNazraExtrasService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
      userId: req?.user?.userId,
    };
  }

  @Get('settings')
  async getSettings(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getSettings(schoolSlug);
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('settings')
  async updateSettings(@Body() dto: UpdateQaidaNazraSettingsDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateSettings(schoolSlug, dto);
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('invigilator-assessments')
  async recordAssessments(@Body() dto: RecordInvigilatorAssessmentsDto, @Request() req: any) {
    const { schoolSlug, academicYear, userName, userId } = this.ctx(req);
    return this.service.recordAssessments(schoolSlug, academicYear, dto, userName, userId);
  }

  @Get('students/:studentId/invigilator-assessments')
  async getAssessments(
    @Param('studentId') studentId: string,
    @Query('program') program: string | undefined,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAssessmentsForStudent(studentId, schoolSlug, program);
  }

  @Get('students/:studentId/home-log')
  async getHomeLog(
    @Param('studentId') studentId: string,
    @Query('program') program: string | undefined,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getHomeLog(studentId, schoolSlug, program);
  }
}
