import {
  Controller, Get, Post, Body, Param, Request, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModulesService } from './modules.service';
import { BulkActivateDto } from './dto/modules.dto';

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

  @Post(':moduleId/activate')
  async activate(@Param('moduleId') moduleId: string, @Request() req: any) {
    const schoolSlug = req.headers['x-school-slug'] || req.user.schoolSlug;
    return this.modulesService.activateModule(schoolSlug, moduleId);
  }

  @Post(':moduleId/deactivate')
  async deactivate(@Param('moduleId') moduleId: string, @Request() req: any) {
    const schoolSlug = req.headers['x-school-slug'] || req.user.schoolSlug;
    return this.modulesService.deactivateModule(schoolSlug, moduleId);
  }

  @Post('bulk-activate')
  async bulkActivate(@Body() dto: BulkActivateDto, @Request() req: any) {
    const schoolSlug = req.headers['x-school-slug'] || req.user.schoolSlug;
    return this.modulesService.bulkActivate(schoolSlug, dto.moduleIds);
  }
}
