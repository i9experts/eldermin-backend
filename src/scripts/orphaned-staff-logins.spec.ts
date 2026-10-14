import { Types } from 'mongoose';
import { parseArgs, runOrphanCleanup, scanOrphans, formatReport } from './orphaned-staff-logins.core';

const oid = () => new Types.ObjectId();
const T = oid();

function world(opts: { staff: any[]; users: any[] }) {
  const log: string[] = [];
  const users = opts.users;
  const staffModel: any = {
    find: jest.fn((f: any) => {
      let rows = opts.staff;
      if (f?.$or) rows = rows.filter(s => s.isActive === false || ['resigned', 'terminated', 'suspended'].includes(s.status));
      if (f?._id?.$in) rows = rows.filter(s => f._id.$in.some((i: any) => String(i) === String(s._id)));
      rows = rows.filter(s => !('userId' in (f || {})) || s.userId != null);
      const q: any = { select: () => q, lean: () => Promise.resolve(rows) };
      return q;
    }),
  };
  const userModel: any = {
    find: jest.fn((f: any) => {
      let rows = users;
      if (f?._id?.$in) rows = rows.filter(u => f._id.$in.some((i: any) => String(i) === String(u._id)));
      if (f?.primaryRole?.$nin) rows = rows.filter(u => u.isActive !== false && !f.primaryRole.$nin.includes(u.primaryRole));
      const q: any = { select: () => q, lean: () => Promise.resolve(rows) };
      return q;
    }),
  };
  const fsMock: any = {
    files: {} as Record<string, string>,
    mkdirSync: jest.fn(() => log.push('mkdir')),
    writeFileSync: jest.fn(function (p: string, d: string) { log.push('write:' + p.split('/').pop()); fsMock.files[p] = d; }),
    readFileSync: jest.fn((p: string) => { log.push('read'); return fsMock.files[p]; }),
  };
  const deactivate = jest.fn(async (userId: string) => { log.push('deactivate:' + userId); const u = users.find(x => String(x._id) === userId); if (u.guardianOfStudentIds?.length) { u.staffAccessRevokedAt = new Date(); u.primaryRole = 'parent'; return { outcome: 'demoted' }; } u.isActive = false; return { outcome: 'deactivated' }; });
  const out: string[] = [];
  const base = { target: { host: 'localhost:27017', db: 'verify_db' }, backupDir: '/tmp/bk', now: new Date('2026-10-12T10:00:00Z'), fs: fsMock, log: (s: string) => out.push(s), staffModel, userModel, deactivate };
  return { base, log, out, deactivate, fsMock, users, staffModel };
}

function fixture() {
  const uPlain = { _id: oid(), tenantId: T, primaryRole: 'teacher', isActive: true, guardianOfStudentIds: [], passwordHash: 'SECRET-HASH', resetPasswordTokenHash: 'RESET', email: 'x@y.z' };
  const uShared = { _id: oid(), tenantId: T, primaryRole: 'teacher', isActive: true, guardianOfStudentIds: [oid()], passwordHash: 'S2' };
  const uOwner = { _id: oid(), tenantId: T, primaryRole: 'institution_owner', isActive: true, guardianOfStudentIds: [] };
  const uActiveStaff = { _id: oid(), tenantId: T, primaryRole: 'teacher', isActive: true, guardianOfStudentIds: [] };
  const uAlready = { _id: oid(), tenantId: T, primaryRole: 'teacher', isActive: false, guardianOfStudentIds: [] };
  const uNoRow = { _id: oid(), tenantId: T, primaryRole: 'teacher', isActive: true, guardianOfStudentIds: [] };
  const staff = [
    { _id: oid(), userId: uPlain._id, tenantId: T, status: 'terminated', isActive: false },
    { _id: oid(), userId: uShared._id, tenantId: T, status: 'resigned', isActive: false },
    { _id: oid(), userId: uOwner._id, tenantId: T, status: 'terminated', isActive: false },
    { _id: oid(), userId: uActiveStaff._id, tenantId: T, status: 'active', isActive: true },
    { _id: oid(), userId: uAlready._id, tenantId: T, status: 'terminated', isActive: false },
  ];
  return { users: [uPlain, uShared, uOwner, uActiveStaff, uAlready, uNoRow], staff, ids: { uPlain, uShared, uNoRow } };
}

describe('orphaned staff login script', () => {
  it('scan: finds the plain orphan (deactivate) and the shared one (demote); skips owner, active staff, already-deactivated; reports category C only', async () => {
    const f = fixture(); const w = world(f);
    const scan = await scanOrphans(w.base.staffModel, w.base.userModel);
    expect(scan.candidates.map(c => [c.userId, c.action]).sort()).toEqual([[String(f.ids.uPlain._id), 'deactivate'], [String(f.ids.uShared._id), 'demote']].sort());
    expect(scan.categoryC.map(c => c.userId)).toEqual([String(f.ids.uNoRow._id)]);
  });

  it('DRY RUN (default) changes nothing: no deactivate, no file, report has counts + ids only', async () => {
    const f = fixture(); const w = world(f);
    const r = await runOrphanCleanup({ ...w.base, apply: false });
    expect(r.changed).toBe(0);
    expect(w.deactivate).not.toHaveBeenCalled();
    expect(w.fsMock.writeFileSync).not.toHaveBeenCalled();
    const text = w.out.join('\n');
    expect(text).toContain('DRY-RUN'); expect(text).toContain('host=localhost:27017 db=verify_db');
    expect(text).not.toMatch(/x@y\.z|SECRET|RESET/);
  });

  it('--apply is refused without a matching --confirm-db (nothing written, nothing changed)', async () => {
    for (const confirmDb of [undefined, 'other_db', 'VERIFY_DB']) {
      const f = fixture(); const w = world(f);
      const r = await runOrphanCleanup({ ...w.base, apply: true, confirmDb });
      expect(r.refused).toMatch(/--confirm-db must equal the actual database name "verify_db"/);
      expect(w.deactivate).not.toHaveBeenCalled(); expect(w.fsMock.writeFileSync).not.toHaveBeenCalled();
    }
  });

  it('--apply: backup is written and re-read/verified BEFORE the first change; shared account is demoted; secrets are not in the backup', async () => {
    const f = fixture(); const w = world(f);
    const r = await runOrphanCleanup({ ...w.base, apply: true, confirmDb: 'verify_db' });
    const firstDeactivate = w.log.findIndex(l => l.startsWith('deactivate:'));
    const lastBackupStep = w.log.lastIndexOf('read');
    expect(w.log.slice(0, firstDeactivate)).toEqual(expect.arrayContaining(['mkdir', expect.stringMatching(/^write:orphaned-staff-logins-.*\.json$/), expect.stringMatching(/^write:.*\.sha256$/), 'read']));
    expect(lastBackupStep).toBeLessThan(firstDeactivate);
    expect(r.outcomes).toEqual({ deactivated: 1, demoted: 1 });
    const file = Object.entries(w.fsMock.files).find(([p]) => p.endsWith('.json'))![1] as string;
    expect(file).not.toMatch(/SECRET|RESET|S2/);
    expect(JSON.parse(file).users).toHaveLength(2);
    expect(r.backupPath).toMatch(/orphaned-staff-logins-2026-10-12T10-00-00-000Z\.json$/);
  });

  it('a backup that cannot be written/verified aborts BEFORE any change', async () => {
    const f = fixture(); const w = world(f);
    w.fsMock.writeFileSync = jest.fn(() => { throw new Error('disk full'); });
    const r = await runOrphanCleanup({ ...w.base, apply: true, confirmDb: 'verify_db' });
    expect(r.refused).toMatch(/NOTHING was changed/); expect(w.deactivate).not.toHaveBeenCalled();
    const g = fixture(); const w2 = world(g);
    w2.fsMock.readFileSync = jest.fn(() => '{"users":[]}'); // verification mismatch
    const r2 = await runOrphanCleanup({ ...w2.base, apply: true, confirmDb: 'verify_db' });
    expect(r2.refused).toMatch(/NOTHING was changed/); expect(w2.deactivate).not.toHaveBeenCalled();
  });

  it('idempotent: a second --apply finds nothing to change and writes no new backup', async () => {
    const f = fixture(); const w = world(f);
    await runOrphanCleanup({ ...w.base, apply: true, confirmDb: 'verify_db' });
    w.fsMock.writeFileSync.mockClear(); w.deactivate.mockClear();
    const again = await runOrphanCleanup({ ...w.base, apply: true, confirmDb: 'verify_db' });
    expect(again.scanned.candidates).toHaveLength(0); expect(again.changed).toBe(0);
    expect(w.deactivate).not.toHaveBeenCalled(); expect(w.fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it('parseArgs / report', () => {
    expect(parseArgs(['--apply', '--confirm-db=x', '--uri=mongodb://h/db', '--backup-dir=/b'], {})).toEqual({ apply: true, confirmDb: 'x', uri: 'mongodb://h/db', backupDir: '/b' });
    expect(parseArgs([], { MONGODB_URI: 'mongodb://e/d' })).toEqual({ apply: false, confirmDb: undefined, uri: 'mongodb://e/d', backupDir: './backups' });
    expect(formatReport({ candidates: [], categoryC: [] }, 'DRY-RUN', { host: 'h', db: 'd' })).toContain('Category A (deactivate) total: 0');
  });
});
