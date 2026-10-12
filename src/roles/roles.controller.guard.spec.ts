import { ForbiddenException } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesAdminGuard } from './guards/roles-admin.guard';
import { UserRole } from '../auth/roles.enum';
import { GUARDS_METADATA } from '@nestjs/common/constants';

const HANDLERS = ['getAssignableModules', 'getUsers', 'getRoles', 'createRole', 'updateRole', 'duplicateRole', 'deleteRole', 'assignRole'];

const ctx = (handler: string, user: any): any => ({
  getHandler: () => (RolesController.prototype as any)[handler],
  getClass: () => RolesController,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
});

function build(opts: { customRoleId?: any; role?: any } = {}) {
  const userModel = { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ customRoleId: opts.customRoleId }) }) })) };
  const roleModel = { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(opts.role ?? null) }) })) };
  return new RolesAdminGuard(roleModel as any, userModel as any);
}

describe('/roles route guard (all 8 routes)', () => {
  it('the controller is behind RolesAdminGuard (class level) and has 8 handlers', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, RolesController)).toContain(RolesAdminGuard);
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
    it('custom role with ONLY a sub-module institution grant -> 403', async () => {
      const g = build({ customRoleId: 'r', role: { moduleAccess: [{ moduleKey: 'institution', subModuleKey: 'audit', level: 'manage' }] } });
      await expect(g.canActivate(ctx(h, { userId: 'u', role: UserRole.TEACHER }))).rejects.toThrow(ForbiddenException);
    });
    it('parent with a granting custom role -> 403', async () => {
      const g = build({ customRoleId: 'r', role: { moduleAccess: [{ moduleKey: 'institution', level: 'manage' }] } });
      await expect(g.canActivate(ctx(h, { userId: 'u', role: UserRole.PARENT }))).rejects.toThrow(ForbiddenException);
    });
    it('custom role lookup error -> 403 (fail closed)', async () => {
      const g = new RolesAdminGuard({ findById: () => { throw new Error('x'); } } as any, { findById: () => { throw new Error('x'); } } as any);
      await expect(g.canActivate(ctx(h, { userId: 'u', role: UserRole.TEACHER }))).rejects.toThrow(ForbiddenException);
    });
    it('custom role without institution manage -> 403', async () => {
      const g = build({ customRoleId: 'r', role: { moduleAccess: [{ moduleKey: 'hr', level: 'manage' }, { moduleKey: 'institution', level: 'view' }] } });
      await expect(g.canActivate(ctx(h, { userId: 'u', role: UserRole.TEACHER }))).rejects.toThrow(ForbiddenException);
    });
  });
});
