import {
  Controller, Get, Post, Body, Param, Request, UseGuards, ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModulesService } from './modules.service';
import { BulkActivateDto } from './dto/modules.dto';
import { MODULES_ADMIN_ROLES } from '../auth/role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';

/**
 * The school comes from the signed login token, never from the
 * x-school-slug header (any logged-in user could name another school and
 * toggle ITS modules). Only a platform super_admin, whose token carries no
 * school, may select a school by header.
 */
export function schoolSlugOf(req: any): string {
  const fromToken = req?.user?.schoolSlug;
  if (fromToken) return fromToken;
  const header = req?.headers?.['x-school-slug'];
  if (req?.user?.role === 'super_admin' && header) return header;
  throw new ForbiddenException('No school context on this account.');
}

@Controller('modules')
@UseGuards(JwtAuthGuard)
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get()
  async listModules(@Request() req: any) {
    const schoolSlug = schoolSlugOf(req);
    return this.modulesService.listModules(schoolSlug);
  }

  @Get('summary')
  async getSummary(@Request() req: any) {
    const schoolSlug = schoolSlugOf(req);
    return this.modulesService.getSummary(schoolSlug);
  }

  @RolesOrModuleManage('apps', MODULES_ADMIN_ROLES)
  @Post(':moduleId/activate')
  async activate(@Param('moduleId') moduleId: string, @Request() req: any) {
    const schoolSlug = schoolSlugOf(req);
    return this.modulesService.activateModule(schoolSlug, moduleId, req.user?.name);
  }

  @RolesOrModuleManage('apps', MODULES_ADMIN_ROLES)
  @Post(':moduleId/deactivate')
  async deactivate(@Param('moduleId') moduleId: string, @Request() req: any) {
    const schoolSlug = schoolSlugOf(req);
    return this.modulesService.deactivateModule(schoolSlug, moduleId, req.user?.name);
  }

  @RolesOrModuleManage('apps', MODULES_ADMIN_ROLES)
  @Post('bulk-activate')
  async bulkActivate(@Body() dto: BulkActivateDto, @Request() req: any) {
    const schoolSlug = schoolSlugOf(req);
    return this.modulesService.bulkActivate(schoolSlug, dto.moduleIds, req.user?.name);
  }

  @RolesOrModuleManage('apps', MODULES_ADMIN_ROLES)
  @Post('activate-all')
  async activateAll(@Request() req: any) {
    const schoolSlug = schoolSlugOf(req);
    return this.modulesService.activateAll(schoolSlug, req.user?.name);
  }
}
