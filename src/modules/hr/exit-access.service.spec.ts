import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ExitAccessService, EXIT_TYPE_TO_STATUS } from './exit-access.service';

const T = new Types.ObjectId().toHexString();
const UID = new Types.ObjectId().toHexString();

function build(records: any[], opts: { tz?: string; staff?: any; deactivateFails?: boolean } = {}) {
  const exits = records.map(r => ({ ...r }));
  const staffUpdates: any[] = [];
  const exitModel: any = {
    find: jest.fn((f: any) => ({ limit: () => ({ lean: () => Promise.resolve(exits.filter(e => !('accessRevokedAt' in e))) }) })),
    // atomic claim: only the first caller gets the document
    findOneAndUpdate: jest.fn((f: any, u: any) => ({ lean: () => { const e = exits.find(x => String(x._id) === String(f._id)); if (!e || 'accessRevokedAt' in e) return Promise.resolve(null); Object.assign(e, u.$set); return Promise.resolve({ ...e }); } })),
    updateOne: jest.fn(async (f: any, u: any) => { const e = exits.find(x => String(x._id) === String(f._id)); if (e && u.$unset) { delete e.accessRevokedAt; delete e.accessRevokedBy; } return {}; }),
    findOne: jest.fn((f: any) => ({ lean: () => Promise.resolve(exits.find(x => String(x._id) === String(f._id)) || null) })),
  };
  const staff = opts.staff ?? { _id: 's1', userId: UID, status: 'active', isActive: true };
  const staffModel: any = {
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(staff), select: () => ({ lean: () => Promise.resolve(staff) }) })),
    updateOne: jest.fn(async (_f: any, u: any) => { staffUpdates.push(u.$set); return {}; }),
  };
  const tenantModel: any = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ slug: 'sch' }) }) }) };
  const schoolModel: any = { findOne: () => ({ select: () => ({ lean: () => Promise.resolve(opts.tz === undefined ? { timezone: 'Asia/Karachi' } : { timezone: opts.tz }) }) }) };
  const access: any = { deactivateStaffLogin: jest.fn(async () => { if (opts.deactivateFails) throw new Error('db'); return { outcome: 'deactivated' }; }) };
  return { svc: new ExitAccessService(exitModel, staffModel, tenantModel, schoolModel, access), access, staffUpdates, exits };
}
const rec = (over: any = {}) => ({ _id: new Types.ObjectId(), tenantId: T, staffId: 's1', exitType: 'resignation', lastWorkingDay: new Date('2026-12-31T00:00:00Z'), ...over });
const at = (iso: string) => new Date(iso);

describe('ExitAccessService.processDueExits - tenant time zone boundary (Asia/Karachi, last day 2026-12-31)', () => {
  it('one minute BEFORE the day ends locally (18:59Z) nothing happens', async () => {
    const { svc, access } = build([rec()]);
    expect(await svc.processDueExits(at('2026-12-31T18:59:00Z'))).toEqual({ processed: 0, skipped: 1, failed: 0 });
    expect(access.deactivateStaffLogin).not.toHaveBeenCalled();
  });
  it('exactly when the local day ends (19:00Z = 00:00 on Jan 1 in Karachi) access is revoked', async () => {
    const { svc, access, staffUpdates } = build([rec()]);
    expect(await svc.processDueExits(at('2026-12-31T19:00:00Z'))).toEqual({ processed: 1, skipped: 0, failed: 0 });
    expect(access.deactivateStaffLogin).toHaveBeenCalledWith(UID, 'exit_resignation_last_working_day', undefined, { name: 'system: exit cron' });
    expect(staffUpdates[0]).toEqual({ status: 'resigned', isActive: false });
  });
  it('a UTC-based job would be 5h early: at 2026-12-31T00:00Z (the UTC date) the Karachi person is still in their last day', async () => {
    const { svc } = build([rec()]);
    expect((await svc.processDueExits(at('2026-12-31T12:00:00Z'))).processed).toBe(0);
  });
  it('a tenant in another zone (America/New_York) is judged in ITS zone', async () => {
    const a = build([rec()], { tz: 'America/New_York' });
    expect((await a.svc.processDueExits(at('2026-12-31T19:00:00Z'))).processed).toBe(0);      // still Dec 31 in NY
    expect((await a.svc.processDueExits(at('2027-01-01T05:00:00Z'))).processed).toBe(1);      // Jan 1 00:00 EST
  });
  it('an invalid School.timezone falls back to Asia/Karachi', async () => {
    const { svc } = build([rec()], { tz: 'Mars/Olympus' });
    expect((await svc.processDueExits(at('2026-12-31T19:00:00Z'))).processed).toBe(1);
  });
});

describe('ExitAccessService idempotency and concurrency', () => {
  it('running twice processes the record once (second run: nothing left)', async () => {
    const { svc, access } = build([rec()]);
    const now = at('2027-01-05T00:00:00Z');
    expect((await svc.processDueExits(now)).processed).toBe(1);
    expect(await svc.processDueExits(now)).toEqual({ processed: 0, skipped: 0, failed: 0 });
    expect(access.deactivateStaffLogin).toHaveBeenCalledTimes(1);
  });
  it('two instances racing on the same record: exactly one wins the atomic claim', async () => {
    const { svc, access } = build([rec()]);
    const now = at('2027-01-05T00:00:00Z');
    const [a, b] = await Promise.all([svc.processDueExits(now), svc.processDueExits(now)]);
    expect(a.processed + b.processed).toBe(1);
    expect(access.deactivateStaffLogin).toHaveBeenCalledTimes(1);
  });
  it('a failure while applying releases the claim so the next run retries', async () => {
    const { svc, exits } = build([rec()], { deactivateFails: true });
    const now = at('2027-01-05T00:00:00Z');
    expect(await svc.processDueExits(now)).toMatchObject({ processed: 0, failed: 1 });
    expect('accessRevokedAt' in exits[0]).toBe(false);
  });
  it('a processed record is never revisited: reactivating the staff later is not undone', async () => {
    const { svc, access, exits } = build([rec()]);
    await svc.processDueExits(at('2027-01-05T00:00:00Z'));
    expect(exits[0].accessRevokedAt).toBeInstanceOf(Date);
    await svc.processDueExits(at('2027-02-01T00:00:00Z'));
    expect(access.deactivateStaffLogin).toHaveBeenCalledTimes(1);
  });
});

describe('ExitAccessService effects', () => {
  it.each([['resignation', 'resigned'], ['retirement', 'resigned'], ['contract_end', 'resigned'], ['mutual_agreement', 'resigned'], ['termination', 'terminated'], ['abandonment', 'terminated'], ['death', 'terminated']])('%s -> staff %s', async (type, status) => {
    expect(EXIT_TYPE_TO_STATUS[type]).toBe(status);
    const { svc, staffUpdates } = build([rec({ exitType: type })]);
    await svc.processDueExits(at('2027-01-05T00:00:00Z'));
    expect(staffUpdates[0].status).toBe(status);
  });
  it('staff already terminated/inactive keeps its status; login still revoked', async () => {
    const { svc, staffUpdates, access } = build([rec()], { staff: { _id: 's1', userId: UID, status: 'terminated', isActive: false } });
    await svc.processDueExits(at('2027-01-05T00:00:00Z'));
    expect(staffUpdates).toHaveLength(0); expect(access.deactivateStaffLogin).toHaveBeenCalled();
  });
  it('staff without a login: Staff row ended, no login call', async () => {
    const { svc, access, staffUpdates } = build([rec()], { staff: { _id: 's1', userId: null, status: 'active', isActive: true } });
    await svc.processDueExits(at('2027-01-05T00:00:00Z'));
    expect(staffUpdates).toHaveLength(1); expect(access.deactivateStaffLogin).not.toHaveBeenCalled();
  });
});

describe('ExitAccessService.completeExit (manual)', () => {
  it('applies immediately regardless of the date, once', async () => {
    const r = rec({ lastWorkingDay: new Date('2099-01-01T00:00:00Z') });
    const { svc, access } = build([r]);
    const actor = { userId: new Types.ObjectId().toHexString(), name: 'HR' };
    await expect(svc.completeExit(T, String(r._id), actor)).resolves.toMatchObject({ accessRevoked: true });
    await expect(svc.completeExit(T, String(r._id), actor)).resolves.toMatchObject({ alreadyProcessed: true });
    expect(access.deactivateStaffLogin).toHaveBeenCalledTimes(1);
  });
  it('unknown record 404; own exit refused', async () => {
    const { svc } = build([]);
    await expect(svc.completeExit(T, new Types.ObjectId().toHexString(), { userId: 'x' })).rejects.toThrow(NotFoundException);
    const r = rec(); const b = build([r]);
    await expect(b.svc.completeExit(T, String(r._id), { userId: UID })).rejects.toThrow(BadRequestException);
  });
});
