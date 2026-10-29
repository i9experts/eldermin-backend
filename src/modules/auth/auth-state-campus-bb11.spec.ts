import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthStateService } from './auth-state.service';

// BB11: a campus-scoped staff token with no campusId gets the campus derived from the account (nothing written, nothing invented).
const UID = new Types.ObjectId().toHexString(), TID = new Types.ObjectId().toHexString();
const C1 = new Types.ObjectId(), C2 = new Types.ObjectId();
const lean = (v: any) => ({ select: () => ({ lean: async () => v, limit: () => ({ lean: async () => v }) }) });
beforeEach(() => { delete process.env.AUTH_STATE_CHECK; process.env.AUTH_STATE_CACHE_TTL_MS = '0'; });
afterEach(() => { delete process.env.AUTH_STATE_CACHE_TTL_MS; delete process.env.AUTH_STATE_CHECK; });

function build(o: { staff?: any[]; profile?: any; campuses?: any[] } = {}) {
  const campusModel: any = { find: jest.fn(() => lean(o.campuses ?? [])) };
  const profileModel: any = { findOne: jest.fn(() => lean(o.profile ?? null)) };
  const s = new AuthStateService(
    { findOne: () => lean({ isActive: true }) } as any, { findOne: () => lean({ status: 'active' }) } as any,
    { find: () => lean(o.staff ?? []) } as any, campusModel, profileModel,
  );
  return { s, campusModel, profileModel };
}
const tok = (role = 'teacher', over: any = {}) => ({ sub: UID, tv: 0, role, tenantId: TID, schoolSlug: 'demo', ...over });
const staff = (over: any = {}) => ({ _id: new Types.ObjectId(), isActive: true, ...over });

describe('AuthStateService.check: derived campus (BB11)', () => {
  it('Staff.campusId first (a campus assigned AFTER sign-in reaches the old token)', async () => {
    const { s, campusModel } = build({ staff: [staff({ campusId: C1 })], campuses: [{ _id: C2 }] });
    expect(await s.check(tok())).toEqual({ campusId: String(C1) });
    expect(campusModel.find).not.toHaveBeenCalled();
  });
  it('no campus on the staff row: the teacher profile\'s campus', async () => {
    const { s } = build({ staff: [staff()], profile: { campusId: C2 } });
    expect(await s.check(tok())).toEqual({ campusId: String(C2) });
  });
  it('no campus anywhere but the school has exactly ONE active campus: that campus (the login fallback, now also for old tokens and /me-less flows)', async () => {
    const { s, campusModel } = build({ staff: [staff()], campuses: [{ _id: C1 }] });
    expect(await s.check(tok())).toEqual({ campusId: String(C1) });
    expect(campusModel.find).toHaveBeenCalledWith({ schoolSlug: 'demo', isActive: true });
  });
  it('a multi-campus school with no campus on the staff row stays campus-less (same 403 as the web would give; nothing invented)', async () => {
    const { s } = build({ staff: [staff()], campuses: [{ _id: C1 }, { _id: C2 }] });
    expect(await s.check(tok())).toEqual({});
  });
  it('no staff row at all (principal/admin style account): only the school\'s single campus, exactly what login does; several campuses -> nothing', async () => {
    expect(await build({ staff: [], campuses: [{ _id: C1 }] }).s.check(tok('principal'))).toEqual({ campusId: String(C1) });
    expect(await build({ staff: [], campuses: [{ _id: C1 }, { _id: C2 }] }).s.check(tok('principal'))).toEqual({});
  });
  it('platform / institution roles are not campus-scoped: nothing derived, no lookups', async () => {
    for (const r of ['super_admin', 'institution_owner']) {
      const { s, campusModel } = build({ staff: [staff({ campusId: C1 })], campuses: [{ _id: C2 }] });
      expect(await s.check(tok(r))).toEqual({});
      expect(campusModel.find).not.toHaveBeenCalled();
    }
  });
  it('parent / student tokens never derive a campus', async () => {
    expect(await build({ staff: [staff({ campusId: C1 })] }).s.check(tok('parent'))).toEqual({});
  });
  it('an INACTIVE staff row never contributes its campus; all rows inactive is still the 401', async () => {
    expect(await build({ staff: [staff({ isActive: true }), staff({ isActive: false, campusId: C1 })], campuses: [] }).s.check(tok())).toEqual({});
    await expect(build({ staff: [staff({ isActive: false, campusId: C1 })] }).s.check(tok())).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('AUTH_STATE_CHECK=off derives nothing and queries nothing', async () => {
    process.env.AUTH_STATE_CHECK = 'off';
    const { s, campusModel } = build({ staff: [staff({ campusId: C1 })] });
    expect(await s.check(tok())).toEqual({});
    expect(campusModel.find).not.toHaveBeenCalled();
  });
  it('assertTokenValid keeps resolving to undefined (callers unchanged)', async () => {
    await expect(build({ staff: [staff({ campusId: C1 })] }).s.assertTokenValid(tok())).resolves.toBeUndefined();
  });
});
