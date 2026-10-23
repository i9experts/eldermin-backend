import { ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './decorators';
import { UserRole } from './roles.enum';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ResellerScopeGuard, isResellerAllowed, resellerScopeMode } from './reseller-scope.guard';
import { AppModule } from '../app.module';

const P = '/api/v1';
// Routes a school-less token could reach with an x-school-slug header before this guard (measured on the local app).
const PREVIOUSLY_OPEN: Array<[string, string]> = [
  ['GET', `${P}/assessments/dashboard`], ['GET', `${P}/assessments/questions/list`], ['GET', `${P}/assessments/papers/65f000000000000000000001`],
  ['GET', `${P}/parent-portal/my-students`], ['GET', `${P}/parent-portal/circulars`],
  ['GET', `${P}/parent-portal/students/65f000000000000000000001/profile`],
  ['GET', `${P}/finance/dashboard`], ['GET', `${P}/finance/coa`], ['GET', `${P}/finance/fiscal-years`], ['GET', `${P}/finance/defaulters/policy`],
  ['GET', `${P}/families`], ['GET', `${P}/families/search-by-guardian?q=x`],
  ['GET', `${P}/admissions/leads`], ['GET', `${P}/organization/profile`], ['GET', `${P}/procurement/vendors`],
  ['GET', `${P}/campus/dashboard`], ['GET', `${P}/students/dashboard`], ['GET', `${P}/documents/workflow-templates`],
  ['GET', `${P}/certificates/templates`], ['GET', `${P}/id-cards/templates`], ['GET', `${P}/behaviour/dashboard`], ['GET', `${P}/behaviour/qaida/summary`],
  ['POST', `${P}/students`], ['PUT', `${P}/organization/profile`], ['DELETE', `${P}/assessments/papers/65f000000000000000000001`],
];
const RESELLER_ALLOWED: Array<[string, string]> = [
  ['GET', `${P}/reseller-portal/dashboard`], ['GET', `${P}/reseller-portal/commission-ledger?page=1`], ['GET', `${P}/reseller-portal/commission-summary`],
  ['POST', `${P}/reseller-portal/provisioning-requests`], ['GET', `${P}/reseller-portal/provisioning-requests`],
  ['POST', `${P}/reseller-portal/deals`], ['GET', `${P}/reseller-portal/deals`],
  ['GET', `${P}/reseller-portal/mdf-summary`], ['POST', `${P}/reseller-portal/mdf-claims`], ['GET', `${P}/reseller-portal/mdf-claims`],
  ['GET', `${P}/reseller-portal/branding`], ['PATCH', `${P}/reseller-portal/branding`],
  ['GET', `${P}/reseller-portal/dashboard/`],
  ['POST', `${P}/auth/login`], ['POST', `${P}/auth/logout`], ['POST', `${P}/auth/logout-all`], ['GET', `${P}/auth/me`],
  ['POST', `${P}/auth/forgot-password`], ['POST', `${P}/auth/reset-password`],
];

function ctx(method: string, url: string, user: any, publicRoute = false) {
  const handler = () => undefined;
  const cls = class T {};
  if (publicRoute) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: url, url, user }) }),
  } as any;
}
const guard = new ResellerScopeGuard(new Reflector());
const run = (method: string, url: string, user: any, publicRoute = false) => {
  try { return guard.canActivate(ctx(method, url, user, publicRoute)); } catch (e) { return e instanceof ForbiddenException ? 'denied' : e; }
};
const user = (role: string) => ({ userId: 'u1', role, schoolSlug: role.startsWith('reseller') || role === 'super_admin' ? undefined : 'school-a', resellerId: role.startsWith('reseller') ? 'r1' : undefined });

describe('ResellerScopeGuard', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
  afterEach(() => { delete process.env.RESELLER_SCOPE_GUARD; jest.restoreAllMocks(); });

  describe.each([UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT])('%s', (role) => {
    it.each(PREVIOUSLY_OPEN)('is denied %s %s', (m, url) => {
      expect(run(m, url, user(role))).toBe('denied');
    });
    it.each(RESELLER_ALLOWED)('is still allowed %s %s', (m, url) => {
      expect(run(m, url, user(role))).toBe(true);
    });
  });

  describe('paths that try to slip through the allowlist', () => {
    it.each([
      ['GET', `${P}/reseller-portal/../students`],
      ['GET', `${P}/reseller-portal/%2e%2e/students`],
      ['GET', `${P}/reseller-portal%2f..%2fstudents`],
      ['GET', `${P}/reseller-portalx/dashboard`],
      ['GET', `${P}/reseller-portal-admin`],
      ['GET', `${P}//students`],
      ['GET', `${P}/reseller-portal//x`],
      ['GET', `/reseller-portal/dashboard`],
      ['GET', `${P}/x/api/v1/reseller-portal/dashboard`],
      ['GET', `${P}/auth/me/avatar`],
      ['POST', `${P}/auth/me`],
      ['GET', `${P}/auth/login`],
      ['GET', `${P}/auth/logout-all`],
      ['POST', `${P}/auth/me?x=/reseller-portal`],
      ['GET', ''],
    ])('%s %s is refused', (m, url) => {
      expect(isResellerAllowed(m, url)).toBe(false);
    });
    it('a query string or fragment does not change the path that is checked', () => {
      expect(isResellerAllowed('GET', `${P}/students?next=${P}/reseller-portal/dashboard`)).toBe(false);
      expect(isResellerAllowed('GET', `${P}/reseller-portal/dashboard?x=1#y`)).toBe(true);
    });
  });

  it('denies are logged with route and user id, never a token', () => {
    run('GET', `${P}/finance/dashboard?token=SECRET`, { ...user(UserRole.RESELLER_ADMIN), userId: 'u-123', token: 'SECRET' });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('/api/v1/finance/dashboard');
    expect(line).toContain('u-123');
    expect(line).not.toContain('SECRET');
  });

  describe('kill switch RESELLER_SCOPE_GUARD', () => {
    it('defaults to enforce; only "off" disables (case/space-insensitive); a typo still enforces', () => {
      expect(resellerScopeMode()).toBe('enforce');
      process.env.RESELLER_SCOPE_GUARD = 'enforce'; expect(resellerScopeMode()).toBe('enforce');
      process.env.RESELLER_SCOPE_GUARD = 'of'; expect(resellerScopeMode()).toBe('enforce');
      process.env.RESELLER_SCOPE_GUARD = ' OFF '; expect(resellerScopeMode()).toBe('off');
    });
    it('off restores the old behaviour (no deny, no log)', () => {
      process.env.RESELLER_SCOPE_GUARD = 'off';
      for (const [m, url] of PREVIOUSLY_OPEN) expect(run(m, url, user(UserRole.RESELLER_ADMIN))).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });
    it('"enforce" explicitly denies', () => {
      process.env.RESELLER_SCOPE_GUARD = 'enforce';
      expect(run('GET', `${P}/finance/dashboard`, user(UserRole.RESELLER_SUPPORT))).toBe('denied');
    });
  });

  describe('every other role is unaffected, enforce and off', () => {
    const others = [UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.TEACHER,
      UserRole.FINANCE_MANAGER, UserRole.HR_MANAGER, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF, UserRole.PARENT, UserRole.STUDENT];
    it.each(others)('%s passes this guard on every sample route', (role) => {
      for (const [m, url] of [...PREVIOUSLY_OPEN, ...RESELLER_ALLOWED]) expect(run(m, url, user(role))).toBe(true);
      process.env.RESELLER_SCOPE_GUARD = 'off';
      for (const [m, url] of PREVIOUSLY_OPEN) expect(run(m, url, user(role))).toBe(true);
    });
    it('a missing user is left to JwtAuthGuard, and public routes are skipped even for a reseller', () => {
      expect(run('GET', `${P}/finance/dashboard`, undefined)).toBe(true);
      expect(run('GET', `${P}/finance/dashboard`, user(UserRole.RESELLER_ADMIN), true)).toBe(true);
    });
    it('a role named in primaryRole (not role) is still recognised as reseller', () => {
      expect(run('GET', `${P}/finance/dashboard`, { userId: 'u', primaryRole: UserRole.RESELLER_ADMIN })).toBe('denied');
    });
  });

  it('is registered globally AFTER JwtAuthGuard (it reads req.user)', () => {
    const providers: any[] = Reflect.getMetadata('providers', AppModule);
    const order = providers.filter((p) => p && p.provide === 'APP_GUARD' || (p && typeof p === 'object' && 'useClass' in p)).map((p) => p.useClass);
    const jwt = order.indexOf(JwtAuthGuard), roles = order.indexOf(RolesGuard), reseller = order.indexOf(ResellerScopeGuard);
    expect(jwt).toBeGreaterThanOrEqual(0);
    expect(reseller).toBeGreaterThan(jwt);
    expect(reseller).toBeGreaterThan(roles);
  });
});
