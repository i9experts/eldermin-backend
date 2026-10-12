import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesController } from './roles.controller';
import { RolesOrModuleManageGuard } from './guards/roles-or-module-manage.guard';
import { UserRole } from '../auth/roles.enum';
import { ROLES_OR_MODULE_KEY } from './decorators/roles-or-module-manage.decorator';
import { ROLES_ADMIN_ROLES } from '../auth/admin-role-sets';

const HANDLERS = ['getAssignableModules', 'getUsers', 'getRoles', 'createRole', 'updateRole', 'duplicateRole', 'deleteRole', 'assignRole'];

const ctx = (handler: string, user: any): any => ({
  getHandler: () => (RolesController.prototype as any)[handler],
  getClass: () => RolesController,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
});

function build(opts: { customRoleId?: any; role?: any } = {}) {
  const userModel = { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ customRoleId: opts.customRoleId }) }) })) };
  const roleModel = { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(opts.role ?? null) }) })) };
  return new RolesOrModuleManageGuard(new Reflector(), roleModel as any, userModel as any);
}

describe('/roles route guard (all 8 routes)', () => {
  it('every handler is covered by the class-level metadata with the admin set', () => {
    const meta = Reflect.getMetadata(ROLES_OR_MODULE_KEY, RolesController);
    expect(meta.moduleKey).toBe('institution');
    expect([...meta.roles].sort()).toEqual([...ROLES_ADMIN_ROLES].sort());
    expect(HANDLERS.length).toBe(8);
  });

  describe.each(HANDLERS)('%s', (h) => {
    it.each([UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT, UserRole.PRINCIPAL, UserRole.HR_MANAGER, UserRole.FINANCE_MANAGER, UserRole.SUPPORT_STAFF])('%s -> 403', async (r) => {
      await expect(build().canActivate(ctx(h, { userId: 'u', role: r }))).rejects.toThrow(ForbiddenException);
    });
    it.each([UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN])('%s -> allowed (web Roles page)', async (r) => {
      await expect(build().canActivate(ctx(h, { userId: 'u', role: r }))).resolves.toBe(true);
    });
    it('custom role with institution manage -> allowed', async () => {
      const g = build({ customRoleId: 'r', role: { moduleAccess: [{ moduleKey: 'institution', level: 'manage' }] } });
      await expect(g.canActivate(ctx(h, { userId: 'u', role: UserRole.TEACHER }))).resolves.toBe(true);
    });
    it('custom role without institution manage -> 403', async () => {
      const g = build({ customRoleId: 'r', role: { moduleAccess: [{ moduleKey: 'hr', level: 'manage' }, { moduleKey: 'institution', level: 'view' }] } });
      await expect(g.canActivate(ctx(h, { userId: 'u', role: UserRole.TEACHER }))).rejects.toThrow(ForbiddenException);
    });
  });
});
