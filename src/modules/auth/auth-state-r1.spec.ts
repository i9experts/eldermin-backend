import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthStateService } from './auth-state.service';
import { SCHOOL_SUSPENDED_TOKEN_MESSAGE } from '../../common/constants/school-suspended';

const UID = new Types.ObjectId().toHexString();
const TID = new Types.ObjectId().toHexString();
const ENV = ['AUTH_STATE_CHECK', 'AUTH_STATE_CACHE_TTL_MS'];
let saved: Record<string, string | undefined>;
beforeEach(() => { saved = {}; for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } jest.useFakeTimers({ now: new Date('2026-10-29T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }); });
afterEach(() => { jest.useRealTimers(); for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const lean = (v: any) => ({ select: () => ({ lean: () => Promise.resolve(v) }) });
function build(opts: { user?: any; tenant?: any; staff?: any[]; staffFail?: boolean } = {}) {
  const user = { findOne: jest.fn(() => lean(opts.user ?? { isActive: true })) };
  const tenant = { findOne: jest.fn(() => lean(opts.tenant ?? { status: 'active' })) };
  const staff = { find: jest.fn(() => (opts.staffFail ? { select: () => ({ lean: () => Promise.reject(new Error('db down')) }) } : lean(opts.staff ?? []))) };
  const s = new AuthStateService(user as any, tenant as any, staff as any);
  return { s, user, tenant, staff };
}
const tok = (role: string) => ({ sub: UID, tv: 0, role, tenantId: TID });

describe('AuthStateService R1: suspended school', () => {
  it.each(['teacher', 'principal', 'admin', 'parent', 'student', 'hr_manager'])('%s token of a suspended school -> 403 SCHOOL_SUSPENDED with the dedicated message', async (role) => {
    const { s } = build({ tenant: { status: 'suspended' }, staff: [{ isActive: true }] });
    const err: any = await s.assertTokenValid(tok(role)).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.message).toBe(SCHOOL_SUSPENDED_TOKEN_MESSAGE);
    expect(err.getResponse()).toMatchObject({ statusCode: 403, code: 'SCHOOL_SUSPENDED', error: 'SCHOOL_SUSPENDED', message: "Your school's account is currently suspended. Please contact your school administration." });
  });
  it.each(['super_admin', 'reseller_admin', 'reseller_support'])('%s is never refused on school status and triggers no tenant lookup', async (role) => {
    const { s, tenant } = build({ tenant: { status: 'suspended' } });
    await expect(s.assertTokenValid({ sub: UID, tv: 0, role, tenantId: TID })).resolves.toBeUndefined();
    expect(tenant.findOne).not.toHaveBeenCalled();
  });
  it('an active school, a trial school or a missing tenant doc is allowed', async () => {
    for (const status of ['active', 'trial', 'onboarding']) await expect(build({ tenant: { status } }).s.assertTokenValid(tok('teacher'))).resolves.toBeUndefined();
    await expect(build({ tenant: null as any }).s.assertTokenValid(tok('teacher'))).resolves.toBeUndefined();
  });
  it('a token whose tenantId is not an ObjectId (slug fallback tokens) skips the tenant check', async () => {
    const { s, tenant } = build({ tenant: { status: 'suspended' } });
    await expect(s.assertTokenValid({ sub: UID, tv: 0, role: 'admin', tenantId: 'demo-school' })).resolves.toBeUndefined();
    expect(tenant.findOne).not.toHaveBeenCalled();
  });
  it('suspension applies within the cache window: a cached ACCEPT lags <= 30 s, then the next read refuses; reactivation is picked up by the DB confirm', async () => {
    let status = 'active';
    const user = { findOne: jest.fn(() => lean({ isActive: true })) };
    const tenant = { findOne: jest.fn(() => lean({ status })) };
    const s = new AuthStateService(user as any, tenant as any, { find: () => lean([]) } as any);
    await s.assertTokenValid(tok('teacher'));
    status = 'suspended';
    await expect(s.assertTokenValid(tok('teacher'))).resolves.toBeUndefined();            // cached accept (<= TTL)
    jest.advanceTimersByTime(31_000);
    await expect(s.assertTokenValid(tok('teacher'))).rejects.toBeInstanceOf(ForbiddenException);
    status = 'active';                                                                    // reactivated: a cached REJECT is re-confirmed in the DB
    await expect(s.assertTokenValid(tok('teacher'))).resolves.toBeUndefined();
  });
});

describe('AuthStateService R1: deactivated staff row', () => {
  it('staff role whose only Staff row is inactive -> 401 "no longer active" even though the user is active', async () => {
    const { s } = build({ staff: [{ isActive: false }] });
    await expect(s.assertTokenValid(tok('teacher'))).rejects.toThrow(UnauthorizedException);
    await expect(build({ staff: [{ isActive: false }] }).s.assertTokenValid(tok('teacher'))).rejects.toThrow('no longer active');
  });
  it('no Staff row (owner/admin account) or one live row -> allowed', async () => {
    await expect(build({ staff: [] }).s.assertTokenValid(tok('admin'))).resolves.toBeUndefined();
    await expect(build({ staff: [{ isActive: false }, { isActive: true }] }).s.assertTokenValid(tok('teacher'))).resolves.toBeUndefined();
    await expect(build({ staff: [{}] }).s.assertTokenValid(tok('teacher'))).resolves.toBeUndefined();   // legacy row without isActive
  });
  it('parent/student tokens never trigger the Staff lookup (shared accounts demoted to parent stay valid)', async () => {
    const { s, staff } = build({ staff: [{ isActive: false }] });
    await expect(s.assertTokenValid(tok('parent'))).resolves.toBeUndefined();
    expect(staff.find).not.toHaveBeenCalled();
  });
  it('a deactivation is rejected within the cache window: cached accept lags <= 30 s, then the next read refuses', async () => {
    let rows: any[] = [{ isActive: true }];
    const s = new AuthStateService({ findOne: () => lean({ isActive: true }) } as any, { findOne: () => lean({ status: 'active' }) } as any, { find: () => lean(rows) } as any);
    await s.assertTokenValid(tok('teacher'));
    rows = [{ isActive: false }];
    jest.advanceTimersByTime(31_000);
    await expect(s.assertTokenValid(tok('teacher'))).rejects.toThrow('no longer active');
  });
  it('DB failure on the Staff/tenant lookup -> 503, never fail open', async () => {
    await expect(build({ staffFail: true }).s.assertTokenValid(tok('teacher'))).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('AuthStateService R1: kill switch and legacy construction', () => {
  it('AUTH_STATE_CHECK=off skips EVERYTHING (no user, tenant or staff query), even for a suspended school / inactive staff', async () => {
    process.env.AUTH_STATE_CHECK = 'off';
    const { s, user, tenant, staff } = build({ tenant: { status: 'suspended' }, staff: [{ isActive: false }], user: { isActive: false } });
    await expect(s.assertTokenValid(tok('teacher'))).resolves.toBeUndefined();
    expect(user.findOne).not.toHaveBeenCalled(); expect(tenant.findOne).not.toHaveBeenCalled(); expect(staff.find).not.toHaveBeenCalled();
  });
  it('constructed with the User model only (old call sites) the extra checks are simply skipped', async () => {
    const s = new AuthStateService({ findOne: () => lean({ isActive: true }) } as any);
    await expect(s.assertTokenValid(tok('teacher'))).resolves.toBeUndefined();
  });
  it('user.isActive=false is rejected before the extras are even read', async () => {
    const { s, tenant, staff } = build({ user: { isActive: false } });
    await expect(s.assertTokenValid(tok('teacher'))).rejects.toThrow('no longer active');
    expect(tenant.findOne).not.toHaveBeenCalled(); expect(staff.find).not.toHaveBeenCalled();
  });
});
