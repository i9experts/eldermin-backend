import { ServiceUnavailableException } from '@nestjs/common';
import { CriticalAuditService } from './critical-audit.service';
import { maskSensitive, toAuditString, MAX_AUDIT_VALUE_CHARS } from './audit-mask.util';
import { HrController } from '../modules/hr/hr.controller';
import { RolesService } from '../roles/roles.service';

function auditModel(opts: { createFails?: boolean } = {}) {
  const rows: any[] = [];
  return {
    rows,
    create: jest.fn(async (d: any) => { if (opts.createFails) throw new Error('mongo down'); const r = { _id: 'a' + rows.length, ...d }; rows.push(r); return r; }),
    updateOne: jest.fn(async (f: any, u: any) => { Object.assign(rows.find(r => r._id === f._id) || {}, u.$set); }),
  } as any;
}
const actor = { schoolSlug: 's1', userId: 'u1', name: 'Pat' };
const meta: any = { module: 'HR: Payroll', action: 'Update payslip', type: 'update', resourceType: 'Payslip', resourceId: 'p1', requested: { net: 5 } };

describe('CriticalAuditService (fail-closed)', () => {
  it('audit write fails -> the change is NOT applied and caller gets 503', async () => {
    const mutate = jest.fn(async () => ({ ok: true }));
    const svc = new CriticalAuditService(auditModel({ createFails: true }));
    await expect(svc.run(actor, meta, async () => ({ net: 1 }), mutate)).rejects.toThrow(ServiceUnavailableException);
    expect(mutate).not.toHaveBeenCalled();
  });
  it('before-state read fails -> change not applied', async () => {
    const mutate = jest.fn();
    const svc = new CriticalAuditService(auditModel());
    await expect(svc.run(actor, meta, async () => { throw new Error('x'); }, mutate)).rejects.toThrow(ServiceUnavailableException);
    expect(mutate).not.toHaveBeenCalled();
  });
  it('no school context -> refused, not applied', async () => {
    const mutate = jest.fn();
    await expect(new CriticalAuditService(auditModel()).run({ ...actor, schoolSlug: '' }, meta, async () => null, mutate)).rejects.toThrow(ServiceUnavailableException);
    expect(mutate).not.toHaveBeenCalled();
  });
  it('success: entry written BEFORE the change as pending with before-state, then finalised with after', async () => {
    const m = auditModel();
    let pendingSeenDuringMutation: any;
    const svc = new CriticalAuditService(m);
    const res = await svc.run(actor, meta, async () => ({ net: 1, bankDetails: { accountNumber: '1234567890' } }), async () => {
      pendingSeenDuringMutation = { ...m.rows[0] };
      return { _id: 'p1', net: 5 };
    });
    expect(res).toEqual({ _id: 'p1', net: 5 });
    expect(pendingSeenDuringMutation.outcome).toBe('pending');
    expect(m.rows[0].outcome).toBe('applied');
    expect(JSON.parse(m.rows[0].oldValue).net).toBe(1);
    expect(m.rows[0].oldValue).not.toContain('1234567890');
    expect(JSON.parse(m.rows[0].newValue).net).toBe(5);
  });
  it('mutation throws -> entry marked failed and error rethrown', async () => {
    const m = auditModel();
    await expect(new CriticalAuditService(m).run(actor, meta, async () => null, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(m.rows[0].outcome).toBe('failed');
  });
  it('finalise failure is logged but does not undo or fail the applied change', async () => {
    const m = auditModel(); m.updateOne = jest.fn().mockRejectedValue(new Error('down'));
    await expect(new CriticalAuditService(m).run(actor, meta, async () => null, async () => 'done')).resolves.toBe('done');
  });
});

describe('payroll + roles routes use it', () => {
  it('PATCH /hr/payslips/:id with audit down -> hrService.updatePayslip never called', async () => {
    const hr: any = { updatePayslip: jest.fn(), loadForAudit: jest.fn(async () => ({ net: 1 })) };
    const ctrl = new HrController(hr, new CriticalAuditService(auditModel({ createFails: true })));
    await expect((ctrl as any).updatePayslip({ user: { tenantId: 't', schoolSlug: 's', userId: 'u' }, headers: {} }, 'p1', { net: 9 })).rejects.toThrow(ServiceUnavailableException);
    expect(hr.updatePayslip).not.toHaveBeenCalled();
  });
  it.each([
    ['createPayrollRun', [{}]], ['updatePayrollStatus', ['id', { status: 'approved' }]], ['processPayrollBatch', ['id', { rows: [] }]],
    ['deletePayrollRun', ['id']], ['createPayslip', [{}]], ['payIndividualPayslip', ['id', {}]], ['createSalaryComponent', [{}]],
    ['updateSalaryComponent', ['id', {}]], ['deleteSalaryComponent', ['id']], ['createSalaryTemplate', [{}]], ['updateSalaryTemplate', ['id', {}]],
    ['deleteSalaryTemplate', ['id']], ['setStaffSalaryStructure', ['id', { lines: [] }]], ['recomputePayslipTotals', [{ dryRun: false }]], ['syncPayslipStatuses', []],
  ])('%s: audit down -> not applied', async (fn, args) => {
    const calls: string[] = [];
    const hr: any = new Proxy({}, { get: (_t, k) => (k === 'loadForAudit' ? async () => ({}) : (..._a: any[]) => { calls.push(String(k)); return {}; }) });
    const ctrl: any = new HrController(hr, new CriticalAuditService(auditModel({ createFails: true })));
    const req = { user: { tenantId: 't', schoolSlug: 's', userId: 'u' }, headers: {} };
    const a = fn === 'syncPayslipStatuses' ? [req] : fn === 'recomputePayslipTotals' || fn === 'createPayrollRun' || fn === 'createPayslip' || fn === 'createSalaryComponent' || fn === 'createSalaryTemplate' ? [req, args[0]] : [req, ...args];
    await expect(ctrl[fn](...a)).rejects.toThrow(ServiceUnavailableException);
    expect(calls).toEqual([]);
  });
  it('role assign / create / update / delete with audit down -> database untouched', async () => {
    const T = '507f1f77bcf86cd799439011', U = '507f1f77bcf86cd799439012', R = '507f1f77bcf86cd799439013';
    const chain = (v: any) => ({ select: () => ({ lean: () => Promise.resolve(v) }), lean: () => Promise.resolve(v) });
    const save = jest.fn();
    const role: any = { _id: R, name: 'r', schoolSlug: 's', isSystemDefault: false, moduleAccess: [], save };
    const userModel: any = {
      findById: () => chain({ customRoleId: null }),
      findOne: () => chain({ _id: U, primaryRole: 'teacher' }),
      findOneAndUpdate: jest.fn(),
      countDocuments: jest.fn(async () => 0),
    };
    const ctor: any = function (this: any, d: any) { Object.assign(this, d); this.save = save; };
    ctor.findOne = (q: any) => { const v = q?._id ? role : null; return Object.assign(Promise.resolve(v), { lean: () => Promise.resolve(v) }); };
    ctor.findById = () => chain(null);
    ctor.deleteOne = jest.fn();
    const svc = new RolesService(ctor, userModel, new CriticalAuditService(auditModel({ createFails: true })));
    const a: any = { userId: 'admin', role: 'admin', tenantId: T, schoolSlug: 's', userName: 'A' };
    await expect(svc.assignRole(a, U, R)).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.assignRole(a, U, null)).rejects.toThrow(ServiceUnavailableException);
    expect(userModel.findOneAndUpdate).not.toHaveBeenCalled();
    await expect(svc.updateRole(a, R, { description: 'x' })).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.createRole(a, { name: 'N2', moduleAccess: [] } as any)).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.deleteRole(a, R)).rejects.toThrow(ServiceUnavailableException);
    expect(save).not.toHaveBeenCalled();
    expect(ctor.deleteOne).not.toHaveBeenCalled();
  });
});

describe('audit masking', () => {
  it('redacts secrets and masks bank / national id values', () => {
    const out: any = maskSensitive({
      passwordHash: 'abc', tempPassword: 'Welcome1!', resetPasswordTokenHash: 'h', token: 't',
      bankDetails: { bankName: 'HBL', accountNumber: '0011223344556', iban: 'PK36SCBL0000001123456702' },
      identityDocs: { cnic: '35202-1234567-1', passport: 'AB1234567' },
      cnic: '35202-1234567-1', net: 123.5, name: 'Ali',
    });
    expect(out.passwordHash).toBe('[REDACTED]'); expect(out.tempPassword).toBe('[REDACTED]');
    expect(out.resetPasswordTokenHash).toBe('[REDACTED]'); expect(out.token).toBe('[REDACTED]');
    expect(out.bankDetails.accountNumber).toBe('****4556'); expect(out.bankDetails.iban).toBe('****6702'); expect(out.bankDetails.bankName).toBe('****HBL');
    expect(out.identityDocs.cnic).toBe('****67-1');
    expect(out.cnic).toBe('****67-1'); expect(out.net).toBe(123.5); expect(out.name).toBe('Ali');
    const s = JSON.stringify(out);
    for (const secret of ['0011223344556', 'PK36SCBL0000001123456702', '35202-1234567-1', 'Welcome1!', 'AB1234567']) expect(s).not.toContain(secret);
  });
  it('caps size', () => {
    expect((toAuditString({ x: 'a'.repeat(20000) }) as string).length).toBeLessThan(MAX_AUDIT_VALUE_CHARS + 20);
  });
});
