import { Types } from 'mongoose';
import { ComplianceService } from './compliance.service';

const SCHOOL = 'demo-school';
const UID = new Types.ObjectId().toHexString();
const CAMPUS_ID = new Types.ObjectId().toHexString();

function build(cases: any[] = []) {
  const safeguardingModel: any = {
    find: jest.fn(() => ({ sort: () => ({ skip: () => ({ limit: () => Promise.resolve(cases) }) }) })),
    countDocuments: jest.fn(() => Promise.resolve(cases.length)),
  };
  const saved: any[] = [];
  const auditModel: any = jest.fn().mockImplementation((data: any) => {
    saved.push(data);
    return { save: jest.fn(async () => data) };
  });
  const noop: any = {};
  const svc = new ComplianceService(
    noop, noop, safeguardingModel, auditModel, noop, noop, noop, noop, noop, noop, noop,
  );
  return { svc, saved };
}

describe('Safeguarding case reads write a real AuditLog entry ("access is logged")', () => {
  it('viewing the case list writes a correctly-shaped read audit entry', async () => {
    const { svc, saved } = build([{ _id: 'c1', title: 'Concern A' }]);
    const requestingUser = { userId: UID, role: 'principal', campusId: CAMPUS_ID } as any;
    await svc.getSafeguardingCases(SCHOOL, {}, requestingUser, 'Principal Jane');

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      type: 'read',
      module: 'Safeguarding',
      resourceType: 'SafeguardingCase',
      performedBy: 'Principal Jane',
      schoolSlug: SCHOOL,
    });
    expect(String(saved[0].performedById)).toBe(UID);
  });

  it('still logs even when no viewer name is supplied, falling back to the userId', async () => {
    const { svc, saved } = build([]);
    await svc.getSafeguardingCases(SCHOOL, {}, { userId: UID, role: 'principal', campusId: CAMPUS_ID } as any);
    expect(saved[0].performedBy).toBe(UID);
  });

  it('does not throw and still returns the case list even if performedById is not a valid ObjectId', async () => {
    const { svc, saved } = build([{ _id: 'c1' }]);
    const result = await svc.getSafeguardingCases(SCHOOL, {}, { userId: 'not-an-id', role: 'principal', campusId: CAMPUS_ID } as any, 'Someone');
    expect(result.data).toEqual([{ _id: 'c1' }]);
    expect(saved[0].performedById).toBeUndefined();
  });
});
