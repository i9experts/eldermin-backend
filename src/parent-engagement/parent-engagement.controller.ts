// ============================================================
// PARENT ENGAGEMENT SCORE — CONTROLLER
// Eldermin ERP | NestJS
// ============================================================

import { Controller, Get, Post, Body, Param, Query, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ParentEngagementService } from './parent-engagement.service';
import { BulkLogPickupDto } from './dto/parent-engagement.dto';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';

@Controller('parent-engagement')
export class ParentEngagementController {
  constructor(private readonly service: ParentEngagementService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Admin',
      userId: req?.user?.userId || req?.user?._id,
    };
  }

  @RolesOrModuleManage('students', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('pickup/bulk')
  @HttpCode(HttpStatus.CREATED)
  async bulkLogPickup(@Body() dto: BulkLogPickupDto, @Request() req: any) {
    const { schoolSlug, userName, userId } = this.ctx(req);
    return this.service.bulkLogPickup(schoolSlug, dto, userName, userId);
  }

  @Get('pickup')
  async getPickupLogs(
    @Request() req: any,
    @Query('grade') grade: string,
    @Query('section') section: string,
    @Query('date') date: string,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPickupLogsForClass(schoolSlug, grade, section, date);
  }

  @Get('score/:studentId')
  async getScore(@Param('studentId') studentId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.computeScore(schoolSlug, studentId);
  }

  @Get('class')
  async getClassScores(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getClassScores(schoolSlug, query);
  }
}
