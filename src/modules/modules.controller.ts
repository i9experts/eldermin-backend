import {
  Controller, Get, Post, Body, Param, Request, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModulesService } from './modules.service';
import { BulkActivateDto } from './dto/modules.dto';
import { MODULES_ADMIN_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';

@Controller('modules')
@UseGuards(JwtAuthGuard)
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get()
  async listModules(@Request() req: any) {
    const schoolSlug = req.headers['x-school-slug'] || req.user.schoolSlug;
    return this.modulesService.listModules(schoolSlug);
  }

  @Get('summary')
  async getSummary(@Request() req: any) {
    const schoolSlug = req.headers['x-school-slug'] || req.user.schoolSlug;
    return this.modulesService.getSummary(schoolSlug);
  }

  @RolesOrModuleManage('apps', MODULES_ADMIN_ROLES)
  @Post(':moduleId/activate')
  async activate(@Param('moduleId') moduleId: string, @Request() req: any) {
    const schoolSlug = req.headers['x-school-slug'] || req.user.schoolSlug;
    return this.modulesService.activateModule(schoolSlug, moduleId, req.user?.name);
  }

  @RolesOrModuleManage('apps', MODULES_ADMIN_ROLES)
  @Post(':moduleId/deactivate')
  async deactivate(@Param('moduleId') moduleId: string, @Request() req: any) {
    const schoolSlug = req.headers['x-school-slug'] || req.user.schoolSlug;
    return this.modulesService.deactivateModule(schoolSlug, moduleId, req.user?.name);
  }

  @RolesOrModuleManage('apps', MODULES_ADMIN_ROLES)
  @Post('bulk-activate')
  async bulkActivate(@Body() dto: BulkActivateDto, @Request() req: any) {
    const schoolSlug = req.headers['x-school-slug'] || req.user.schoolSlug;
    return this.modulesService.bulkActivate(schoolSlug, dto.moduleIds, req.user?.name);
  }

  @RolesOrModuleManage('apps', MODULES_ADMIN_ROLES)
  @Post('activate-all')
  async activateAll(@Request() req: any) {
    const schoolSlug = req.headers['x-school-slug'] || req.user.schoolSlug;
    return this.modulesService.activateAll(schoolSlug, req.user?.name);
  }
}
