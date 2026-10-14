import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { HrService } from './hr.service';

const T = new Types.ObjectId().toHexString();
const U = new Types.ObjectId().toHexString();

// fake collection that behaves like MongoDB: equality is TYPE-EXACT, $in matches any listed value
function fakeStaff(rows: any[]) {
  const eq = (stored: any, q: any) => {
    const vals = q && q.$in ? q.$in : [q];
    return vals.some((v: any) => typeof v === typeof stored && (typeof v !== 'object' ? v === stored : String(v) === String(stored) && v.constructor === stored.constructor));
  };
  return { findOne: jest.fn((f: any) => Promise.resolve(rows.find(r => eq(r.tenantId, f.tenantId) && eq(r.userId, f.userId)) || null)) };
}
const svc = (rows: any[]) => { const s: any = Object.create(HrService.prototype); s.staffModel = fakeStaff(rows); s.leaveBalanceModel = { findOne: () => ({ lean: () => Promise.resolve(null) }) }; return s as HrService; };

describe('My Leave staff lookup (hr/leave/self/*) matches either id storage type', () => {
  const combos: [string, any, any][] = [
    ['string tenant + string user', T, U],
    ['string tenant + ObjectId user (what create-login writes)', T, new Types.ObjectId(U)],
    ['ObjectId tenant + ObjectId user (seeded data)', new Types.ObjectId(T), new Types.ObjectId(U)],
    ['ObjectId tenant + string user', new Types.ObjectId(T), U],
  ];
  it.each(combos)('%s -> found', async (_n, tenantId, userId) => {
    const s = svc([{ _id: 's1', tenantId, userId }]);
    await expect(s.getOwnStaffRecord(T, U)).resolves.toMatchObject({ _id: 's1' });
  });
  it('never crosses tenants: same user id in another tenant -> 404', async () => {
    const other = new Types.ObjectId().toHexString();
    const s = svc([{ _id: 's1', tenantId: other, userId: U }, { _id: 's2', tenantId: new Types.ObjectId(other), userId: new Types.ObjectId(U) }]);
    await expect(s.getOwnStaffRecord(T, U)).rejects.toThrow(NotFoundException);
  });
  it('another user in the same tenant -> 404', async () => {
    const s = svc([{ _id: 's1', tenantId: T, userId: new Types.ObjectId() }]);
    await expect(s.getOwnStaffRecord(T, U)).rejects.toThrow(NotFoundException);
  });
  it('balance / history / apply all resolve through the same lookup', async () => {
    const s: any = svc([{ _id: 's1', tenantId: T, userId: new Types.ObjectId(U), firstName: 'A', lastName: 'B' }]);
    s.formatLeaveBalance = jest.fn(() => ({ ok: 1 })); s.getLeaveApplications = jest.fn(async () => []); s.createLeaveApplication = jest.fn(async (_t: string, _i: string, d: any) => d);
    await expect(s.getMyLeaveBalance(T, U)).resolves.toEqual({ ok: 1 });
    await expect(s.getMyLeaveApplications(T, U)).resolves.toEqual([]);
    const made = await s.createMyLeaveApplication(T, T, U, { leaveType: 'casual', fromDate: '2026-11-02', toDate: '2026-11-03', reason: 'x', staffId: 'FORGED' });
    expect(made.staffId).toBe('s1'); // always the server-resolved own record
  });
});
