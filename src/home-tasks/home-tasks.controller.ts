// ============================================================
// HOME TASKS — STAFF CONTROLLER (teacher assign / review)
// Parent-facing completion lives on ParentPortalController, since
// that's where every other parent-app endpoint in this codebase is
// exposed — see parent-portal.controller.ts.
// ============================================================

import { Controller, Get, Post, Patch, Body, Param, Query, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { HomeTasksService } from './home-tasks.service';
import { AssignHomeTaskDto, ReviewHomeTaskDto } from './dto/home-task.dto';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';

@Controller('home-tasks')
export class HomeTasksController {
  constructor(private readonly service: HomeTasksService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      userName: req?.user?.name || 'Teacher',
      userId: req?.user?.userId || req?.user?._id,
    };
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Post('assign')
  @HttpCode(HttpStatus.CREATED)
  async assign(@Body() dto: AssignHomeTaskDto, @Request() req: any) {
    const { schoolSlug, userName, userId } = this.ctx(req);
    return this.service.assign(schoolSlug, dto, userName, userId);
  }

  @Get('class')
  async getClassTasks(@Request() req: any, @Query('grade') grade: string, @Query('section') section: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getClassTasks(schoolSlug, grade, section);
  }

  @RolesOrModuleManage('behaviour', STAFF_WRITE_ROLES, { allowModuleWide: true })
  @Patch(':taskId/review')
  async review(@Param('taskId') taskId: string, @Body() dto: ReviewHomeTaskDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.review(schoolSlug, taskId, dto);
  }
}
