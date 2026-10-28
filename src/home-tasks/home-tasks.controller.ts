// ============================================================
// HOME TASKS — STAFF CONTROLLER (teacher assign / review)
// Parent-facing completion lives on ParentPortalController, since
// that's where every other parent-app endpoint in this codebase is
// exposed — see parent-portal.controller.ts.
// ============================================================

import { Controller, Get, Post, Patch, Body, Param, Query, Request, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { HomeTasksService } from './home-tasks.service';
import { AssignHomeTaskDto, ReviewHomeTaskDto } from './dto/home-task.dto';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';
import { BehaviourAccessGuard } from '../behaviour/guards/behaviour-access.guard';
import { BehaviourAccess } from '../behaviour/behaviour-access';

// B1: parent / student / reseller tokens are denied on every route (both BEHAVIOUR_GUARD_MODE modes); staff roles are
// checked against the behaviour policy (log by default) and teachers are class-scoped in the service. Parents use
// /parent-portal/students/:id/home-tasks only.
@Controller('home-tasks')
@UseGuards(BehaviourAccessGuard)
export class HomeTasksController {
  constructor(private readonly service: HomeTasksService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Teacher',
      userId: req?.user?.userId || req?.user?._id,
      requestingUser: req?.user,
      access: req?.behaviourAccess,
    };
  }

  @BehaviourAccess('record_write', 'tarbiyah')
  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('assign')
  @HttpCode(HttpStatus.CREATED)
  async assign(@Body() dto: AssignHomeTaskDto, @Request() req: any) {
    const { schoolSlug, userName, userId, requestingUser, access } = this.ctx(req);
    return this.service.assign(schoolSlug, dto, userName, userId, requestingUser, access);
  }

  @BehaviourAccess('staff_read', 'tarbiyah')
  @Get('class')
  async getClassTasks(@Request() req: any, @Query('grade') grade: string, @Query('section') section: string) {
    const { schoolSlug, requestingUser, access } = this.ctx(req);
    return this.service.getClassTasks(schoolSlug, grade, section, requestingUser, access);
  }

  @BehaviourAccess('record_write', 'tarbiyah')
  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch(':taskId/review')
  async review(@Param('taskId') taskId: string, @Body() dto: ReviewHomeTaskDto, @Request() req: any) {
    const { schoolSlug, requestingUser, access } = this.ctx(req);
    return this.service.review(schoolSlug, taskId, dto, requestingUser, access);
  }
}
