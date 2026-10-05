import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesOrModuleManageGuard } from './roles-or-module-manage.guard';
import { RolesOrModuleManage } from '../decorators/roles-or-module-manage.decorator';
import { Public } from '../../auth/decorators';
import { UserRole } from '../../auth/roles.enum';
import { TEACHING_ADMIN_ROLES, HR_LEAVE_ADMIN_ROLES, STAFF_WRITE_ROLES } from '../../auth/role-sets';

class Ctrl {
  @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES) admin() {}
  @RolesOrModuleManage('hr', HR_LEAVE_ADMIN_ROLES, { level: 'view' }) hrView() {}
  @RolesOrModuleManage('students', STAFF_WRITE_ROLES, { allowModuleWide: true }) staffWrite() {}
  @Public() @RolesOrModuleManage('teaching', TEACHING_ADMIN_ROLES) pub() {}
  plain() {}
}

const ctx = (handler: string, user: any): any => ({
  getHandler: () => (Ctrl.prototype as any)[handler],
  getClass: () => Ctrl,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
});

function build(opts: { customRoleId?: any; role?: any; userErr?: boolean; roleErr?: boolean } = {}) {
  const userModel = {
    findById: jest.fn(() => ({
      select: () => ({
        lean: () => (opts.userErr ? Promise.reject(new Error('db down')) : Promise.resolve({ customRoleId: opts.customRoleId })),
      }),
    })),
  };
  const roleModel = {
    findById: jest.fn(() => ({
      select: () => ({
        lean: () => (opts.roleErr ? Promise.reject(new Error('db down')) : Promise.resolve(opts.role ?? null)),
      }),
    })),
  };
  const guard = new RolesOrModuleManageGuard(new Reflector(), roleModel as any, userModel as any);
  return { guard, userModel, roleModel };
}

const teacher = { userId: 'u1', role: UserRole.TEACHER };

describe('RolesOrModuleManageGuard', () => {
  it('passes on base role without DB access', async () => {
    const { guard, userModel } = build();
    await expect(guard.canActivate(ctx('admin', { userId: 'u', role: UserRole.PRINCIPAL }))).resolves.toBe(true);
    expect(userModel.findById).not.toHaveBeenCalled();
  });

  it('passes on sub-module manage grant for an admin-set route', async () => {
    const { guard } = build({ customRoleId: 'r1', role: { moduleAccess: [{ moduleKey: 'teaching', subModuleKey: 'timetable', level: 'manage' }] } });
    await expect(guard.canActivate(ctx('admin', teacher))).resolves.toBe(true);
  });

  it('passes on module-wide manage for a staff-write route with allowModuleWide', async () => {
    const { guard } = build({ customRoleId: 'r1', role: { moduleAccess: [{ moduleKey: 'students', level: 'manage' }] } });
    await expect(guard.canActivate(ctx('staffWrite', { userId: 'u', role: UserRole.SUPPORT_STAFF }))).resolves.toBe(true);
  });

  it('denies staff-write when custom role only has view', async () => {
    const { guard } = build({ customRoleId: 'r1', role: { moduleAccess: [{ moduleKey: 'students', level: 'view' }] } });
    await expect(guard.canActivate(ctx('staffWrite', { userId: 'u', role: UserRole.SUPPORT_STAFF }))).rejects.toThrow(ForbiddenException);
  });

  it('denies when neither base role nor custom role qualify', async () => {
    const { guard } = build();
    await expect(guard.canActivate(ctx('admin', teacher))).rejects.toThrow(ForbiddenException);
  });

  it('denies when the assigned role document is missing', async () => {
    const { guard } = build({ customRoleId: 'gone', role: null });
    await expect(guard.canActivate(ctx('admin', teacher))).rejects.toThrow(ForbiddenException);
  });

  it('stock Teacher module-wide teaching:manage does NOT pass an admin-set route', async () => {
    const stock = { moduleAccess: [{ moduleKey: 'teaching', level: 'manage' }, { moduleKey: 'students', level: 'view' }] };
    const { guard } = build({ customRoleId: 'r1', role: stock });
    await expect(guard.canActivate(ctx('admin', teacher))).rejects.toThrow(ForbiddenException);
  });

  it('sub-module view grant does not satisfy manage on admin-set route', async () => {
    const { guard } = build({ customRoleId: 'r1', role: { moduleAccess: [{ moduleKey: 'teaching', subModuleKey: 'timetable', level: 'view' }] } });
    await expect(guard.canActivate(ctx('admin', teacher))).rejects.toThrow(ForbiddenException);
  });

  it('hr leave status passes with view level sub-module grant', async () => {
    const { guard } = build({ customRoleId: 'r1', role: { moduleAccess: [{ moduleKey: 'hr', subModuleKey: 'leave', level: 'view' }] } });
    await expect(guard.canActivate(ctx('hrView', teacher))).resolves.toBe(true);
  });

  it.each([UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT])(
    '%s with a granting custom role is denied without DB lookup', async (r) => {
      const { guard, userModel } = build({ customRoleId: 'r1', role: { moduleAccess: [{ moduleKey: 'students', level: 'manage' }] } });
      await expect(guard.canActivate(ctx('staffWrite', { userId: 'u', role: r }))).rejects.toThrow(ForbiddenException);
      expect(userModel.findById).not.toHaveBeenCalled();
    });

  it('fails closed (403) on user lookup error', async () => {
    const { guard } = build({ userErr: true });
    await expect(guard.canActivate(ctx('admin', teacher))).rejects.toThrow(ForbiddenException);
  });

  it('fails closed (403) on role lookup error', async () => {
    const { guard } = build({ customRoleId: 'r1', roleErr: true });
    await expect(guard.canActivate(ctx('admin', teacher))).rejects.toThrow(ForbiddenException);
  });

  it('@Public bypasses', async () => {
    const { guard } = build();
    await expect(guard.canActivate(ctx('pub', undefined))).resolves.toBe(true);
  });

  it('no metadata is a no-op', async () => {
    const { guard, userModel } = build();
    await expect(guard.canActivate(ctx('plain', teacher))).resolves.toBe(true);
    expect(userModel.findById).not.toHaveBeenCalled();
  });
});
