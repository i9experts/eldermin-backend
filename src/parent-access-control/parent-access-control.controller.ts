// ============================================================
// PARENT APP FEATURE ACCESS CONTROL — admin-facing controller
// Eldermin ERP | NestJS
// ============================================================

import { Controller, Get, Patch, Param, Body, Query, Request } from '@nestjs/common';
import { ParentAccessControlService } from './parent-access-control.service';
import { SetParentFeatureAccessDto } from './dto/parent-feature-access.dto';
import { STUDENTS_WRITE_ROLES } from '../auth/admin-role-sets';
import { RolesOrModuleManage } from '../roles/decorators/roles-or-module-manage.decorator';

@Controller('parent-access-control')
export class ParentAccessControlController {
  constructor(private readonly service: ParentAccessControlService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      requestingUser: { ...req?.user, name: req?.user?.name || 'Admin' },
    };
  }

  // Lists which parent (User) accounts are linked to this student, so the
  // admin UI has a parentUserId to call the two endpoints below with — a
  // guardian subdocument on Student carries no userId of its own (only set
  // once the guardian's own app login exists).
  @RolesOrModuleManage('students', STUDENTS_WRITE_ROLES, { level: 'manage', allowModuleWide: true })
  @Get('students/:studentId/parents')
  async listParents(@Param('studentId') studentId: string) {
    return this.service.listParentsForStudent(studentId);
  }

  // Same roles already trusted to link/unlink a guardian to a student -
  // deciding which app features a guardian can use is the same level of
  // sensitivity as deciding whether they're linked to the student at all.
  @RolesOrModuleManage('students', STUDENTS_WRITE_ROLES, { level: 'manage', allowModuleWide: true })
  @Get('students/:studentId/parents/:parentUserId')
  async getAccess(
    @Param('studentId') studentId: string,
    @Param('parentUserId') parentUserId: string,
    @Request() req: any,
  ) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getAccess(schoolSlug, parentUserId, studentId);
  }

  @RolesOrModuleManage('students', STUDENTS_WRITE_ROLES, { level: 'manage', allowModuleWide: true })
  @Patch('students/:studentId/parents/:parentUserId')
  async setAccess(
    @Param('studentId') studentId: string,
    @Param('parentUserId') parentUserId: string,
    @Body() dto: SetParentFeatureAccessDto,
    @Request() req: any,
  ) {
    const { schoolSlug, requestingUser } = this.ctx(req);
    return this.service.setFeatureAccess(schoolSlug, parentUserId, studentId, dto, requestingUser);
  }

  @RolesOrModuleManage('students', STUDENTS_WRITE_ROLES, { level: 'manage', allowModuleWide: true })
  @Get('restricted')
  async listRestricted(@Query('campusId') campusId: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.listRestricted(schoolSlug, campusId);
  }
}
