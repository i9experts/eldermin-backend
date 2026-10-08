import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AssessmentController } from './assessment.controller';
import { RolesOrModuleManageGuard } from '../roles/guards/roles-or-module-manage.guard';
import { ROLES_OR_MODULE_KEY } from '../roles/decorators/roles-or-module-manage.decorator';
import { UserRole } from '../auth/roles.enum';
import { TEACHING_ADMIN_ROLES } from '../auth/role-sets';

// B4: result-publication routes are admin-only (teacher 403). Fakes only.
const ROUTES = ['verifyMarks', 'generateReportCards', 'publishResults'] as const;

const ctx = (handler: string, user: any): any => ({
  getHandler: () => (AssessmentController.prototype as any)[handler],
  getClass: () => AssessmentController,
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
});
function build(role?: any) {
  const userModel = { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ customRoleId: role ? 'r1' : undefined }) }) })) };
  const roleModel = { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(role ?? null) }) })) };
  return new RolesOrModuleManageGuard(new Reflector(), roleModel as any, userModel as any);
}

describe.each(ROUTES)('AssessmentController.%s guard', (fn) => {
  it('metadata: assessments module, TEACHING_ADMIN_ROLES, manage, no module-wide pass', () => {
    const m = Reflect.getMetadata(ROLES_OR_MODULE_KEY, (AssessmentController.prototype as any)[fn]);
    expect(m.moduleKey).toBe('assessments');
    expect([...m.roles].sort()).toEqual([...TEACHING_ADMIN_ROLES].sort());
    expect(m.level).toBe('manage');
    expect(m.allowModuleWide).toBe(false);
    expect(m.roles).not.toContain(UserRole.TEACHER);
  });
  it.each(TEACHING_ADMIN_ROLES)('%s passes', async (role) => {
    await expect(build().canActivate(ctx(fn, { userId: 'u', role }))).resolves.toBe(true);
  });
  it('teacher is denied with a clear message', async () => {
    await expect(build().canActivate(ctx(fn, { userId: 'u', role: UserRole.TEACHER }))).rejects.toThrow(/Access denied\. Requires one of: .*assessments/);
    await expect(build().canActivate(ctx(fn, { userId: 'u', role: UserRole.TEACHER }))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([UserRole.PARENT, UserRole.STUDENT])('%s is denied', async (role) => {
    await expect(build({ moduleAccess: [{ moduleKey: 'assessments', level: 'manage' }] }).canActivate(ctx(fn, { userId: 'u', role }))).rejects.toThrow(ForbiddenException);
  });
  it('custom role with an assessments sub-module manage grant passes', async () => {
    const g = build({ moduleAccess: [{ moduleKey: 'assessments', subModuleKey: 'results', level: 'manage' }] });
    await expect(g.canActivate(ctx(fn, { userId: 'u', role: UserRole.TEACHER }))).resolves.toBe(true);
  });
  it('stock Teacher module-wide assessments:manage does NOT pass', async () => {
    const g = build({ moduleAccess: [{ moduleKey: 'assessments', level: 'manage' }] });
    await expect(g.canActivate(ctx(fn, { userId: 'u', role: UserRole.TEACHER }))).rejects.toThrow(ForbiddenException);
  });
  it('sub-module view grant does not pass', async () => {
    const g = build({ moduleAccess: [{ moduleKey: 'assessments', subModuleKey: 'results', level: 'view' }] });
    await expect(g.canActivate(ctx(fn, { userId: 'u', role: UserRole.TEACHER }))).rejects.toThrow(ForbiddenException);
  });
});
