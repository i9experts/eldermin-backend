import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Request } from '@nestjs/common';
import { PlatformStaffService } from './platform-staff.service';
import { CreatePlatformRoleDto, UpdatePlatformRoleDto, AssignPlatformRoleDto, CreatePlatformStaffDto } from './dto/platform-role.dto';
import { Roles } from '../auth/decorators';
import { UserRole } from '../auth/roles.enum';
import { RequirePlatformAccess } from './decorators/require-platform-access.decorator';

// Mounted under /super-admin/team - the "Team & Access" tab's own API.
// Gated the same way the rest of Super Admin is (@Roles(SUPER_ADMIN)) plus
// @RequirePlatformAccess('team', ...) so a platform staffer without
// "manage team" access can't create/edit/delete roles or other staff
// accounts even though they're still, at the enum level, a super_admin.
@Roles(UserRole.SUPER_ADMIN)
@Controller('super-admin/team')
export class PlatformStaffController {
  constructor(private readonly service: PlatformStaffService) {}

  private adminUser(req: any) {
    return req?.user?.name || 'Super Admin';
  }

  @RequirePlatformAccess('team', undefined, 'view')
  @Get('tabs')
  getAssignableTabs() {
    return this.service.getAssignableTabs();
  }

  @RequirePlatformAccess('team', undefined, 'view')
  @Get('roles')
  getRoles() {
    return this.service.getRoles();
  }

  @RequirePlatformAccess('team', undefined, 'manage')
  @Post('roles')
  createRole(@Body() dto: CreatePlatformRoleDto, @Request() req: any) {
    return this.service.createRole(dto, this.adminUser(req));
  }

  @RequirePlatformAccess('team', undefined, 'manage')
  @Put('roles/:id')
  updateRole(@Param('id') id: string, @Body() dto: UpdatePlatformRoleDto) {
    return this.service.updateRole(id, dto);
  }

  @RequirePlatformAccess('team', undefined, 'manage')
  @Post('roles/:id/duplicate')
  duplicateRole(@Param('id') id: string, @Request() req: any) {
    return this.service.duplicateRole(id, this.adminUser(req));
  }

  @RequirePlatformAccess('team', undefined, 'manage')
  @Delete('roles/:id')
  deleteRole(@Param('id') id: string) {
    return this.service.deleteRole(id);
  }

  @RequirePlatformAccess('team', undefined, 'manage')
  @Post('assign')
  assignRole(@Body() dto: AssignPlatformRoleDto) {
    return this.service.assignRole(dto.userId, dto.roleId || null);
  }

  @RequirePlatformAccess('team', undefined, 'view')
  @Get('staff')
  getStaff() {
    return this.service.getStaff();
  }

  @RequirePlatformAccess('team', undefined, 'manage')
  @Post('staff')
  createStaff(@Body() dto: CreatePlatformStaffDto) {
    return this.service.createStaff(dto);
  }

  @RequirePlatformAccess('team', undefined, 'manage')
  @Patch('staff/:id/status')
  setStaffActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.service.setStaffActive(id, body.isActive);
  }

  @RequirePlatformAccess('team', undefined, 'manage')
  @Post('staff/:id/reset-password')
  resetStaffPassword(@Param('id') id: string) {
    return this.service.resetStaffPassword(id);
  }
}
