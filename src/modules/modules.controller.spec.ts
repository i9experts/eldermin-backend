import { ForbiddenException } from '@nestjs/common';
import { ModulesController, schoolSlugOf } from './modules.controller';

describe('ModulesController school resolution', () => {
  it('uses the JWT school and ignores a different x-school-slug header', () => {
    expect(schoolSlugOf({ user: { schoolSlug: 'mine', role: 'admin' }, headers: { 'x-school-slug': 'victim' } })).toBe('mine');
    expect(schoolSlugOf({ user: { schoolSlug: 'mine', role: 'super_admin' }, headers: { 'x-school-slug': 'victim' } })).toBe('mine');
  });
  it('a school-less token cannot pick a school by header unless super_admin', () => {
    expect(() => schoolSlugOf({ user: { role: 'admin' }, headers: { 'x-school-slug': 'victim' } })).toThrow(ForbiddenException);
    expect(schoolSlugOf({ user: { role: 'super_admin' }, headers: { 'x-school-slug': 'chosen' } })).toBe('chosen');
  });
  it.each(['activate', 'deactivate', 'bulkActivate', 'activateAll', 'listModules', 'getSummary'])('%s passes the token school to the service', async (m) => {
    const calls: any[] = [];
    const svc: any = new Proxy({}, { get: () => (...a: any[]) => { calls.push(a); return {}; } });
    const c: any = new ModulesController(svc);
    const req = { user: { schoolSlug: 'mine', name: 'n' }, headers: { 'x-school-slug': 'victim' } };
    await (c as any)[m](...(m === 'activate' || m === 'deactivate' ? ['mod1', req] : m === 'bulkActivate' ? [{ moduleIds: ['a'] }, req] : [req]));
    expect(calls[0][0]).toBe('mine');
  });
});

import { Reflector } from '@nestjs/core';
import { RolesOrModuleManageGuard } from '../roles/guards/roles-or-module-manage.guard';
import { MODULES_ADMIN_ROLES } from '../auth/role-sets';

describe('ModulesController role guard (ported from feat/staff-portal)', () => {
  const ctx = (h: string, user: any): any => ({ getHandler: () => (ModulesController.prototype as any)[h], getClass: () => ModulesController, switchToHttp: () => ({ getRequest: () => ({ user }) }) });
  const guard = (cr?: any, role?: any) => new RolesOrModuleManageGuard(new Reflector(),
    { findById: () => ({ select: () => ({ lean: () => Promise.resolve(role ?? null) }) }) } as any,
    { findById: () => ({ select: () => ({ lean: () => Promise.resolve({ customRoleId: cr }) }) }) } as any);
  const WRITES = ['activate', 'deactivate', 'bulkActivate', 'activateAll'];
  it.each(WRITES)('%s: teacher/parent/student/hr/finance -> 403, MODULES_ADMIN_ROLES allowed', async (h) => {
    for (const r of ['teacher', 'parent', 'student', 'hr_manager', 'finance_manager', 'librarian'])
      await expect(guard().canActivate(ctx(h, { userId: 'u', role: r }))).rejects.toThrow(ForbiddenException);
    for (const r of MODULES_ADMIN_ROLES) await expect(guard().canActivate(ctx(h, { userId: 'u', role: r }))).resolves.toBe(true);
  });
  it('custom role with apps sub-module manage passes; module-wide-only does not (admin-set route)', async () => {
    await expect(guard('r', { moduleAccess: [{ moduleKey: 'apps', subModuleKey: 'x', level: 'manage' }] }).canActivate(ctx('activate', { userId: 'u', role: 'teacher' }))).resolves.toBe(true);
    await expect(guard('r', { moduleAccess: [{ moduleKey: 'apps', level: 'manage' }] }).canActivate(ctx('activate', { userId: 'u', role: 'teacher' }))).rejects.toThrow(ForbiddenException);
  });
  it('reads (list/summary) stay open to any logged-in user of the school', async () => {
    for (const h of ['listModules', 'getSummary']) await expect(guard().canActivate(ctx(h, { userId: 'u', role: 'teacher' }))).resolves.toBe(true);
  });
});
