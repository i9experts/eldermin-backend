import { HrService } from './hr.service';
import { HrController } from './hr.controller';

function svc(captured: { select?: string; update?: any; created?: any }) {
  const s: any = Object.create(HrService.prototype);
  const q: any = {
    select: (f: string) => { captured.select = f; return q; },
    populate: () => q, sort: () => q,
    lean: () => Promise.resolve([{ _id: 'a' }]),
  };
  s.staffModel = {
    find: jest.fn(() => q),
    findOneAndUpdate: jest.fn((_f: any, u: any) => { captured.update = u; return { lean: () => Promise.resolve({ _id: 'a' }) }; }),
    create: jest.fn((d: any) => { captured.created = d; return Promise.resolve(d); }),
    findOne: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve(null) }) })),
  };
  return s as HrService;
}

describe('GET /hr/staff projection', () => {
  const SENSITIVE = ['salary', 'salaryStructure', 'bankDetails', 'identityDocs', 'personal', 'address', 'documents', 'email', 'phone', 'emergency'];
  it('non-HR (default) callers get the projection only', async () => {
    const c: any = {};
    await svc(c).getStaff('t', undefined, undefined, undefined);
    const fields = c.select.split(' ');
    for (const f of SENSITIVE) expect(fields).not.toContain(f);
    expect(fields).toEqual(expect.arrayContaining(['_id', 'firstName', 'lastName', 'designation', 'department', 'campusId', 'avatarUrl']));
  });

  it('projection still carries every field the web dropdown pages read', () => {
    const f = HrService.STAFF_PROJECTION.split(' ');
    const need: Record<string, string[]> = {
      'StaffSelect / behaviour / admissions / home / policies / approvals / delegations / workflows': ['_id', 'firstName', 'lastName', 'designation'],
      'Finance employee picker, ID cards, teaching HRStaffDropdown': ['employeeId', 'department', 'designation', 'campusId'],
      'Institution > Grades class-teacher picker': ['userId'],
      'Institution > Campuses supervisors (owner/admin: full anyway)': ['supervisedClusterIds'],
      'Institution > Departments head (campus filter)': ['campusId'],
    };
    for (const [page, fields] of Object.entries(need)) for (const x of fields) expect([page, f]).toEqual([page, expect.arrayContaining([x])]);
  });

  it('HR/admin callers (full=true) get no projection', async () => {
    const c: any = {};
    await svc(c).getStaff('t', undefined, undefined, undefined, true);
    expect(c.select).toBeUndefined();
  });

  it('controller passes full only when the guard marked the request as HR-allowed', async () => {
    const calls: any[] = [];
    const ctrl = new HrController({ getStaff: (...a: any[]) => calls.push(a) } as any, {} as any);
    ctrl.getStaff({ user: { tenantId: 't' }, hrFullAccess: true } as any);
    ctrl.getStaff({ user: { tenantId: 't' }, hrFullAccess: false } as any);
    ctrl.getStaff({ user: { tenantId: 't' } } as any);
    expect(calls.map(a => a[4])).toEqual([true, false, false]);
  });
});

describe('staff mass-assignment', () => {
  it('PATCH strips userId / tenantId / institutionId / _id (incl. dotted) but keeps status, salary, supervisedClusterIds', async () => {
    const c: any = {};
    await svc(c).updateStaff('t', 's1', { userId: 'x', tenantId: 'y', institutionId: 'z', _id: 'q', 'userId.a': 1, status: 'resigned', salary: 5, supervisedClusterIds: ['c'], firstName: 'N' });
    expect(c.update.$set).toEqual({ status: 'resigned', salary: 5, supervisedClusterIds: ['c'], firstName: 'N' });
  });
  it('POST staff cannot pre-link a login or choose the tenant', async () => {
    const c: any = {};
    await svc(c).createStaff('tenantA', { firstName: 'N', userId: 'victim', tenantId: 'other' });
    expect(c.created.userId).toBeUndefined();
    expect(c.created.tenantId).toBe('tenantA');
  });
});
