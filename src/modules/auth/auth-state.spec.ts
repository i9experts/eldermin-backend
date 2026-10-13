import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthStateService } from './auth-state.service';
import { JwtStrategy } from './jwt.strategy';
import { AuthService } from './auth.service';
import { GuardianRefreshInterceptor } from '../../parent-portal/guardian-refresh.interceptor';
import { AccountAccessService } from './account-access.service';
import { CriticalAuditService } from '../../common/critical-audit.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const UID = new Types.ObjectId().toHexString();
const ENV = ['AUTH_STATE_CHECK', 'AUTH_STATE_CACHE_TTL_MS'];
let saved: Record<string, string | undefined>;
beforeEach(() => { saved = {}; for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } jest.useFakeTimers({ now: new Date('2026-10-13T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }); });
afterEach(() => { jest.useRealTimers(); for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

function svc(doc: any, opts: { fail?: boolean } = {}) {
  const findOne = jest.fn(() => ({ select: () => ({ lean: () => (opts.fail ? Promise.reject(new Error('db down')) : Promise.resolve(doc)) }) }));
  const s = new AuthStateService({ findOne } as any);
  return { s, findOne, doc };
}
afterAll(() => { jest.useRealTimers(); });

describe('AuthStateService.assertTokenValid', () => {
  it('active user, matching version -> ok; token WITHOUT tv works against a user without tokenVersion (pre-S3 tokens)', async () => {
    const { s } = svc({ isActive: true });
    await expect(s.assertTokenValid({ sub: UID })).resolves.toBeUndefined();
    await expect(svc({ isActive: true, tokenVersion: 0 }).s.assertTokenValid({ sub: UID, tv: 0 })).resolves.toBeUndefined();
  });
  it('wrong version either way -> 401 "session has ended"', async () => {
    await expect(svc({ isActive: true, tokenVersion: 2 }).s.assertTokenValid({ sub: UID, tv: 1 })).rejects.toThrow('Your session has ended');
    await expect(svc({ isActive: true, tokenVersion: 2 }).s.assertTokenValid({ sub: UID })).rejects.toThrow(UnauthorizedException);   // old token without tv after a bump
    await expect(svc({ isActive: true, tokenVersion: 0 }).s.assertTokenValid({ sub: UID, tv: 3 })).rejects.toThrow(UnauthorizedException);
  });
  it('inactive -> 401 "no longer active"; missing user -> 401; malformed sub -> 401 without a query', async () => {
    await expect(svc({ isActive: false }).s.assertTokenValid({ sub: UID })).rejects.toThrow('no longer active');
    await expect(svc(null).s.assertTokenValid({ sub: UID })).rejects.toThrow(UnauthorizedException);
    const x = svc({ isActive: true });
    await expect(x.s.assertTokenValid({ sub: 'not-an-id' })).rejects.toThrow(UnauthorizedException);
    expect(x.findOne).not.toHaveBeenCalled();
  });
  it('a user doc without isActive counts as active (legacy rows)', async () => {
    await expect(svc({}).s.assertTokenValid({ sub: UID })).resolves.toBeUndefined();
  });
  it('DB failure -> 503, NEVER fail open', async () => {
    await expect(svc(null, { fail: true }).s.assertTokenValid({ sub: UID, tv: 0 })).rejects.toThrow(ServiceUnavailableException);
  });
  it('query is a lean 2-field projection on _id', async () => {
    const sel = jest.fn(() => ({ lean: () => Promise.resolve({ isActive: true }) }));
    const findOne = jest.fn(() => ({ select: sel }));
    await new AuthStateService({ findOne } as any).assertTokenValid({ sub: UID });
    expect(findOne).toHaveBeenCalledWith({ _id: UID }); expect(sel).toHaveBeenCalledWith('isActive tokenVersion');
  });

  describe('cache', () => {
    it('second request within the TTL is a cache hit (no query); after 30 s it re-reads', async () => {
      const { s, findOne } = svc({ isActive: true });
      await s.assertTokenValid({ sub: UID }); await s.assertTokenValid({ sub: UID });
      expect(findOne).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(29_000); await s.assertTokenValid({ sub: UID }); expect(findOne).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(2_000); await s.assertTokenValid({ sub: UID }); expect(findOne).toHaveBeenCalledTimes(2);
      expect(s.getStats()).toMatchObject({ hits: 2, misses: 2 });
    });
    it('TTL is hard-capped at 30 s even if configured higher; configurable lower; 0 disables caching', async () => {
      process.env.AUTH_STATE_CACHE_TTL_MS = '600000';
      const a = svc({ isActive: true }); await a.s.assertTokenValid({ sub: UID }); jest.advanceTimersByTime(31_000); await a.s.assertTokenValid({ sub: UID }); expect(a.findOne).toHaveBeenCalledTimes(2);
      process.env.AUTH_STATE_CACHE_TTL_MS = '0';
      const b = svc({ isActive: true }); await b.s.assertTokenValid({ sub: UID }); await b.s.assertTokenValid({ sub: UID }); expect(b.findOne).toHaveBeenCalledTimes(2);
    });
    it('a bump/deactivation on this instance is seen at once (explicit invalidate); stale cache otherwise lasts <= TTL', async () => {
      const state: any = { isActive: true, tokenVersion: 0 };
      const findOne = jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ ...state }) }) }));
      const s = new AuthStateService({ findOne } as any);
      await s.assertTokenValid({ sub: UID, tv: 0 });
      state.tokenVersion = 1;                                               // bumped by ANOTHER instance
      await expect(s.assertTokenValid({ sub: UID, tv: 0 })).resolves.toBeUndefined();   // stale, still inside the TTL
      jest.advanceTimersByTime(30_001);
      await expect(s.assertTokenValid({ sub: UID, tv: 0 })).rejects.toThrow(UnauthorizedException);  // <= 30 s later
      state.tokenVersion = 2; await s.assertTokenValid({ sub: UID, tv: 1 }).catch(() => undefined);
      s.invalidate(UID);                                                      // bumped on THIS instance
      await expect(s.assertTokenValid({ sub: UID, tv: 1 })).rejects.toThrow(UnauthorizedException);
    });
    it('is bounded: never more than 5000 entries', async () => {
      const s = new AuthStateService({ findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ isActive: true }) }) }) } as any);
      for (let i = 0; i < 5200; i++) await s.assertTokenValid({ sub: new Types.ObjectId().toHexString() });
      expect(s.getStats().cacheSize).toBeLessThanOrEqual(5000);
    });
  });

  it('KILL SWITCH AUTH_STATE_CHECK=off skips the check entirely (no query, inactive/old tokens pass); default is on', async () => {
    process.env.AUTH_STATE_CHECK = 'off';
    const x = svc({ isActive: false, tokenVersion: 9 });
    await expect(x.s.assertTokenValid({ sub: UID, tv: 0 })).resolves.toBeUndefined();
    expect(x.findOne).not.toHaveBeenCalled();
    delete process.env.AUTH_STATE_CHECK;
    await expect(svc({ isActive: false }).s.assertTokenValid({ sub: UID })).rejects.toThrow(UnauthorizedException);
    process.env.AUTH_STATE_CHECK = 'ON';
    await expect(svc({ isActive: false }).s.assertTokenValid({ sub: UID })).rejects.toThrow(UnauthorizedException);
  });
});

describe('JwtStrategy', () => {
  const cfg: any = { get: () => 'secret' };
  it('rejects through the state check and otherwise returns the SAME req.user shape plus tv', async () => {
    const ok = new JwtStrategy(cfg, { assertTokenValid: jest.fn().mockResolvedValue(undefined) } as any);
    const u = await ok.validate({ sub: 'u1', tv: 2, tenantId: 't', role: 'teacher', name: 'N', schoolSlug: 's' });
    expect(u).toMatchObject({ userId: 'u1', tv: 2, tenantId: 't', role: 'teacher', schoolSlug: 's', activeModules: [], isBoardLevel: false });
    const bad = new JwtStrategy(cfg, { assertTokenValid: jest.fn().mockRejectedValue(new UnauthorizedException('x')) } as any);
    await expect(bad.validate({ sub: 'u1' })).rejects.toThrow(UnauthorizedException);
  });
});

describe('token issuance carries tv; resets and sign-out bump it', () => {
  const GOOD = bcrypt.hashSync('Correct#1', 4);
  function auth(user: any) {
    const s: any = Object.create(AuthService.prototype);
    s.userModel = { findOne: jest.fn(() => Object.assign(Promise.resolve(user), { lean: () => Promise.resolve(user) })), findByIdAndUpdate: jest.fn(), updateOne: jest.fn() };
    s.tenantModel = { findById: () => ({ lean: () => Promise.resolve({ _id: 't1', slug: 's', status: 'active' }) }) };
    s.rolesService = { getPermissionsForUser: async () => null };
    s.resolveScopeFieldsForUser = async () => ({});
    s.getPlatformPermissionsForUser = async () => undefined;
    s.authState = { invalidate: jest.fn() };
    s.jwtService = { sign: jest.fn(() => 'tok') };
    return s;
  }
  it('login puts the current tokenVersion in the token (absent -> 0)', async () => {
    const a = auth({ _id: 'u1', email: 'a@x.test', isActive: true, passwordHash: GOOD, primaryRole: 'teacher', tenantId: 't1', tokenVersion: 4 });
    await a.login('a@x.test', 'Correct#1'); expect(a.jwtService.sign.mock.calls[0][0].tv).toBe(4);
    const b = auth({ _id: 'u1', email: 'a@x.test', isActive: true, passwordHash: GOOD, primaryRole: 'teacher', tenantId: 't1' });
    await b.login('a@x.test', 'Correct#1'); expect(b.jwtService.sign.mock.calls[0][0].tv).toBe(0);
  });
  it('self reset-password bumps the version and clears the local cache', async () => {
    const hash = crypto.createHash('sha256').update('tok').digest('hex');
    const u = { _id: 'u1', isActive: true, resetPasswordTokenHash: hash };
    const a = auth(u); a.userModel.findOne = jest.fn(() => Promise.resolve(u));
    await a.resetPassword('tok', 'NewPass#1');
    expect(a.userModel.findByIdAndUpdate.mock.calls[0][1].$inc).toEqual({ tokenVersion: 1 });
    expect(a.authState.invalidate).toHaveBeenCalledWith('u1');
  });
  it('logout-all (self) bumps and invalidates', async () => {
    const a = auth({}); await a.logoutAll('u1');
    expect(a.userModel.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $inc: { tokenVersion: 1 } }); expect(a.authState.invalidate).toHaveBeenCalledWith('u1');
  });
});

describe('GuardianRefreshInterceptor (parent-portal) applies the same version rule on its own read', () => {
  const run = (fresh: any, user: any) => new GuardianRefreshInterceptor({ findById: () => ({ select: () => ({ lean: () => Promise.resolve(fresh) }) }) } as any)
    .intercept({ switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any, { handle: () => 'next' } as any);
  const parent = { role: 'parent', userId: 'p1', tv: 0 };
  it('matching version -> proceeds with fresh guardian ids; no extra query', async () => {
    const find = jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ isActive: true, tokenVersion: 0, guardianOfStudentIds: [new Types.ObjectId()] }) }) }));
    const req: any = { user: { ...parent } };
    await new GuardianRefreshInterceptor({ findById: find } as any).intercept({ switchToHttp: () => ({ getRequest: () => req }) } as any, { handle: () => 'next' } as any);
    expect(find).toHaveBeenCalledTimes(1); expect(req.user.guardianOfStudentIds).toHaveLength(1);
  });
  it('bumped version -> 401; inactive -> 401 (same wording as before); old token without tv vs bumped user -> 401', async () => {
    await expect(run({ isActive: true, tokenVersion: 1, guardianOfStudentIds: [] }, parent)).rejects.toThrow('session has ended');
    await expect(run({ isActive: false, tokenVersion: 0 }, parent)).rejects.toThrow('This account is no longer active.');
    await expect(run({ isActive: true, tokenVersion: 1, guardianOfStudentIds: [] }, { role: 'parent', userId: 'p1' })).rejects.toThrow(UnauthorizedException);
  });
  it('pre-S3 parent token (no tv) with an unbumped user still works; kill switch skips only the version rule', async () => {
    await expect(run({ isActive: true, guardianOfStudentIds: [] }, { role: 'parent', userId: 'p1' })).resolves.toBe('next');
    process.env.AUTH_STATE_CHECK = 'off';
    await expect(run({ isActive: true, tokenVersion: 5, guardianOfStudentIds: [] }, parent)).resolves.toBe('next');
  });
});

describe('AccountAccessService bumps tokenVersion and clears the cache', () => {
  function build(user: any) {
    const updates: any[] = []; const inv = jest.fn();
    const userModel: any = { findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(user) }) })), updateOne: jest.fn(async (f: any, u: any) => { updates.push(u); return { modifiedCount: 1 }; }) };
    const audit: any = { create: jest.fn(async (d: any) => ({ _id: 'a', ...d })), updateOne: jest.fn() };
    const svc = new AccountAccessService(userModel, { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ slug: 's' }) }) }) } as any, audit, new CriticalAuditService(audit), { invalidate: inv } as any);
    return { svc, updates, inv };
  }
  const base = { _id: UID, primaryRole: 'teacher', isActive: true, tenantId: 't', guardianOfStudentIds: [] };
  const bump = { tokenVersion: { $add: [{ $ifNull: ['$tokenVersion', 0] }, 1] } };
  it('deactivation bumps + invalidates', async () => { const { svc, updates, inv } = build(base); await svc.deactivateStaffLogin(UID, 'r', 'a'); expect(updates[0][0].$set).toMatchObject(bump); expect(inv).toHaveBeenCalledWith(UID); });
  it('DEMOTION of a shared account bumps + invalidates (whole token revoked; re-login gives parent access)', async () => { const { svc, updates, inv } = build({ ...base, guardianOfStudentIds: [new Types.ObjectId()] }); await svc.deactivateStaffLogin(UID, 'r', 'a'); expect(updates[0][0].$set).toMatchObject({ ...bump, primaryRole: 'parent' }); expect(inv).toHaveBeenCalled(); });
  it('reactivation bumps too (role claims are stale after a restore)', async () => { const { svc, updates, inv } = build({ ...base, isActive: false }); await svc.reactivateStaffLogin(UID, 'x', 'hr'); expect(updates[0][0].$set).toMatchObject(bump); expect(inv).toHaveBeenCalled(); });
  it('admin sign-out-everywhere bumps, invalidates and audits', async () => { const { svc, updates, inv } = build(base); await expect(svc.signOutEverywhere(UID, 'why', { userId: 'admin' })).resolves.toEqual({ outcome: 'signed_out' }); expect(updates[0]).toEqual({ $inc: { tokenVersion: 1 } }); expect(inv).toHaveBeenCalled(); });
});
