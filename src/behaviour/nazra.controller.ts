// ============================================================
// NAZRA (QUR'AN READING) PROGRESS CONTROLLER
// Eldermin ERP | NestJS
// ============================================================

import {
  Controller, Get, Post, Patch, Body, Param, Query, Request,
} from '@nestjs/common';
import { NazraService } from './nazra.service';
import { InitNazraProgressDto, RecordNazraDiaryDto, UpdateParaStatusDto } from './dto/nazra.dto';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';

@Controller('behaviour/nazra')
export class NazraController {
  constructor(private readonly service: NazraService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
      userId: req?.user?.userId,
      requestingUser: req?.user,
    };
  }

  @Get('paras')
  getParas() {
    return this.service.getParas();
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
    @Body() dto: InitNazraProgressDto,
    @Request() req: any,
  ) {
    const { schoolSlug, academicYear, requestingUser } = this.ctx(req);
    return this.service.getOrInitProgress(studentId, schoolSlug, academicYear, dto, requestingUser);
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('students/:studentId/diary')
  async recordDiaryEntry(
    @Param('studentId') studentId: string,
    @Body() dto: RecordNazraDiaryDto,
    @Request() req: any,
  ) {
    const { schoolSlug, userName, userId } = this.ctx(req);
    return this.service.recordDiaryEntry(studentId, schoolSlug, dto, userName, userId);
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch('students/:studentId/para/:paraNumber')
  async updateStatus(
    @Param('studentId') studentId: string,
    @Param('paraNumber') paraNumber: string,
    @Body() dto: UpdateParaStatusDto,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateParaStatus(studentId, schoolSlug, Number(paraNumber), dto.status);
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
