import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ParentPortalController } from './parent-portal.controller';
import { RolesOrModuleManageGuard } from '../roles/guards/roles-or-module-manage.guard';
import { UserRole } from '../auth/roles.enum';
import { PERMISSIONS_MATRIX } from '../auth/permissions.matrix';
import { STUDENTS_WRITE_ROLES } from '../auth/admin-role-sets';

const ctx = (h: string, user: any): any => ({
  getHandler: () => (ParentPortalController.prototype as any)[h],
  getClass: () => ParentPortalController,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
});
const build = (customRoleId?: any, role?: any) => new RolesOrModuleManageGuard(
  new Reflector(),
  { findById: () => ({ select: () => ({ lean: () => Promise.resolve(role ?? null) }) }) } as any,
  { findById: () => ({ select: () => ({ lean: () => Promise.resolve({ customRoleId }) }) }) } as any,
);

describe('link-guardian / unlink-guardian guard', () => {
  it('STUDENTS_WRITE_ROLES equals roles with students:write in the permission matrix (+super_admin)', () => {
    const fromMatrix = Object.entries(PERMISSIONS_MATRIX)
      .filter(([r, p]) => (p as string[]).includes('students:write') || (p as string[]).includes('super_admin:all') || r === UserRole.SUPER_ADMIN)
      .map(([r]) => r).sort();
    expect([...STUDENTS_WRITE_ROLES].sort()).toEqual(fromMatrix);
  });
  describe.each(['linkGuardian', 'unlinkGuardian'])('%s', (h) => {
    it.each([UserRole.PARENT, UserRole.STUDENT, UserRole.TEACHER, UserRole.HR_MANAGER, UserRole.FINANCE_MANAGER, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF])('%s -> 403', async (r) => {
      await expect(build().canActivate(ctx(h, { userId: 'u', role: r }))).rejects.toThrow(ForbiddenException);
    });
    it.each(STUDENTS_WRITE_ROLES)('%s -> allowed', async (r) => {
      await expect(build().canActivate(ctx(h, { userId: 'u', role: r }))).resolves.toBe(true);
    });
    it('custom role with students manage -> allowed; without -> 403', async () => {
      await expect(build('r', { moduleAccess: [{ moduleKey: 'students', level: 'manage' }] }).canActivate(ctx(h, { userId: 'u', role: UserRole.TEACHER }))).resolves.toBe(true);
      await expect(build('r', { moduleAccess: [{ moduleKey: 'students', level: 'view' }] }).canActivate(ctx(h, { userId: 'u', role: UserRole.TEACHER }))).rejects.toThrow(ForbiddenException);
    });
    it('parent with a granting custom role is still 403', async () => {
      await expect(build('r', { moduleAccess: [{ moduleKey: 'students', level: 'manage' }] }).canActivate(ctx(h, { userId: 'u', role: UserRole.PARENT }))).rejects.toThrow(ForbiddenException);
    });
  });
});
