// B0: BehaviourAccessGuard role x route matrix, log vs enforce, parent/student always denied.
import { ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BehaviourController } from './behaviour.controller';
import { BehaviourAccessGuard } from './guards/behaviour-access.guard';
import {
  BEHAVIOUR_POLICY_KEY, BehaviourPolicy, BehaviourPolicyKind, assertStaffAccount, behaviourGuardMode,
} from './behaviour-access';
import { UserRole } from '../auth/roles.enum';

const proto: any = BehaviourController.prototype;
const METHODS: Record<number, string> = { 0: 'GET', 1: 'POST', 2: 'PUT', 3: 'DELETE', 4: 'PATCH' };
const handlers = Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor' && typeof proto[n] === 'function' && Reflect.getMetadata('path', proto[n]) !== undefined);
const methodOf = (h: string) => METHODS[Reflect.getMetadata('method', proto[h])];
const pathOf = (h: string) => Reflect.getMetadata('path', proto[h]);
const policyOf = (h: string): BehaviourPolicy => Reflect.getMetadata(BEHAVIOUR_POLICY_KEY, proto[h]);

const ctx = (h: string, user: any): any => {
  const req: any = { user, method: methodOf(h), baseUrl: '/api/v1/behaviour', route: { path: '/' + pathOf(h) } };
  return { getHandler: () => proto[h], getClass: () => BehaviourController, switchToHttp: () => ({ getRequest: () => req }), __req: req };
};
function models(moduleAccess?: any[]) {
  const customRoleId = moduleAccess ? 'r1' : undefined;
  return {
    userModel: { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ customRoleId }) }) })) } as any,
    roleModel: { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(moduleAccess ? { moduleAccess } : null) }) })) } as any,
  };
}
const guard = (m = models()) => new BehaviourAccessGuard(new Reflector(), m.roleModel, m.userModel);
const user = (role: string) => ({ role, userId: 'u1', tenantId: 't1', schoolSlug: 'demo' });

// One representative handler per policy kind.
const REP: Record<BehaviourPolicyKind, string> = {
  staff_read: 'getRecords', meta_read: 'getCharacterSettings', aggregate_read: 'getDashboard',
  record_write: 'createRecord', confidential_read: 'getCounselling', confidential_write: 'createCounselling', settings_write: 'updateCharacterSettings',
};

const ALL_STAFF = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.VICE_PRINCIPAL,
  UserRole.ACADEMIC_COORDINATOR, UserRole.TEACHER, UserRole.FINANCE_MANAGER, UserRole.HR_MANAGER, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF,
];
const NON_STAFF = [UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT];

// Expected ALLOWED base roles per policy kind (the access matrix the report documents).
const ADMINS = [UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.VICE_PRINCIPAL];
const EXPECTED: Record<BehaviourPolicyKind, UserRole[]> = {
  staff_read: [...ADMINS, UserRole.ACADEMIC_COORDINATOR, UserRole.TEACHER],
  meta_read: [...ADMINS, UserRole.ACADEMIC_COORDINATOR, UserRole.TEACHER],
  aggregate_read: [...ADMINS, UserRole.ACADEMIC_COORDINATOR],
  record_write: [...ADMINS, UserRole.ACADEMIC_COORDINATOR, UserRole.TEACHER],
  confidential_read: ADMINS,
  confidential_write: ADMINS,
  settings_write: [UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.PRINCIPAL],
};

const ORIGINAL = process.env.BEHAVIOUR_GUARD_MODE;
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
afterEach(() => { warn.mockRestore(); if (ORIGINAL === undefined) delete process.env.BEHAVIOUR_GUARD_MODE; else process.env.BEHAVIOUR_GUARD_MODE = ORIGINAL; });
const events = () => warn.mock.calls.map(c => { try { return JSON.parse(String(c[0])); } catch { return null; } }).filter(e => e?.event === 'behaviour_guard');

describe('BehaviourController route policy table', () => {
  it('covers all 28 routes and every one has exactly one policy', () => {
    expect(handlers.length).toBe(28);
    for (const h of handlers) expect(policyOf(h)).toBeDefined();
  });

  it('maps routes to the documented policy kinds', () => {
    const kind = (h: string) => policyOf(h).kind;
    expect(['getDashboard', 'getTarbiyahAnalytics', 'getTarbiyahReport', 'getReport'].map(kind)).toEqual(Array(4).fill('aggregate_read'));
    expect(['getRecords', 'getRecord', 'getStudentProfile', 'getTarbiyah'].map(kind)).toEqual(Array(4).fill('staff_read'));
    expect(['getTarbiyahTraits', 'getCharacterSettings'].map(kind)).toEqual(['meta_read', 'meta_read']);
    expect(['createRecord', 'updateRecord', 'resolveRecord', 'createTarbiyah', 'updateTarbiyah'].map(kind)).toEqual(Array(5).fill('record_write'));
    expect(kind('updateCharacterSettings')).toBe('settings_write');
    for (const h of ['getCounselling', 'getInterventions', 'getContracts']) expect(kind(h)).toBe('confidential_read');
    for (const h of ['createCounselling', 'updateCounselling', 'completeCounselling', 'createIntervention', 'updateIntervention', 'addProgress', 'updateAction', 'createContract', 'signContract']) {
      expect(kind(h)).toBe('confidential_write');
    }
  });

  it('every read is a GET and no write route is annotated as a read', () => {
    for (const h of handlers) {
      const read = ['staff_read', 'meta_read', 'aggregate_read', 'confidential_read'].includes(policyOf(h).kind);
      expect(methodOf(h) === 'GET').toBe(read);
    }
  });
});

describe('BehaviourAccessGuard: parent / student / reseller tokens are denied in BOTH modes', () => {
  it.each(['log', 'enforce'])('mode=%s: every /behaviour route 403 for non-staff roles', async (mode) => {
    process.env.BEHAVIOUR_GUARD_MODE = mode;
    for (const h of handlers) {
      for (const role of NON_STAFF) {
        await expect(guard().canActivate(ctx(h, user(role)))).rejects.toThrow(ForbiddenException);
      }
    }
    expect(events().every(e => e.decision === 'denied' && e.reason === 'non_staff_token')).toBe(true);
  });

  it('missing user / missing role is 403', async () => {
    await expect(guard().canActivate(ctx('getRecords', undefined))).rejects.toThrow(ForbiddenException);
    await expect(guard().canActivate(ctx('getRecords', { userId: 'u1' }))).rejects.toThrow(ForbiddenException);
  });

  it('a parent with a custom role id is still denied (custom roles never rescue a parent)', async () => {
    process.env.BEHAVIOUR_GUARD_MODE = 'log';
    const m = models([{ moduleKey: 'behaviour', level: 'manage' }]);
    await expect(guard(m).canActivate(ctx('getRecords', user(UserRole.PARENT)))).rejects.toThrow(ForbiddenException);
    expect(m.userModel.findById).not.toHaveBeenCalled();
  });

  it('assertStaffAccount (students/pdf routes) rejects the same roles', () => {
    for (const role of NON_STAFF) expect(() => assertStaffAccount({ role })).toThrow(ForbiddenException);
    expect(() => assertStaffAccount({ primaryRole: 'parent' })).toThrow(ForbiddenException);
    expect(() => assertStaffAccount(undefined)).toThrow(ForbiddenException);
    for (const role of ALL_STAFF) expect(() => assertStaffAccount({ role })).not.toThrow();
  });
});

describe('BehaviourAccessGuard: enforce mode role x policy matrix', () => {
  beforeEach(() => { process.env.BEHAVIOUR_GUARD_MODE = 'enforce'; });

  for (const kind of Object.keys(EXPECTED) as BehaviourPolicyKind[]) {
    it.each(ALL_STAFF)(`${kind}: %s`, async (role) => {
      const allowed = EXPECTED[kind].includes(role);
      const run = guard().canActivate(ctx(REP[kind], user(role)));
      if (allowed) await expect(run).resolves.toBe(true);
      else await expect(run).rejects.toThrow(ForbiddenException);
    });
  }

  it('every handler of a kind behaves like its representative (teacher + finance_manager spot check)', async () => {
    for (const h of handlers) {
      const k = policyOf(h).kind;
      for (const role of [UserRole.TEACHER, UserRole.FINANCE_MANAGER, UserRole.PRINCIPAL]) {
        const allowed = EXPECTED[k].includes(role);
        const run = guard().canActivate(ctx(h, user(role)));
        if (allowed) await expect(run).resolves.toBe(true); else await expect(run).rejects.toThrow(ForbiddenException);
      }
    }
  });

  it('teacher reads are allowed but flagged for class scoping; admins are elevated', async () => {
    const c = ctx('getRecords', user(UserRole.TEACHER));
    await guard().canActivate(c);
    expect(c.__req.behaviourAccess).toMatchObject({ isTeacher: true, elevated: false, enforce: true, mode: 'enforce' });
    const a = ctx('getRecords', user(UserRole.PRINCIPAL));
    await guard().canActivate(a);
    expect(a.__req.behaviourAccess).toMatchObject({ isTeacher: false, elevated: true });
  });

  it('a handler without a policy fails closed', async () => {
    const c = ctx('getRecords', user(UserRole.PRINCIPAL));
    c.getHandler = () => function noPolicy() { /* no metadata */ };
    await expect(guard().canActivate(c)).rejects.toThrow(ForbiddenException);
  });

  it('logs a structured denied event without PII', async () => {
    await expect(guard().canActivate(ctx('getDashboard', user(UserRole.TEACHER)))).rejects.toThrow(ForbiddenException);
    const [e] = events();
    expect(e).toMatchObject({ event: 'behaviour_guard', mode: 'enforce', decision: 'denied', role: 'teacher', method: 'GET', route: '/api/v1/behaviour/dashboard', userId: 'u1', schoolId: 't1', reason: 'role_not_permitted:aggregate_read' });
    expect(JSON.stringify(e)).not.toMatch(/token|password|email/i);
  });
});

describe('BehaviourAccessGuard: log mode (default) allows staff and logs would-deny', () => {
  it('default mode is log', () => { delete process.env.BEHAVIOUR_GUARD_MODE; expect(behaviourGuardMode()).toBe('log'); });
  it.each(['', 'LOG', 'nonsense'])('BEHAVIOUR_GUARD_MODE=%p stays in log mode', (v) => { process.env.BEHAVIOUR_GUARD_MODE = v; expect(behaviourGuardMode()).toBe('log'); });
  it('BEHAVIOUR_GUARD_MODE=Enforce (any case) enforces', () => { process.env.BEHAVIOUR_GUARD_MODE = ' Enforce '; expect(behaviourGuardMode()).toBe('enforce'); });

  it('every staff role passes every route in log mode (web behaviour unchanged)', async () => {
    delete process.env.BEHAVIOUR_GUARD_MODE;
    for (const h of handlers) for (const role of ALL_STAFF) await expect(guard().canActivate(ctx(h, user(role)))).resolves.toBe(true);
  });

  it('would-deny cases are logged, allowed cases are silent', async () => {
    delete process.env.BEHAVIOUR_GUARD_MODE;
    await guard().canActivate(ctx('getDashboard', user(UserRole.TEACHER)));
    await guard().canActivate(ctx('getDashboard', user(UserRole.PRINCIPAL)));
    await guard().canActivate(ctx('getCounselling', user(UserRole.TEACHER)));
    const ev = events();
    expect(ev).toHaveLength(2);
    expect(ev.every(e => e.mode === 'log' && e.decision === 'would_deny' && e.role === 'teacher')).toBe(true);
    expect(ev.map(e => e.route)).toEqual(['/api/v1/behaviour/dashboard', '/api/v1/behaviour/counselling']);
  });
});

describe('BehaviourAccessGuard: custom roles', () => {
  beforeEach(() => { process.env.BEHAVIOUR_GUARD_MODE = 'enforce'; });

  it('module-wide behaviour grant (stock Teacher-style) opens reads/writes but NOT counselling/interventions/settings', async () => {
    const m = () => models([{ moduleKey: 'behaviour', level: 'manage' }]);
    await expect(guard(m()).canActivate(ctx('getRecords', user(UserRole.SUPPORT_STAFF)))).resolves.toBe(true);
    await expect(guard(m()).canActivate(ctx('createRecord', user(UserRole.SUPPORT_STAFF)))).resolves.toBe(true);
    await expect(guard(m()).canActivate(ctx('getDashboard', user(UserRole.SUPPORT_STAFF)))).resolves.toBe(true);
    await expect(guard(m()).canActivate(ctx('getCounselling', user(UserRole.SUPPORT_STAFF)))).rejects.toThrow(ForbiddenException);
    await expect(guard(m()).canActivate(ctx('createIntervention', user(UserRole.SUPPORT_STAFF)))).rejects.toThrow(ForbiddenException);
    await expect(guard(m()).canActivate(ctx('updateCharacterSettings', user(UserRole.SUPPORT_STAFF)))).rejects.toThrow(ForbiddenException);
  });

  it('sub-module-specific grants: counselling view reads only; manage writes; neither leaks to interventions', async () => {
    const view = () => models([{ moduleKey: 'behaviour', subModuleKey: 'counselling', level: 'view' }]);
    const manage = () => models([{ moduleKey: 'behaviour', subModuleKey: 'counselling', level: 'manage' }]);
    await expect(guard(view()).canActivate(ctx('getCounselling', user(UserRole.SUPPORT_STAFF)))).resolves.toBe(true);
    await expect(guard(view()).canActivate(ctx('createCounselling', user(UserRole.SUPPORT_STAFF)))).rejects.toThrow(ForbiddenException);
    await expect(guard(manage()).canActivate(ctx('createCounselling', user(UserRole.SUPPORT_STAFF)))).resolves.toBe(true);
    await expect(guard(manage()).canActivate(ctx('getInterventions', user(UserRole.SUPPORT_STAFF)))).rejects.toThrow(ForbiddenException);
  });

  it('a sub-module manage grant is "elevated" (may edit others\' Tarbiyah); a module-wide one is not', async () => {
    const sub = ctx('updateTarbiyah', user(UserRole.SUPPORT_STAFF));
    await guard(models([{ moduleKey: 'behaviour', subModuleKey: 'tarbiyah', level: 'manage' }])).canActivate(sub);
    expect(sub.__req.behaviourAccess.elevated).toBe(true);
    const wide = ctx('updateTarbiyah', user(UserRole.SUPPORT_STAFF));
    await guard(models([{ moduleKey: 'behaviour', level: 'manage' }])).canActivate(wide);
    expect(wide.__req.behaviourAccess.elevated).toBe(false);
  });

  it('a grant on another module (e.g. hr) opens nothing; lookup failure fails closed', async () => {
    await expect(guard(models([{ moduleKey: 'hr', level: 'manage' }])).canActivate(ctx('getRecords', user(UserRole.SUPPORT_STAFF)))).rejects.toThrow(ForbiddenException);
    const broken: any = { userModel: { findById: () => { throw new Error('db down'); } }, roleModel: {} };
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(guard(broken).canActivate(ctx('getRecords', user(UserRole.SUPPORT_STAFF)))).rejects.toThrow(ForbiddenException);
  });

  it('settings are base-role only: even a sub-module manage grant does not open PUT /character-settings', async () => {
    const m = models([{ moduleKey: 'behaviour', subModuleKey: 'tarbiyah', level: 'manage' }]);
    await expect(guard(m).canActivate(ctx('updateCharacterSettings', user(UserRole.SUPPORT_STAFF)))).rejects.toThrow(ForbiddenException);
  });
});
