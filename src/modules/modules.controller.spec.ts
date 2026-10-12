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
