import 'reflect-metadata';
import { ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators';
import { decide, matchRule, normalisePath, altLevel } from './custom-role-policy.rules';
import { CustomRolePolicyGuard, clearCustomRolePolicyCache, customRoleGuardMode } from './guards/custom-role-policy.guard';

// the three custom roles of the live profile matrix, built the way the web admin's buildPayload() builds them
const view = (m: string, sub?: string) => ({ moduleKey: m, level: 'view' as const, ...(sub ? { subModuleKey: sub } : {}) });
const manage = (m: string, sub?: string) => ({ moduleKey: m, level: 'manage' as const, ...(sub ? { subModuleKey: sub } : {}) });
const ROLE_C = [manage('teaching'), view('students'), manage('assessments'), manage('behaviour'), view('academics'), view('school-calendar'), view('events'), manage('early-years'), view('finance')];
const ROLE_D = [view('teaching', 'dashboard'), manage('teaching', 'attendance'), manage('teaching', 'lesson-plans'), manage('teaching', 'timetable'), manage('teaching', 'ptm'), manage('teaching', 'fixtures'), view('students'), manage('assessments'), view('academics')];
const ROLE_E = [view('teaching'), view('students'), view('assessments'), view('behaviour'), view('academics')];
const ok = (access: any[], method: string, url: string) => { const r = matchRule(normalisePath(url)); return r ? decide(r, method, access).allowed : null; };

describe('custom-role-policy rules', () => {
  it('normalisePath strips the api prefix, query and trailing slash', () => {
    expect(normalisePath('/api/v1/students/x?y=1')).toBe('/students/x');
    expect(normalisePath('/api/v1/behaviour/records/')).toBe('/behaviour/records');
    expect(normalisePath('/students')).toBe('/students');
  });
  it('matches the module routes and ignores teaching/finance (already decorated), staff-portal, hr and unknown routes', () => {
    for (const u of ['/students', '/students/abc/360', '/students/attendance/bulk', '/assessments/marks/bulk', '/syllabus/x', '/behaviour/records', '/behaviour/qaida/x', '/academics/curriculum', '/academics/library/books', '/school-calendar/events', '/events/abc']) expect(matchRule(u)).toBeDefined();
    for (const u of ['/teaching/assignments', '/finance/x', '/staff-portal/me', '/hr/leave/self', '/academics/subjects', '/auth/me', '/compliance/safeguarding', '/kb/articles', '/upload/single/x']) expect(matchRule(u)).toBeUndefined();
  });
  it('first match wins: attendance and legacy behaviour under /students are not the generic students rule', () => {
    expect(matchRule('/students/attendance/list')!.name).toBe('student-attendance');
    expect(matchRule('/students/abc/attendance/summary')!.name).toBe('student-attendance');
    expect(matchRule('/students/behaviour')!.name).toBe('students-behaviour');
    expect(matchRule('/students/abc/360')!.name).toBe('students');
    expect(matchRule('/behaviour/students/abc/profile')!.name).toBe('behaviour-records');
    expect(matchRule('/behaviour/character-settings')!.name).toBe('behaviour');
  });
  it('altLevel: sub-specific wins over module-wide (resolveAccessLevel); no sub = best entry of the module', () => {
    expect(altLevel([manage('teaching'), view('teaching', 'attendance')], { module: 'teaching', sub: 'attendance' })).toBe('view');
    expect(altLevel([view('teaching', 'homework')], { module: 'teaching', sub: 'attendance' })).toBe('none');
    expect(altLevel([view('students', 'dashboard')], { module: 'students' })).toBe('view');
    expect(altLevel([view('students', 'dashboard'), manage('students', 'attendance')], { module: 'students' })).toBe('manage');
    expect(altLevel([], { module: 'students' })).toBe('none');
    expect(altLevel(null, { module: 'students' })).toBe('none');
  });
});

describe('profile e: view-only custom role is read-only everywhere', () => {
  it.each([
    ['POST', '/api/v1/students/attendance/bulk'], ['DELETE', '/api/v1/students/attendance/abc'], ['POST', '/api/v1/assessments/marks/bulk'],
    ['POST', '/api/v1/assessments/quiz-attempts/abc/grade'], ['PATCH', '/api/v1/syllabus/abc/mark-topic'], ['POST', '/api/v1/behaviour/records'], ['PUT', '/api/v1/behaviour/tarbiyah/abc'],
    ['POST', '/api/v1/students'], ['POST', '/api/v1/academics/curriculum'], ['PUT', '/api/v1/academics/library/settings'],
  ])('%s %s -> denied', (m, u) => expect(ok(ROLE_E, m, u)).toBe(false));
  it.each([
    '/api/v1/students', '/api/v1/students/abc/360', '/api/v1/students/attendance/list', '/api/v1/assessments', '/api/v1/assessments/marks/list', '/api/v1/syllabus',
    '/api/v1/behaviour/records', '/api/v1/behaviour/tarbiyah', '/api/v1/academics/curriculum', '/api/v1/academics/library/books',
  ])('GET %s -> allowed', (u) => expect(ok(ROLE_E, 'GET', u)).toBe(true));
  it('modules it does not hold (calendar, events) are closed for reads too', () => {
    expect(ok(ROLE_E, 'GET', '/api/v1/school-calendar/events')).toBe(false);
    expect(ok(ROLE_E, 'GET', '/api/v1/events')).toBe(false);
  });
});

describe('profile d: a custom role that REMOVES modules', () => {
  it('behaviour removed: no reads, no writes', () => {
    expect(ok(ROLE_D, 'GET', '/api/v1/behaviour/records')).toBe(false);
    expect(ok(ROLE_D, 'POST', '/api/v1/behaviour/records')).toBe(false);
    expect(ok(ROLE_D, 'GET', '/api/v1/behaviour/tarbiyah')).toBe(false);
    expect(ok(ROLE_D, 'GET', '/api/v1/behaviour/students/abc/profile')).toBe(false);
  });
  it('web parity: the academics:view grant still opens the Syllabus/Curriculum/Library pages (read) but not their writes', () => {
    expect(ok(ROLE_D, 'GET', '/api/v1/syllabus')).toBe(true);
    expect(ok(ROLE_D, 'PATCH', '/api/v1/syllabus/abc/mark-topic')).toBe(false);
    expect(ok(ROLE_D, 'GET', '/api/v1/academics/library/books')).toBe(true);
    expect(ok(ROLE_D, 'POST', '/api/v1/academics/library/books')).toBe(false);
  });
  it('what it still holds keeps working: attendance marking (teaching:attendance manage), marks entry (assessments manage), students read', () => {
    expect(ok(ROLE_D, 'POST', '/api/v1/students/attendance/bulk')).toBe(true);
    expect(ok(ROLE_D, 'POST', '/api/v1/assessments/marks/bulk')).toBe(true);
    expect(ok(ROLE_D, 'GET', '/api/v1/students')).toBe(true);
    expect(ok(ROLE_D, 'POST', '/api/v1/students')).toBe(false);
  });
  it('calendar and events are not held: closed', () => {
    expect(ok(ROLE_D, 'GET', '/api/v1/school-calendar/circulars')).toBe(false);
    expect(ok(ROLE_D, 'GET', '/api/v1/events')).toBe(false);
  });
});

describe('profile c: a custom role that ADDS modules', () => {
  it('manage where granted, view-only where only view is granted', () => {
    expect(ok(ROLE_C, 'POST', '/api/v1/behaviour/records')).toBe(true);
    expect(ok(ROLE_C, 'POST', '/api/v1/students/attendance/bulk')).toBe(true);
    expect(ok(ROLE_C, 'GET', '/api/v1/school-calendar/events')).toBe(true);
    expect(ok(ROLE_C, 'POST', '/api/v1/school-calendar/events')).toBe(false);
    expect(ok(ROLE_C, 'GET', '/api/v1/events')).toBe(true);
    expect(ok(ROLE_C, 'POST', '/api/v1/events')).toBe(false);
  });
  it('acknowledging a circular is a read receipt: view of the calendar is enough', () => {
    expect(ok(ROLE_C, 'POST', '/api/v1/school-calendar/circulars/abc/acknowledge')).toBe(true);
    expect(ok(ROLE_E, 'POST', '/api/v1/school-calendar/circulars/abc/acknowledge')).toBe(false);
  });
});

describe('profile x: an empty custom role', () => {
  it('everything the rules cover is closed', () => {
    for (const [m, u] of [['GET', '/api/v1/students'], ['GET', '/api/v1/assessments'], ['GET', '/api/v1/behaviour/records'], ['GET', '/api/v1/syllabus'], ['GET', '/api/v1/events']]) expect(ok([], m, u)).toBe(false);
  });
});

function guard(user: any, role: any) {
  const userModel: any = { findById: jest.fn(() => ({ select: () => ({ lean: async () => user }) })) };
  const roleModel: any = { findById: jest.fn(() => ({ select: () => ({ lean: async () => role }) })) };
  return { g: new CustomRolePolicyGuard(new Reflector(), roleModel, userModel), userModel, roleModel };
}
const ctx = (req: any, isPublic = false): any => ({ getHandler: () => { const h = () => 0; if (isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, h); return h; }, getClass: () => class X {}, switchToHttp: () => ({ getRequest: () => req }) });
const req = (method: string, originalUrl: string, user: any = { userId: 'u1', role: 'teacher', tenantId: 't', schoolSlug: 's' }) => ({ method, originalUrl, user });
const ENV = 'CUSTOM_ROLE_GUARD_MODE';
let warn: jest.SpyInstance;
beforeEach(() => { clearCustomRolePolicyCache(); delete process.env[ENV]; warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
afterEach(() => { warn.mockRestore(); delete process.env[ENV]; });
const lines = () => warn.mock.calls.map((c) => { try { return JSON.parse(String(c[0])); } catch { return null; } }).filter((x) => x?.event === 'custom_role_guard');

describe('CustomRolePolicyGuard', () => {
  it('mode defaults to log; only the exact word enforce enforces', () => {
    expect(customRoleGuardMode()).toBe('log');
    process.env[ENV] = 'ENFORCE'; expect(customRoleGuardMode()).toBe('enforce');
    process.env[ENV] = 'on'; expect(customRoleGuardMode()).toBe('log');
  });
  it('LOG mode: a would-deny proceeds (true) and writes ONE structured custom_role_guard line without PII', async () => {
    const { g } = guard({ customRoleId: 'r1' }, { moduleAccess: ROLE_E });
    await expect(g.canActivate(ctx(req('POST', '/api/v1/students/attendance/bulk?x=1')))).resolves.toBe(true);
    const l = lines();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ mode: 'log', decision: 'would_deny', reason: 'grant_insufficient', rule: 'student-attendance', required: 'manage', method: 'POST', route: '/students/attendance/bulk', customRoleId: 'r1', role: 'teacher' });
    expect(JSON.stringify(l[0])).not.toMatch(/x=1|body|email/);
  });
  it('ENFORCE mode: the same request is 403 and the line says denied', async () => {
    process.env[ENV] = 'enforce';
    const { g } = guard({ customRoleId: 'r1' }, { moduleAccess: ROLE_E });
    await expect(g.canActivate(ctx(req('POST', '/api/v1/students/attendance/bulk')))).rejects.toBeInstanceOf(ForbiddenException);
    expect(lines()[0]).toMatchObject({ mode: 'enforce', decision: 'denied' });
    await expect(g.canActivate(ctx(req('GET', '/api/v1/students')))).resolves.toBe(true);
  });
  it('a user WITHOUT a custom role is never touched, in either mode, on any route', async () => {
    for (const mode of ['log', 'enforce']) {
      process.env[ENV] = mode; clearCustomRolePolicyCache();
      const { g, roleModel } = guard({ customRoleId: null }, null);
      for (const [m, u] of [['POST', '/api/v1/students/attendance/bulk'], ['GET', '/api/v1/behaviour/records'], ['DELETE', '/api/v1/events/x']]) await expect(g.canActivate(ctx(req(m, u)))).resolves.toBe(true);
      expect(roleModel.findById).not.toHaveBeenCalled();
      expect(lines()).toHaveLength(0);
    }
  });
  it('routes outside the rules, @Public routes, unauthenticated requests and super_admin skip the lookup entirely', async () => {
    process.env[ENV] = 'enforce';
    const { g, userModel } = guard({ customRoleId: 'r1' }, { moduleAccess: [] });
    await expect(g.canActivate(ctx(req('GET', '/api/v1/teaching/assignments')))).resolves.toBe(true);
    await expect(g.canActivate(ctx(req('GET', '/api/v1/staff-portal/me')))).resolves.toBe(true);
    await expect(g.canActivate(ctx({ method: 'GET', originalUrl: '/api/v1/students', user: undefined }))).resolves.toBe(true);
    await expect(g.canActivate(ctx(req('GET', '/api/v1/students', { userId: 'u9', role: 'super_admin' })))).resolves.toBe(true);
    await expect(g.canActivate(ctx(req('GET', '/api/v1/events/public/x'), true))).resolves.toBe(true);
    expect(userModel.findById).not.toHaveBeenCalled();
  });
  it('a deleted (dangling) role fails closed in enforce and logs role_missing in log mode', async () => {
    const { g } = guard({ customRoleId: 'gone' }, null);
    await expect(g.canActivate(ctx(req('GET', '/api/v1/students')))).resolves.toBe(true);
    expect(lines()[0]).toMatchObject({ decision: 'would_deny', reason: 'role_missing' });
    clearCustomRolePolicyCache(); process.env[ENV] = 'enforce';
    await expect(g.canActivate(ctx(req('GET', '/api/v1/students')))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('an empty custom role (moduleAccess []) is closed on covered routes', async () => {
    process.env[ENV] = 'enforce';
    const { g } = guard({ customRoleId: 'r1' }, { moduleAccess: [] });
    await expect(g.canActivate(ctx(req('GET', '/api/v1/behaviour/records')))).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('lookups are cached per user (one user + one role read for several requests)', async () => {
    const { g, userModel, roleModel } = guard({ customRoleId: 'r1' }, { moduleAccess: ROLE_C });
    for (let i = 0; i < 3; i++) await g.canActivate(ctx(req('GET', '/api/v1/students')));
    expect(userModel.findById).toHaveBeenCalledTimes(1); expect(roleModel.findById).toHaveBeenCalledTimes(1);
  });
  it('a DB failure never becomes an allow in enforce (403) and never blocks in log (proceeds)', async () => {
    const userModel: any = { findById: () => { throw new Error('db down'); } };
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const g = new CustomRolePolicyGuard(new Reflector(), {} as any, userModel);
    await expect(g.canActivate(ctx(req('GET', '/api/v1/students')))).resolves.toBe(true);
    process.env[ENV] = 'enforce';
    await expect(g.canActivate(ctx(req('GET', '/api/v1/students')))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
