import { ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HrController } from './hr.controller';
import { HrAccessGuard, hrReadGuardMode } from './guards/hr-access.guard';
import { HR_READ_KEY, HR_STAFF_UPDATE_KEY, HrReadPolicy } from './guards/hr-access.decorator';
import { RolesOrModuleManageGuard } from '../../roles/guards/roles-or-module-manage.guard';
import { ROLES_OR_MODULE_KEY } from '../../roles/decorators/roles-or-module-manage.decorator';
import { PERMISSION_KEY } from '../../auth/decorators';
import { UserRole } from '../../auth/roles.enum';
import { hasPermission } from '../../auth/permissions.matrix';
import { HR_ADMIN_ROLES, PAYROLL_PAY_ROLES, PAYROLL_READ_ROLES } from '../../auth/admin-role-sets';

const proto: any = HrController.prototype;
const handlers = Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor' && typeof proto[n] === 'function' && Reflect.getMetadata('path', proto[n]) !== undefined);
const METHODS: Record<number, string> = { 0: 'GET', 1: 'POST', 2: 'PUT', 3: 'DELETE', 4: 'PATCH' };
const methodOf = (h: string) => METHODS[Reflect.getMetadata('method', proto[h])];
const pathOf = (h: string) => Reflect.getMetadata('path', proto[h]);

const ctx = (h: string, user: any, method?: string): any => {
  const req: any = { user, method: method || methodOf(h), baseUrl: '/api/v1/hr', route: { path: '/' + pathOf(h) } };
  return { getHandler: () => proto[h], getClass: () => HrController, switchToHttp: () => ({ getRequest: () => req }), __req: req };
};
function models(customRoleId?: any, role?: any) {
  return {
    userModel: { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ customRoleId }) }) })) } as any,
    roleModel: { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(role ?? null) }) })) } as any,
  };
}
const readGuard = (m = models()) => new HrAccessGuard(new Reflector(), m.roleModel, m.userModel);
const writeGuard = (m = models()) => new RolesOrModuleManageGuard(new Reflector(), m.roleModel, m.userModel);
// Full request path used by the app: HrAccessGuard (controller) then the global write guard.
async function run(h: string, user: any, m = models()) {
  const c = ctx(h, user);
  await readGuard(m).canActivate(c);
  return writeGuard(m).canActivate(c);
}

describe('HrController route matrix', () => {
  it('covers all 173 routes', () => expect(handlers.length).toBe(173));
  it.each(handlers)('%s has exactly one access policy (or is leave:self)', (h) => {
    const w = Reflect.getMetadata(ROLES_OR_MODULE_KEY, proto[h]);
    const r = Reflect.getMetadata(HR_READ_KEY, proto[h]);
    const p = Reflect.getMetadata(PERMISSION_KEY, proto[h]);
    const su = Reflect.getMetadata(HR_STAFF_UPDATE_KEY, proto[h]);
    expect([w, r, p, su].filter(Boolean)).toHaveLength(1);
    if (methodOf(h) !== 'GET') expect(r).toBeUndefined();
    if (w) expect(w.roles).toEqual(expect.arrayContaining(HR_ADMIN_ROLES));
  });
  it('write allow-lists: HR_ADMIN everywhere, +finance_manager only on pay routes', () => {
    const payRoutes = ['updatePayrollStatus', 'processPayrollBatch', 'payIndividualPayslip'];
    for (const h of handlers) {
      const w = Reflect.getMetadata(ROLES_OR_MODULE_KEY, proto[h]);
      if (!w) continue;
      expect(w.level).toBe('manage');
      expect([...w.roles].sort()).toEqual([...(payRoutes.includes(h) ? PAYROLL_PAY_ROLES : HR_ADMIN_ROLES)].sort());
    }
  });
});

const NON_HR = [UserRole.TEACHER, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF, UserRole.VICE_PRINCIPAL, UserRole.ACADEMIC_COORDINATOR];
const writes = handlers.filter(h => methodOf(h) !== 'GET' && !Reflect.getMetadata(PERMISSION_KEY, proto[h]) && !Reflect.getMetadata(HR_STAFF_UPDATE_KEY, proto[h]));

describe('HR writes (enforced immediately)', () => {
  describe.each(writes)('%s', (h) => {
    it.each([...NON_HR, UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN])('%s -> 403', async (r) => {
      await expect(run(h, { userId: 'u', role: r })).rejects.toThrow(ForbiddenException);
    });
    it.each(HR_ADMIN_ROLES)('%s -> allowed (web HR page / hr_manager)', async (r) => {
      await expect(run(h, { userId: 'u', role: r })).resolves.toBe(true);
    });
    it('custom role with hr manage -> allowed; hr view only / other module -> 403', async () => {
      const t = { userId: 'u', role: UserRole.TEACHER };
      await expect(run(h, t, models('r', { moduleAccess: [{ moduleKey: 'hr', level: 'manage' }] }))).resolves.toBe(true);
      await expect(run(h, t, models('r', { moduleAccess: [{ moduleKey: 'hr', level: 'view' }] }))).rejects.toThrow(ForbiddenException);
      await expect(run(h, t, models('r', { moduleAccess: [{ moduleKey: 'finance', level: 'manage' }] }))).rejects.toThrow(ForbiddenException);
    });
  });
  it('finance_manager: pay routes yes, other payroll/HR writes no', async () => {
    const f = { userId: 'u', role: UserRole.FINANCE_MANAGER };
    for (const h of ['updatePayrollStatus', 'processPayrollBatch', 'payIndividualPayslip']) await expect(run(h, f)).resolves.toBe(true);
    for (const h of ['createPayslip', 'updatePayslip', 'createPayrollRun', 'deletePayrollRun', 'createSalaryComponent', 'updateStaff', 'resetPasswordForStaff']) await expect(run(h, f)).rejects.toThrow(ForbiddenException);
  });
  it('regression named: HR page -> Reset Password / PATCH staff / payroll run for principal and admin still work', async () => {
    for (const r of [UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.INSTITUTION_OWNER])
      for (const h of ['resetPasswordForStaff', 'updateStaff', 'createPayrollRun', 'updatePayslip']) await expect(run(h, { userId: 'u', role: r })).resolves.toBe(true);
  });
  it('leave/self routes are not blocked for teacher (RolesGuard handles leave:self)', async () => {
    for (const h of ['getMyLeaveBalance', 'getMyLeaveHistory', 'createMyLeave'])
      await expect(readGuard().canActivate(ctx(h, { userId: 'u', role: UserRole.TEACHER }))).resolves.toBe(true);
  });
});

describe('parent / student / reseller blocked from ALL /hr routes', () => {
  it.each([UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT])('%s', async (r) => {
    for (const h of handlers) await expect(readGuard().canActivate(ctx(h, { userId: 'u', role: r }))).rejects.toThrow(ForbiddenException);
  });
});

describe('HR reads: log-only vs enforce', () => {
  const pol = (h: string): HrReadPolicy | undefined => Reflect.getMetadata(HR_READ_KEY, proto[h]);
  const reads = handlers.filter(h => methodOf(h) === 'GET' && pol(h) && !pol(h)!.directory);
  const sensitive = reads.filter(h => pol(h)!.enforce);
  const logOnly = reads.filter(h => !pol(h)!.enforce);
  let warn: jest.SpyInstance;
  const saved = process.env.HR_READ_GUARD_MODE;
  beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
  afterEach(() => { warn.mockRestore(); if (saved === undefined) delete process.env.HR_READ_GUARD_MODE; else process.env.HR_READ_GUARD_MODE = saved; });

  it('default mode is log', () => { delete process.env.HR_READ_GUARD_MODE; expect(hrReadGuardMode()).toBe('log'); });

  it('log mode: teacher on a NON-sensitive read (holidays) is ALLOWED and a structured PII-free line is emitted', async () => {
    delete process.env.HR_READ_GUARD_MODE;
    const c = ctx('getHolidays', { userId: 'u1', tenantId: 't1', role: UserRole.TEACHER });
    await expect(readGuard().canActivate(c)).resolves.toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warn.mock.calls[0][0]);
    expect(line).toEqual({ event: 'hr_read_guard', mode: 'log', bucket: 'non_sensitive', decision: 'would_deny', role: 'teacher', method: 'GET', route: '/api/v1/hr/holidays', userId: 'u1', tenantId: 't1' });
  });

  it('sensitive reads are 403 for non-HR staff roles even in LOG mode (no flag needed)', async () => {
    delete process.env.HR_READ_GUARD_MODE;
    expect(sensitive.length).toBe(46);
    for (const r of NON_HR) for (const h of sensitive)
      await expect(readGuard().canActivate(ctx(h, { userId: 'u', tenantId: 't', role: r }))).rejects.toThrow(ForbiddenException);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ bucket: 'sensitive', decision: 'denied' });
  });

  it('sensitive set contains the owner-listed data classes', () => {
    for (const h of ['getPayslips', 'downloadPayslipPdf', 'getPayrollStats', 'getPayrollRuns', 'getPayrollPayments', 'getSalaryComponents', 'getSalaryTemplates', 'getAdvances', 'getStaffById', 'getStaffDocuments'])
      expect(sensitive).toContain(h);
  });

  it('grievances, performance, exit, leave admin views and recruitment reads are in the ENFORCED bucket', () => {
    const paths = sensitive.map(h => '/' + pathOf(h));
    for (const x of ['/grievances', '/grievances/:id', '/performance', '/exit', '/exit-settings', '/leave/balances', '/leave/balances/:staffId', '/leave/balance/:staffId', '/leave/stats', '/leave', '/leave/applications', '/staff/:id/leave', '/recruitment/stats', '/recruitment/jobs', '/recruitment/jobs/:id', '/recruitment/applications', '/recruitment/applications/:id', '/recruitment/interviews', '/hiring-settings', '/lifecycle', '/lifecycle/stats', '/lifecycle/:id'])
      expect(paths).toContain(x);
  });

  it('teacher still reaches My Leave (leave/self/*) in enforce mode: HrAccessGuard passes and the leave:self permission is held', async () => {
    process.env.HR_READ_GUARD_MODE = 'enforce';
    expect(hasPermission(UserRole.TEACHER, 'leave:self')).toBe(true);
    for (const h of ['getMyLeaveBalance', 'getMyLeaveHistory', 'createMyLeave'])
      await expect(readGuard().canActivate(ctx(h, { userId: 'u', tenantId: 't', role: UserRole.TEACHER }))).resolves.toBe(true);
    // while the admin views of leave are closed to the same teacher
    for (const h of ['getLeaveStats', 'getAllLeaveBalances', 'getLeaveBalance'])
      if (proto[h]) await expect(readGuard().canActivate(ctx(h, { userId: 'u', tenantId: 't', role: UserRole.TEACHER }))).rejects.toThrow(ForbiddenException);
  });

  it('log-only reads never 403 in default mode', async () => {
    delete process.env.HR_READ_GUARD_MODE;
    for (const h of logOnly) await expect(readGuard().canActivate(ctx(h, { userId: 'u', tenantId: 't', role: UserRole.TEACHER }))).resolves.toBe(true);
  });

  it('enforce mode: teacher -> 403 on every HR read and the denial is logged', async () => {
    process.env.HR_READ_GUARD_MODE = 'enforce';
    for (const h of reads) await expect(readGuard().canActivate(ctx(h, { userId: 'u', tenantId: 't', role: UserRole.TEACHER }))).rejects.toThrow(ForbiddenException);
    expect(JSON.parse(warn.mock.calls[0][0]).decision).toBe('denied');
  });

  it.each([...HR_ADMIN_ROLES])('%s reads allowed in both modes, nothing logged', async (r) => {
    for (const mode of ['log', 'enforce']) {
      process.env.HR_READ_GUARD_MODE = mode;
      for (const h of reads) await expect(readGuard().canActivate(ctx(h, { userId: 'u', role: r }))).resolves.toBe(true);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('finance_manager may read payroll reads but is logged on non-payroll HR reads', async () => {
    process.env.HR_READ_GUARD_MODE = 'enforce';
    const f = { userId: 'u', tenantId: 't', role: UserRole.FINANCE_MANAGER };
    for (const h of ['getPayrollRuns', 'getPayslips', 'getSalaryComponents']) await expect(readGuard().canActivate(ctx(h, f))).resolves.toBe(true);
    await expect(readGuard().canActivate(ctx('getGrievances', f))).rejects.toThrow(ForbiddenException);
    expect(PAYROLL_READ_ROLES).toContain(UserRole.FINANCE_MANAGER);
  });

  it('custom role with hr view reads in enforce mode; without -> 403', async () => {
    process.env.HR_READ_GUARD_MODE = 'enforce';
    const t = { userId: 'u', tenantId: 't', role: UserRole.TEACHER };
    await expect(readGuard(models('r', { moduleAccess: [{ moduleKey: 'hr', subModuleKey: 'payroll', level: 'view' }] })).canActivate(ctx('getPayslips', t))).resolves.toBe(true);
    await expect(readGuard(models('r', { moduleAccess: [{ moduleKey: 'finance', level: 'manage' }] })).canActivate(ctx('getPayslips', t))).rejects.toThrow(ForbiddenException);
  });

  it('directory reads (staff list, attendance by date) stay open to every staff role in enforce mode', async () => {
    process.env.HR_READ_GUARD_MODE = 'enforce';
    for (const r of NON_HR) for (const h of ['getStaff', 'getAttendance']) {
      const c = ctx(h, { userId: 'u', role: r });
      if (!Reflect.getMetadata(HR_READ_KEY, proto[h])?.directory) continue;
      await expect(readGuard().canActivate(c)).resolves.toBe(true);
      expect(c.__req.hrFullAccess).toBe(false);
    }
  });

  it('an unannotated non-GET handler fails closed', async () => {
    class X { w() {} }
    const c: any = { getHandler: () => X.prototype.w, getClass: () => X, switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u', role: 'admin' }, method: 'POST' }) }) };
    await expect(readGuard().canActivate(c)).rejects.toThrow(ForbiddenException);
  });
});


describe('PATCH /hr/staff/:id (Campuses supervisors path)', () => {
  const upd = (user: any, body: any, m = models()) => {
    const c = ctx('updateStaff', user); c.switchToHttp().getRequest().body = body;
    return readGuard(m).canActivate(c);
  };
  it('is the only handler with the staff-update policy', () => {
    expect(handlers.filter(h => Reflect.getMetadata(HR_STAFF_UPDATE_KEY, proto[h]))).toEqual(['updateStaff']);
  });
  it.each(HR_ADMIN_ROLES)('%s may change any field', async (r) => {
    await expect(upd({ userId: 'u', role: r }, { salary: 1, supervisedClusterIds: [] })).resolves.toBe(true);
  });
  it('web regression: Institution > Campuses sends {supervisedClusterIds} as owner/admin -> allowed', async () => {
    for (const r of [UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN])
      await expect(upd({ userId: 'u', role: r }, { supervisedClusterIds: ['c1'] })).resolves.toBe(true);
  });
  const fullInst = () => models('r', { moduleAccess: [{ moduleKey: 'institution', level: 'manage' }] });
  it('custom role with FULL institution manage: supervisors only', async () => {
    const t = { userId: 'u', role: UserRole.TEACHER };
    await expect(upd(t, { supervisedClusterIds: ['c1'] }, fullInst())).resolves.toBe(true);
    await expect(upd(t, { supervisedClusterIds: ['c1'], salary: 9 }, fullInst())).rejects.toThrow(ForbiddenException);
    await expect(upd(t, { status: 'active' }, fullInst())).rejects.toThrow(ForbiddenException);
    await expect(upd(t, { supervisedClusterIds: 'x' }, fullInst())).rejects.toThrow(ForbiddenException);
    await expect(upd(t, {}, fullInst())).rejects.toThrow(ForbiddenException);
  });
  it('sub-module-only institution grant, view-only, none, teacher -> 403 even for supervisors', async () => {
    const t = { userId: 'u', role: UserRole.TEACHER };
    await expect(upd(t, { supervisedClusterIds: [] }, models('r', { moduleAccess: [{ moduleKey: 'institution', subModuleKey: 'campuses', level: 'manage' }] }))).rejects.toThrow(ForbiddenException);
    await expect(upd(t, { supervisedClusterIds: [] }, models('r', { moduleAccess: [{ moduleKey: 'institution', level: 'view' }] }))).rejects.toThrow(ForbiddenException);
    await expect(upd(t, { supervisedClusterIds: [] })).rejects.toThrow(ForbiddenException);
  });
  it('custom role with hr manage may change any field; parent/student never', async () => {
    await expect(upd({ userId: 'u', role: UserRole.TEACHER }, { salary: 1 }, models('r', { moduleAccess: [{ moduleKey: 'hr', level: 'manage' }] }))).resolves.toBe(true);
    for (const r of [UserRole.PARENT, UserRole.STUDENT]) await expect(upd({ userId: 'u', role: r }, { supervisedClusterIds: [] }, fullInst())).rejects.toThrow(ForbiddenException);
  });
});
