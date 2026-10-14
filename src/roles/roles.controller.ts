import { Controller, Get, Post, Put, Delete, Body, Param, Request, ForbiddenException, UseGuards } from '@nestjs/common';
import { RolesService, RoleActor } from './roles.service';
import { RolesAdminGuard } from './guards/roles-admin.guard';
import { CreateRoleDto, UpdateRoleDto, AssignRoleDto } from './dto/role.dto';

// Every /roles route: owner/admin/super_admin or a custom role with FULL
// institution manage (RolesAdminGuard). Parent/student/staff -> 403.
@UseGuards(RolesAdminGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  private ctx(req: any): RoleActor {
    const u = req?.user || {};
    // No silent 'demo-school' fallback any more: a token without a school
    // must not read or write another school's roles.
    if (!u.schoolSlug || !u.tenantId) throw new ForbiddenException('No school context on this account.');
    return {
      userId: u.userId,
      role: u.role || u.primaryRole,
      schoolSlug: u.schoolSlug,
      tenantId: String(u.tenantId),
      userName: u.name || u.email || 'Admin',
      ipAddress: (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers?.['user-agent'],
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
    const { schoolSlug, tenantId } = this.ctx(req);
    return this.service.getRoles(schoolSlug, tenantId);
  }

  @Post()
  async createRole(@Body() dto: CreateRoleDto, @Request() req: any) {
    return this.service.createRole(this.ctx(req), dto);
  }

  @Put(':id')
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto, @Request() req: any) {
    return this.service.updateRole(this.ctx(req), id, dto);
  }

  @Post(':id/duplicate')
  async duplicateRole(@Param('id') id: string, @Request() req: any) {
    return this.service.duplicateRole(this.ctx(req), id);
  }

  @Delete(':id')
  async deleteRole(@Param('id') id: string, @Request() req: any) {
    return this.service.deleteRole(this.ctx(req), id);
  }

  @Post('assign')
  async assignRole(@Body() dto: AssignRoleDto, @Request() req: any) {
    return this.service.assignRole(this.ctx(req), dto.userId, dto.roleId || null);
  }
}
