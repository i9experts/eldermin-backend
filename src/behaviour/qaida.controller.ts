// ============================================================
// QAIDA & TAJWEED PROGRESS CONTROLLER
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Patch, Body, Param, Query, Request, UseGuards,
} from '@nestjs/common';
import { QaidaService } from './qaida.service';
import { InitQaidaProgressDto, RecordTakhtiAttemptDto, UpdateTakhtiStatusDto } from './dto/qaida.dto';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';
import { BehaviourStaffOnlyGuard } from './guards/behaviour-staff-only.guard';

// B0.2: parent / student / reseller tokens are denied on every route (both guard modes); staff access unchanged.
@Controller('behaviour/qaida')
@UseGuards(BehaviourStaffOnlyGuard)
export class QaidaController {
  constructor(private readonly service: QaidaService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
      userId: req?.user?.userId,
      requestingUser: req?.user,
    };
  }

  @Get('takhtis')
  getTakhtis() {
    return this.service.getTakhtis();
  }

  @Get('summary')
  async getSummary(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getSummary(schoolSlug);
  }

  @Get('class')
  async getClassProgress(
    @Request() req: any,
    @Query('grade') grade: string,
    @Query('section') section?: string,
    @Query('campusId') campusId?: string,
  ) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.getClassProgress(schoolSlug, grade, section, requestingUser, campusId);
  }

  @Get('students/:studentId')
  async getProgress(@Param('studentId') studentId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getProgress(studentId, schoolSlug);
  }

  @Get('students/:studentId/report')
  async getReport(@Param('studentId') studentId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getReportData(studentId, schoolSlug);
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('students/:studentId/init')
  async initProgress(
    @Param('studentId') studentId: string,
    @Body() dto: InitQaidaProgressDto,
    @Request() req: any,
  ) {
    const { schoolSlug, academicYear, requestingUser } = this.ctx(req);
    return this.service.getOrInitProgress(studentId, schoolSlug, academicYear, dto, requestingUser);
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('students/:studentId/attempts')
  async recordAttempt(
    @Param('studentId') studentId: string,
    @Body() dto: RecordTakhtiAttemptDto,
    @Request() req: any,
  ) {
    const { schoolSlug, userName, userId } = this.ctx(req);
    return this.service.recordAttempt(studentId, schoolSlug, dto, userName, userId);
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('students/:studentId/takhti/:takhtiNumber')
  async updateStatus(
    @Param('studentId') studentId: string,
    @Param('takhtiNumber') takhtiNumber: string,
    @Body() dto: UpdateTakhtiStatusDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateTakhtiStatus(studentId, schoolSlug, Number(takhtiNumber), dto.status);
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('students/:studentId/remarks')
  async updateRemarks(
    @Param('studentId') studentId: string,
    @Body() dto: { remarks: string },
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateOverallRemarks(studentId, schoolSlug, dto.remarks);
  }
}
