import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { HrService } from './hr.service';

const T = new Types.ObjectId().toHexString();
const SID = new Types.ObjectId().toHexString();
const UID = new Types.ObjectId().toHexString();
const ACTOR = { userId: new Types.ObjectId().toHexString(), name: 'HR', schoolSlug: 'sch' };

function build(staff: any, opts: { login?: any; payslips?: number } = {}) {
  const calls: string[] = [];
  const svc: any = Object.create(HrService.prototype);
  svc.staffModel = {
    findOne: jest.fn(() => { const r = Promise.resolve(staff); return Object.assign(r, { lean: () => Promise.resolve(staff) }); }),
    updateOne: jest.fn(async () => { calls.push('staff.updateOne'); return {}; }),
    deleteOne: jest.fn(async () => { calls.push('staff.deleteOne'); return {}; }),
    findOneAndUpdate: jest.fn(() => ({ lean: () => { calls.push('staff.findOneAndUpdate'); return Promise.resolve({ ...staff }); } })),
  };
  svc.payslipModel = { countDocuments: jest.fn(async () => opts.payslips ?? 0) };
  svc.staffAttendanceModel = { countDocuments: jest.fn(async () => 0) };
  svc.leaveApplicationModel = { countDocuments: jest.fn(async () => 0) };
  svc.userModel = { findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(opts.login ?? { isActive: true }) }) })), findByIdAndUpdate: jest.fn() };
  svc.accountAccess = {
    deactivateStaffLogin: jest.fn(async () => { calls.push('login.deactivate'); return { outcome: 'deactivated' }; }),
    reactivateStaffLogin: jest.fn(async () => { calls.push('login.reactivate'); return { outcome: 'reactivated' }; }),
  };
  return { svc, calls };
}
const staff = (over: any = {}) => ({ _id: SID, tenantId: T, status: 'active', isActive: true, userId: UID, ...over });

describe('deleteStaff (web Deactivate button, hr.service.ts)', () => {
  it('soft delete deactivates the login BEFORE marking the staff terminated', async () => {
    const { svc, calls } = build(staff());
    await svc.deleteStaff(T, SID, false, ACTOR);
    expect(svc.accountAccess.deactivateStaffLogin).toHaveBeenCalledWith(UID, 'staff_deleted', ACTOR.userId, ACTOR);
    expect(calls).toEqual(['login.deactivate', 'staff.updateOne']);
  });
  it('hard delete revokes the login before the Staff row (and the only pointer) is deleted', async () => {
    const { svc, calls } = build(staff());
    await svc.deleteStaff(T, SID, true, ACTOR);
    expect(svc.accountAccess.deactivateStaffLogin).toHaveBeenCalledWith(UID, 'staff_deleted_permanently', ACTOR.userId, ACTOR);
    expect(calls).toEqual(['login.deactivate', 'staff.deleteOne']);
  });
  it('hard delete refused for payroll history -> login untouched', async () => {
    const { svc } = build(staff(), { payslips: 2 });
    await expect(svc.deleteStaff(T, SID, true, ACTOR)).rejects.toThrow(BadRequestException);
    expect(svc.accountAccess.deactivateStaffLogin).not.toHaveBeenCalled();
  });
  it('staff without a login: nothing to revoke', async () => {
    const { svc } = build(staff({ userId: null }));
    await svc.deleteStaff(T, SID, false, ACTOR);
    expect(svc.accountAccess.deactivateStaffLogin).not.toHaveBeenCalled();
  });
  it('cannot delete / deactivate your own account', async () => {
    const { svc } = build(staff({ userId: ACTOR.userId }));
    await expect(svc.deleteStaff(T, SID, false, ACTOR)).rejects.toThrow('own account');
    expect(svc.accountAccess.deactivateStaffLogin).not.toHaveBeenCalled();
  });
});

describe('updateStaff status changes (web profile status dropdown: raw $set path)', () => {
  it.each(['resigned', 'terminated', 'suspended'])('status -> %s deactivates the login first', async (st) => {
    const { svc, calls } = build(staff());
    await svc.updateStaff(T, SID, { status: st }, ACTOR);
    expect(svc.accountAccess.deactivateStaffLogin).toHaveBeenCalledWith(UID, `staff_status_${st}`, ACTOR.userId, ACTOR);
    expect(calls).toEqual(['login.deactivate', 'staff.findOneAndUpdate']);
  });
  it('isActive:false also revokes', async () => {
    const { svc } = build(staff());
    await svc.updateStaff(T, SID, { isActive: false }, ACTOR);
    expect(svc.accountAccess.deactivateStaffLogin).toHaveBeenCalled();
  });
  it.each(['on_leave', 'probation', 'active'])('status -> %s does NOT revoke', async (st) => {
    const { svc } = build(staff());
    await svc.updateStaff(T, SID, { status: st }, ACTOR);
    expect(svc.accountAccess.deactivateStaffLogin).not.toHaveBeenCalled();
    expect(svc.accountAccess.reactivateStaffLogin).not.toHaveBeenCalled();
  });
  it('already revoked + still revoked status: no second call', async () => {
    const { svc } = build(staff({ status: 'resigned', isActive: false }));
    await svc.updateStaff(T, SID, { status: 'terminated' }, ACTOR);
    expect(svc.accountAccess.deactivateStaffLogin).not.toHaveBeenCalled();
  });
  it('back to active from a revoked status reactivates through the audited path (login first)', async () => {
    const { svc, calls } = build(staff({ status: 'resigned', isActive: false }));
    await svc.updateStaff(T, SID, { status: 'active', isActive: true }, ACTOR);
    expect(svc.accountAccess.reactivateStaffLogin).toHaveBeenCalledWith(UID, 'staff_status_restored', ACTOR.userId, ACTOR);
    expect(calls).toEqual(['login.reactivate', 'staff.findOneAndUpdate']);
  });
  it('an edit that touches no status/isActive does not even read the staff row (e.g. Campuses supervisors)', async () => {
    const { svc } = build(staff());
    await svc.updateStaff(T, SID, { supervisedClusterIds: [] }, ACTOR);
    expect(svc.staffModel.findOne).not.toHaveBeenCalled();
    expect(svc.accountAccess.deactivateStaffLogin).not.toHaveBeenCalled();
  });
  it('cannot set your own status to a revoking value', async () => {
    const { svc } = build(staff({ userId: ACTOR.userId }));
    await expect(svc.updateStaff(T, SID, { status: 'resigned' }, ACTOR)).rejects.toThrow('own account');
  });
});

describe('reactivateStaff', () => {
  it('restores the login first, then the Staff row, and requires a reason', async () => {
    const { svc, calls } = build(staff({ status: 'terminated', isActive: false }));
    await expect(svc.reactivateStaff(T, SID, '  ', ACTOR)).rejects.toThrow('reason is required');
    const r = await svc.reactivateStaff(T, SID, 'Rehired 2027', ACTOR);
    expect(svc.accountAccess.reactivateStaffLogin).toHaveBeenCalledWith(UID, 'Rehired 2027', ACTOR.userId, ACTOR);
    expect(calls).toEqual(['login.reactivate', 'staff.updateOne']);
    expect(r).toMatchObject({ status: 'active', login: 'reactivated' });
  });
  it('a refused (fail-closed) audit leaves the Staff row untouched', async () => {
    const { svc, calls } = build(staff({ status: 'terminated', isActive: false }));
    svc.accountAccess.reactivateStaffLogin = jest.fn().mockRejectedValue(new Error('503'));
    await expect(svc.reactivateStaff(T, SID, 'x', ACTOR)).rejects.toThrow('503');
    expect(calls).toEqual([]);
  });
});

describe('HR password reset / create-login on a deactivated account', () => {
  it('reset-password is refused for a deactivated or demoted login', async () => {
    for (const login of [{ isActive: false }, { isActive: true, staffAccessRevokedAt: new Date() }]) {
      const { svc } = build(staff(), { login });
      await expect(svc.resetPasswordForStaff(T, SID)).rejects.toThrow('deactivated');
      expect(svc.userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    }
  });
  it('create-login explains reactivation instead of the generic duplicate error', async () => {
    const { svc } = build(staff(), { login: { isActive: false } });
    await expect(svc.createLoginForStaff(T, T, SID)).rejects.toThrow('Reactivate');
  });
});
