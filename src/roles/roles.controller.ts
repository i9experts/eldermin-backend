import { Controller, Get, Post, Put, Delete, Body, Param, Request } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, AssignRoleDto } from './dto/role.dto';

@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || 'demo-school',
      tenantId: req?.user?.tenantId,
      userName: req?.user?.name || req?.user?.email || 'Admin',
    };
  }

  @Get('modules')
  getAssignableModules() {
    return this.service.getAssignableModules();
  }

  @Get('users')
  async getUsers(@Request() req: any) {
    const { tenantId } = this.ctx(req);
    return this.service.getUsersForSchool(tenantId);
  }

  @Get()
  async getRoles(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getRoles(schoolSlug);
  }

  @Post()
  async createRole(@Body() dto: CreateRoleDto, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createRole(schoolSlug, dto, userName);
  }

  @Put(':id')
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateRole(id, schoolSlug, dto);
  }

  @Post(':id/duplicate')
  async duplicateRole(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.duplicateRole(id, schoolSlug, userName);
  }

  @Delete(':id')
  async deleteRole(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.deleteRole(id, schoolSlug);
  }

  @Post('assign')
  async assignRole(@Body() dto: AssignRoleDto, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.assignRole(schoolSlug, dto.userId, dto.roleId || null);
  }
}
