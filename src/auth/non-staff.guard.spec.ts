import { Controller, ExecutionContext, Get, INestApplication, Injectable, Logger, Post, CanActivate } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NonStaffGuard, nonStaffGuardMode } from './non-staff.guard';
import { ResellerScopeGuard } from './reseller-scope.guard';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AllowNonStaff, Public, ROLES_KEY } from './decorators';
import { UserRole } from './roles.enum';
import { NON_STAFF_ROLES } from './admin-role-sets';
import { ROLES_OR_MODULE_KEY } from '../roles/decorators/roles-or-module-manage.decorator';
import { AppModule } from '../app.module';
import { ParentPortalController } from '../parent-portal/parent-portal.controller';
import { ParentAuthController } from '../parent-portal/parent-auth.controller';
import { ComplaintsController } from '../complaints/complaints.controller';
import { AuthController } from '../modules/auth/auth.controller';
import { StudentsController } from '../students/students.controller';
import { FinanceController } from '../finance/finance.controller';
import { UploadController } from '../upload/upload.controller';
import { EceController } from '../ece/ece.controller';
import { AssessmentController } from '../assessments/assessment.controller';
import { BehaviourController } from '../behaviour/behaviour.controller';
import { ResellerPortalController } from '../resellers/reseller-portal.controller';
import { OrganizationController } from '../organization/organization.controller';

const reflector = new Reflector();
const guard = new NonStaffGuard(reflector);

const parent = { userId: 'p1', tenantId: 't1', role: 'parent', guardianOfStudentIds: ['s1'] };
const user = (role: any, extra: any = {}) => ({ userId: 'u1', tenantId: 't1', role, ...extra });

/** ExecutionContext for a real controller handler, so the decorators on the real class are what is tested. */
function ctxFor(cls: any, handler: string, u: any, method = 'GET', routePath = '/x/:id'): ExecutionContext {
  const fn = cls.prototype[handler];
  if (typeof fn !== 'function') throw new Error(`${cls.name}.${handler} does not exist`);
  const req: any = { user: u, method, baseUrl: '', route: { path: routePath }, headers: {} };
  return { getHandler: () => fn, getClass: () => cls, switchToHttp: () => ({ getRequest: () => req }) } as any;
}

let warn: jest.SpyInstance;
const logged = () => warn.mock.calls.map((c) => JSON.parse(c[0] as string));
const setMode = (m?: string) => (m === undefined ? delete process.env.NON_STAFF_GUARD_MODE : (process.env.NON_STAFF_GUARD_MODE = m));
beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); setMode(undefined); });
afterEach(() => { warn.mockRestore(); setMode(undefined); });

describe('mode', () => {
  it('defaults to log, only the exact value "enforce" enforces, read per request', () => {
    expect(nonStaffGuardMode()).toBe('log');
    for (const v of ['', 'LOG', 'on', 'true', 'enforced']) { setMode(v); expect(nonStaffGuardMode()).toBe('log'); }
    setMode(' Enforce '); expect(nonStaffGuardMode()).toBe('enforce');
    setMode('log'); expect(nonStaffGuardMode()).toBe('log');
  });
});

describe('decision order (synthetic controller)', () => {
  @Controller('t') class Ctrl {
    @Get('plain') plain() {}
    @Public() @Get('pub') pub() {}
    @AllowNonStaff() @Get('allowed') allowed() {}
  }
  @AllowNonStaff() @Controller('c') class AllowedCtrl { @Get('a') a() {} }

  it('@Public passes with no user and for a parent', () => {
    expect(guard.canActivate(ctxFor(Ctrl, 'pub', undefined))).toBe(true);
    expect(guard.canActivate(ctxFor(Ctrl, 'pub', parent))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
  it('no req.user passes (JwtAuthGuard owns the 401)', () => {
    expect(guard.canActivate(ctxFor(Ctrl, 'plain', undefined))).toBe(true);
    setMode('enforce');
    expect(guard.canActivate(ctxFor(Ctrl, 'plain', undefined))).toBe(true);
  });
  it('every staff role passes, with or without guardianOfStudentIds, in both modes', () => {
    const staff = Object.values(UserRole).filter((r) => !NON_STAFF_ROLES.includes(r));
    expect(staff).toEqual(expect.arrayContaining(['teacher', 'admin', 'hr_manager', 'finance_manager', 'super_admin', 'principal']));
    for (const mode of [undefined, 'enforce']) {
      setMode(mode);
      for (const r of staff) {
        expect(guard.canActivate(ctxFor(Ctrl, 'plain', user(r)))).toBe(true);
        expect(guard.canActivate(ctxFor(Ctrl, 'plain', user(r, { guardianOfStudentIds: ['s9'] })))).toBe(true);
      }
    }
    expect(warn).not.toHaveBeenCalled();
  });
  it('staff role in primaryRole only (no role) is still recognised', () => {
    expect(guard.canActivate(ctxFor(Ctrl, 'plain', { userId: 'u', primaryRole: 'teacher' }))).toBe(true);
  });
  it('non-staff passes on @AllowNonStaff at method level and at class level', () => {
    setMode('enforce');
    for (const r of NON_STAFF_ROLES) {
      expect(guard.canActivate(ctxFor(Ctrl, 'allowed', user(r)))).toBe(true);
      expect(guard.canActivate(ctxFor(AllowedCtrl, 'a', user(r)))).toBe(true);
    }
    expect(warn).not.toHaveBeenCalled();
  });
  it('other non-staff on a plain route: would_deny in log mode (passes), 403 in enforce mode', () => {
    for (const r of ['parent', 'student']) {
      setMode(undefined);
      expect(guard.canActivate(ctxFor(Ctrl, 'plain', user(r)))).toBe(true);
      setMode('enforce');
      expect(() => guard.canActivate(ctxFor(Ctrl, 'plain', user(r)))).toThrow(/staff only/);
    }
    expect(logged().map((l) => l.decision)).toEqual(['would_deny', 'denied', 'would_deny', 'denied']);
  });
  it('parent_lead, unknown and missing roles are denied even on an @AllowNonStaff route', () => {
    for (const r of ['parent_lead', 'mystery', '', undefined]) {
      setMode(undefined);
      expect(guard.canActivate(ctxFor(Ctrl, 'allowed', user(r)))).toBe(true);
      setMode('enforce');
      expect(() => guard.canActivate(ctxFor(Ctrl, 'allowed', user(r)))).toThrow(/staff only/);
    }
    expect(logged()).toHaveLength(8);
  });
  it('a reseller is non-staff: denied on a plain route, allowed where @AllowNonStaff is set', () => {
    for (const r of ['reseller_admin', 'reseller_support']) {
      setMode(undefined);
      expect(guard.canActivate(ctxFor(Ctrl, 'plain', user(r, { resellerId: 'r1' })))).toBe(true);
      setMode('enforce');
      expect(() => guard.canActivate(ctxFor(Ctrl, 'plain', user(r, { resellerId: 'r1' })))).toThrow(/staff only/);
      expect(guard.canActivate(ctxFor(Ctrl, 'allowed', user(r, { resellerId: 'r1' })))).toBe(true);
    }
    expect(logged().filter((l) => l.decision === 'would_deny').map((l) => l.role)).toEqual(['reseller_admin', 'reseller_support']);
  });
});

describe('log line', () => {
  it('has exactly the agreed fields, ids only, route pattern not URL', () => {
    guard.canActivate(ctxFor(StudentsController, 'getStudent', parent, 'GET', '/api/v1/students/:id'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(logged()[0]).toEqual({
      event: 'non_staff_guard', mode: 'log', decision: 'would_deny', role: 'parent',
      method: 'GET', route: '/api/v1/students/:id', userId: 'p1', tenantId: 't1', hasGuardianIds: true,
    });
  });
  it('hasGuardianIds is false for a token without guardian ids; route falls back to (unknown)', () => {
    const c: any = ctxFor(StudentsController, 'getStudent', user('student'));
    c.switchToHttp().getRequest().route = undefined;
    guard.canActivate(c);
    expect(logged()[0]).toMatchObject({ hasGuardianIds: false, route: '(unknown)', role: 'student' });
  });
  it('contains no token, name, email or body', () => {
    guard.canActivate(ctxFor(StudentsController, 'getStudent', { ...parent, name: 'Jane Doe', email: 'j@x.com', phone: '0300' }));
    const line = String(warn.mock.calls[0][0]);
    expect(line).not.toMatch(/Jane|j@x\.com|0300/);
  });
  it('log mode never throws and emits one line per would-be denial', () => {
    expect(() => guard.canActivate(ctxFor(FinanceController, 'getDashboard', parent))).not.toThrow();
    expect(logged()).toHaveLength(1);
  });
});

describe('allow-list: a parent is allowed on every allow-listed route (enforce mode)', () => {
  beforeEach(() => setMode('enforce'));
  const allowed: Array<[string, any, string]> = [
    ['POST /complaints', ComplaintsController, 'createCase'],
    ['GET /auth/me', AuthController, 'getMe'],
    ['POST /auth/logout-all', AuthController, 'logoutAll'],
  ];
  it.each(allowed)('%s', (_n, cls, h) => {
    expect(guard.canActivate(ctxFor(cls, h, parent))).toBe(true);
    expect(guard.canActivate(ctxFor(cls, h, user('student')))).toBe(true);
  });
  it('ParentPortalController is allowed at class level', () => {
    expect(reflector.get('allowNonStaff', ParentPortalController)).toBe(true);
  });
  it('is NOT opened on the complaints reads or the avatar route', () => {
    for (const [cls, h] of [[ComplaintsController, 'getCases'], [ComplaintsController, 'getById'], [ComplaintsController, 'getCaseTypes'],
      [ComplaintsController, 'addRemark'], [AuthController, 'uploadAvatar']] as any[]) {
      expect(() => guard.canActivate(ctxFor(cls, h, parent))).toThrow(/staff only/);
    }
  });
});

describe('sample of UNSAFE routes from the Part A audit', () => {
  const unsafe: Array<[string, any, string]> = [
    ['GET /students/:id', StudentsController, 'getStudent'],
    ['GET /students/:id/360', StudentsController, 'getStudent360'],
    ['GET /finance/dashboard', FinanceController, 'getDashboard'],
    ['DELETE /upload', UploadController, 'deleteFile'],
    ['GET /upload/signed-url', UploadController, 'getSignedUrl'],
    ['GET /complaints/:id', ComplaintsController, 'getById'],
    ['GET /complaints', ComplaintsController, 'getCases'],
    ['GET /ece/children', EceController, 'getChildren'],
    ['GET /assessments', AssessmentController, 'findAll'],
    ['GET /behaviour/records/:id', BehaviourController, 'getRecord'],
  ];
  it.each(unsafe)('%s: parent and student would_deny in log mode, denied in enforce mode', (_n, cls, h) => {
    for (const r of ['parent', 'student']) {
      setMode(undefined);
      expect(guard.canActivate(ctxFor(cls, h, user(r, { guardianOfStudentIds: ['s1'] })))).toBe(true);
      setMode('enforce');
      expect(() => guard.canActivate(ctxFor(cls, h, user(r)))).toThrow(/staff only/);
    }
    expect(logged().map((l) => l.decision)).toEqual(['would_deny', 'denied', 'would_deny', 'denied']);
  });
  it.each(unsafe)('%s: teacher, admin, hr and finance are unchanged', (_n, cls, h) => {
    setMode('enforce');
    for (const r of ['teacher', 'admin', 'hr_manager', 'finance_manager']) expect(guard.canActivate(ctxFor(cls, h, user(r)))).toBe(true);
  });
});

describe('resellers (non-staff roles with their own portal)', () => {
  const resellerRoutes = routesOf(ResellerPortalController);
  const reseller = (r = 'reseller_admin') => user(r, { resellerId: 'r1', schoolSlug: undefined });

  it('ResellerPortalController is allowed at class level and is still @Roles(reseller) only', () => {
    expect(reflector.get('allowNonStaff', ResellerPortalController)).toBe(true);
    expect(reflector.get(ROLES_KEY, ResellerPortalController)).toEqual([UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT]);
  });
  it('a reseller reaches every portal route in enforce mode, with no log line', () => {
    setMode('enforce');
    expect(resellerRoutes.length).toBeGreaterThan(0);
    for (const r of resellerRoutes) {
      for (const role of ['reseller_admin', 'reseller_support']) {
        expect(guard.canActivate(ctxFor(ResellerPortalController, r.name, reseller(role)))).toBe(true);
      }
    }
    expect(warn).not.toHaveBeenCalled();
  });
  it('the allow only relaxes NonStaffGuard: RolesGuard still rejects parent, student and teacher on the portal', () => {
    setMode('enforce');
    const rolesGuard = new RolesGuard(reflector);
    for (const role of ['parent', 'student', 'teacher', 'admin']) {
      const c = ctxFor(ResellerPortalController, resellerRoutes[0].name, user(role));
      expect(() => rolesGuard.canActivate(c)).toThrow(/Required role/);
    }
    // a parent still passes NonStaffGuard here (allow-listed controller); the @Roles guard is what blocks it
    expect(guard.canActivate(ctxFor(ResellerPortalController, resellerRoutes[0].name, parent))).toBe(true);
  });
  const schoolRoutes: Array<[string, any, string]> = [
    ['GET /students/:id', StudentsController, 'getStudent'],
    ['GET /students/:id/360', StudentsController, 'getStudent360'],
    ['GET /finance/dashboard', FinanceController, 'getDashboard'],
    ['DELETE /upload', UploadController, 'deleteFile'],
    ['GET /complaints/:id', ComplaintsController, 'getById'],
    ['GET /ece/children', EceController, 'getChildren'],
    ['GET /assessments', AssessmentController, 'findAll'],
    ['GET /behaviour/records/:id', BehaviourController, 'getRecord'],
    ['GET /organization/class-section-repair/preview', OrganizationController, 'previewClassSectionRepair'],
  ];
  it.each(schoolRoutes)('a reseller is denied on school route %s (would_deny in log mode, 403 in enforce)', (_n, cls, h) => {
    for (const role of ['reseller_admin', 'reseller_support']) {
      setMode(undefined);
      expect(guard.canActivate(ctxFor(cls, h, reseller(role)))).toBe(true);
      setMode('enforce');
      expect(() => guard.canActivate(ctxFor(cls, h, reseller(role)))).toThrow(/staff only/);
    }
    expect(logged().map((l) => l.decision)).toEqual(['would_deny', 'denied', 'would_deny', 'denied']);
    expect(logged()[0]).toMatchObject({ role: 'reseller_admin', hasGuardianIds: false });
  });
});

describe('guard order', () => {
  it('AppModule registers NonStaffGuard directly after JwtAuthGuard then RolesGuard, then ResellerScopeGuard', () => {
    const providers: any[] = Reflect.getMetadata('providers', AppModule);
    const order = providers.filter((p) => p?.provide === APP_GUARD).map((p) => p.useClass);
    expect(order).toEqual([JwtAuthGuard, RolesGuard, NonStaffGuard, ResellerScopeGuard]);
  });

  it('at runtime NonStaffGuard sees req.user set by the preceding auth guard', async () => {
    @Injectable() class FakeJwtAuth implements CanActivate {
      canActivate(c: ExecutionContext) { const r = c.switchToHttp().getRequest(); if (r.headers['x-role']) r.user = user(r.headers['x-role']); return true; }
    }
    @Controller('probe') class Probe { @Get('x') x() { return 'ok'; } @AllowNonStaff() @Post('ok') ok() { return 'ok'; } }
    const mod = await Test.createTestingModule({
      controllers: [Probe],
      providers: [{ provide: APP_GUARD, useClass: FakeJwtAuth }, { provide: APP_GUARD, useClass: NonStaffGuard }],
    }).compile();
    const app: INestApplication = mod.createNestApplication();
    await app.init();
    setMode('enforce');
    try {
      await request(app.getHttpServer()).get('/probe/x').set('x-role', 'parent').expect(403); // 200 would mean it ran before auth
      await request(app.getHttpServer()).get('/probe/x').set('x-role', 'teacher').expect(200);
      await request(app.getHttpServer()).post('/probe/ok').set('x-role', 'parent').expect(201);
      await request(app.getHttpServer()).get('/probe/x').expect(200); // no user: JwtAuthGuard's job
    } finally { await app.close(); }
  });
});

// ── ParentPortalController ──────────────────────────────────────────────────────
function verb(m: number) { return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'][m]; }
function norm(p: string) { return p.replace(/:[A-Za-z]+/g, ':p'); }
function routesOf(cls: any) {
  return Object.getOwnPropertyNames(cls.prototype)
    .filter((n) => n !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, cls.prototype[n]) !== undefined)
    .map((n) => {
      const fn = cls.prototype[n];
      return { name: n, key: `${verb(Reflect.getMetadata(METHOD_METADATA, fn))} ${norm(String(Reflect.getMetadata(PATH_METADATA, fn)))}`, fn };
    });
}

// What the Parent app calls under /parent-portal (from the app's ParentApiService), relative paths.
const APP_PARENT_PORTAL_CALLS = [
  'GET my-students',
  'GET circulars', 'POST circulars/:id/acknowledge', 'GET events',
  'GET students/:id/profile', 'GET students/:id/medical', 'GET students/:id/documents', 'GET students/:id/attendance',
  'GET students/:id/homework', 'POST students/:id/homework/:a/submit',
  'GET students/:id/courses', 'POST students/:id/lessons/progress',
  'GET students/:id/quizzes', 'POST students/:id/quizzes/start', 'POST students/:id/quizzes/:a/submit',
  'GET students/:id/class-diary', 'GET students/:id/class-diary/:d/pdf', 'GET students/:id/learning-resources',
  'GET students/:id/results', 'GET students/:id/dues', 'GET students/:id/behaviour', 'GET students/:id/timetable',
  'GET students/:id/datesheet', 'GET students/:id/library',
  'GET students/:id/consent', 'POST students/:id/consent/:c/respond',
  'GET students/:id/leaves', 'POST students/:id/leaves',
  'GET students/:id/ptm', 'GET students/:id/ptm/teachers', 'POST students/:id/ptm', 'POST students/:id/ptm/:m/cancel',
  'GET students/:id/home-tasks', 'POST students/:id/home-tasks/:t/complete',
  'GET notifications', 'POST notifications/:id/read', 'POST notifications/read-all',
  'GET threads', 'POST threads', 'GET threads/:id/messages', 'POST threads/:id/messages',
];
const STAFF_ONLY_HANDLERS = ['listConsentRequests', 'createConsentRequest', 'getConsentRequestResults', 'closeConsentRequest', 'linkGuardian', 'unlinkGuardian'];

describe('ParentPortalController handler inventory', () => {
  const routes = routesOf(ParentPortalController);
  const known = new Set(APP_PARENT_PORTAL_CALLS.map((c) => { const [m, ...p] = c.split(' '); return `${m} ${norm(p.join(' '))}`; }));

  it('every handler is a known Parent-app route or carries a role guard (a new unguarded handler fails this test)', () => {
    const offenders = routes.filter((r) => {
      const roleGuarded = Reflect.getMetadata(ROLES_KEY, r.fn) || Reflect.getMetadata(ROLES_OR_MODULE_KEY, r.fn);
      return !known.has(r.key) && !roleGuarded;
    }).map((r) => `${r.name} (${r.key})`);
    expect(offenders).toEqual([]);
  });
  it('the 6 staff-only handlers keep their own role guards and none is in the Parent app list', () => {
    for (const h of STAFF_ONLY_HANDLERS) {
      const fn = ParentPortalController.prototype[h as keyof ParentPortalController] as any;
      expect(Reflect.getMetadata(ROLES_KEY, fn) || Reflect.getMetadata(ROLES_OR_MODULE_KEY, fn)).toBeTruthy();
    }
    expect(routes.filter((r) => STAFF_ONLY_HANDLERS.includes(r.name)).every((r) => !known.has(r.key))).toBe(true);
  });
  it('RolesGuard still 403s a parent on the consent-admin handlers even though the class is @AllowNonStaff', () => {
    const rolesGuard = new RolesGuard(reflector);
    for (const h of ['listConsentRequests', 'createConsentRequest', 'getConsentRequestResults', 'closeConsentRequest']) {
      expect(() => rolesGuard.canActivate(ctxFor(ParentPortalController, h, parent))).toThrow(/Required role/);
    }
  });
});

describe('Parent-app regression: enforce mode, parent token', () => {
  beforeEach(() => setMode('enforce'));
  const routes = routesOf(ParentPortalController);

  it.each(APP_PARENT_PORTAL_CALLS)('reaches %s', (call) => {
    const [m, ...p] = call.split(' ');
    const hit = routes.find((r) => r.key === `${m} ${norm(p.join(' '))}`);
    expect(hit).toBeDefined();
    expect(guard.canActivate(ctxFor(ParentPortalController, hit!.name, parent, m))).toBe(true);
  });
  it('covers all 41 parent-portal endpoints (method+path) the app calls that exist on main', () => {
    expect(APP_PARENT_PORTAL_CALLS).toHaveLength(41);
  });
  it('reaches POST /complaints (feedback)', () => {
    expect(guard.canActivate(ctxFor(ComplaintsController, 'createCase', parent, 'POST'))).toBe(true);
  });
  it('reaches the four public auth routes (OTP, register, login) without a user and with a parent token', () => {
    const auth = routesOf(ParentAuthController);
    expect(auth).toHaveLength(4);
    for (const r of auth) {
      expect(guard.canActivate(ctxFor(ParentAuthController, r.name, undefined))).toBe(true);
      expect(guard.canActivate(ctxFor(ParentAuthController, r.name, parent))).toBe(true);
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
