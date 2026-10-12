// Pure(ish) core of the orphaned-staff-login audit/cleanup (S1). No Nest, no
// process.exit: everything it touches is injected so it is unit-testable and
// can never reach a database by accident.
import { createHash } from 'crypto';
import { Types } from 'mongoose';

export const REVOKING_STATUSES = ['resigned', 'terminated', 'suspended'];
const PROTECTED_ROLES = new Set(['super_admin', 'institution_owner']);
const NOT_STAFF_ROLES = new Set(['parent', 'student', 'reseller_admin', 'reseller_support']);
// Staff-type roles that may legitimately have no Staff row (owners/principals created by onboarding).
const NO_STAFF_ROW_OK = new Set(['super_admin', 'institution_owner', 'admin', 'principal', ...NOT_STAFF_ROLES]);

export interface Candidate {
  staffId: string; userId: string; tenantId: string; staffStatus: string; staffIsActive: boolean;
  userRole: string; shared: boolean; action: 'deactivate' | 'demote';
}

export interface Scan { candidates: Candidate[]; categoryC: { userId: string; tenantId: string; role: string }[] }

const idOf = (v: any) => (v == null ? '' : String(v));
const toObjectIds = (ids: string[]) => ids.filter(i => Types.ObjectId.isValid(i)).map(i => new Types.ObjectId(i));

/** Read-only scan. Staff with a login whose Staff is inactive/removed while the User is still usable. */
export async function scanOrphans(staffModel: any, userModel: any): Promise<Scan> {
  const staff: any[] = await staffModel.find({
    userId: { $ne: null },
    $or: [{ isActive: false }, { status: { $in: REVOKING_STATUSES } }],
  }).select('_id userId tenantId status isActive').lean();

  const candidates: Candidate[] = [];
  for (let i = 0; i < staff.length; i += 500) {
    const batch = staff.slice(i, i + 500);
    const byUser = new Map<string, any>();
    for (const s of batch) byUser.set(idOf(s.userId), s);
    const users: any[] = await userModel.find({ _id: { $in: toObjectIds([...byUser.keys()]) } })
      .select('_id tenantId primaryRole isActive guardianOfStudentIds linkedStudentId staffAccessRevokedAt').lean();
    for (const u of users) {
      const s = byUser.get(idOf(u._id));
      if (!s) continue;
      if (PROTECTED_ROLES.has(u.primaryRole) || NOT_STAFF_ROLES.has(u.primaryRole)) continue;
      const shared = (u.guardianOfStudentIds?.length || 0) > 0 || !!u.linkedStudentId;
      if (shared ? !!u.staffAccessRevokedAt : u.isActive === false) continue; // already handled -> idempotent
      candidates.push({
        staffId: idOf(s._id), userId: idOf(u._id), tenantId: idOf(u.tenantId ?? s.tenantId), staffStatus: s.status, staffIsActive: s.isActive !== false,
        userRole: u.primaryRole, shared, action: shared ? 'demote' : 'deactivate',
      });
    }
  }

  // Category C (REPORT ONLY, never applied): active staff-type logins that no Staff row points to.
  const pointed = new Set((await staffModel.find({ userId: { $ne: null } }).select('userId').lean()).map((s: any) => idOf(s.userId)));
  const maybe: any[] = await userModel.find({ isActive: { $ne: false }, primaryRole: { $nin: [...NO_STAFF_ROW_OK] } }).select('_id tenantId primaryRole').lean();
  const categoryC = maybe.filter(u => !pointed.has(idOf(u._id))).map(u => ({ userId: idOf(u._id), tenantId: idOf(u.tenantId), role: u.primaryRole }));
  return { candidates, categoryC };
}

/** Counts + ids only. Never names, e-mails, phones. */
export function formatReport(scan: Scan, mode: string, target: { host: string; db: string }): string {
  const lines: string[] = [`Target: host=${target.host} db=${target.db}`, `Mode: ${mode}`];
  const byTenant = new Map<string, Candidate[]>();
  for (const c of scan.candidates) (byTenant.get(c.tenantId) || byTenant.set(c.tenantId, []).get(c.tenantId)!).push(c);
  lines.push(`Category A (deactivate) total: ${scan.candidates.filter(c => c.action === 'deactivate').length}`);
  lines.push(`Category B (shared guardian/student account -> demote to parent) total: ${scan.candidates.filter(c => c.action === 'demote').length}`);
  for (const [t, list] of byTenant) {
    lines.push(`  tenant ${t}: deactivate=${list.filter(c => c.action === 'deactivate').length} demote=${list.filter(c => c.action === 'demote').length}`);
    for (const c of list) lines.push(`    ${c.action} user=${c.userId} staff=${c.staffId} staffStatus=${c.staffStatus} role=${c.userRole}`);
  }
  lines.push(`Category C (report only, never applied; staff-type login with no Staff row): ${scan.categoryC.length}`);
  for (const c of scan.categoryC) lines.push(`    user=${c.userId} tenant=${c.tenantId} role=${c.role}`);
  return lines.join('\n');
}

export interface FsLike {
  mkdirSync(p: string, o?: any): any; writeFileSync(p: string, d: string): any; readFileSync(p: string, e: string): string;
}

export interface RunOptions {
  apply: boolean;
  confirmDb?: string;
  target: { host: string; db: string };
  backupDir: string;
  now: Date;
  fs: FsLike;
  log: (s: string) => void;
  staffModel: any;
  userModel: any;
  /** the same service logic the live paths use */
  deactivate: (userId: string, reason: string, actorId: string, actor: any) => Promise<{ outcome: string }>;
}

export interface RunResult { refused?: string; backupPath?: string; scanned: Scan; changed: number; outcomes: Record<string, number> }

const SECRET_FIELDS = ['passwordHash', 'password', 'resetPasswordTokenHash', 'resetPasswordExpires'];

/** Dry run by default. --apply needs --confirm-db=<actual db name>; backup is written AND verified before the first change. */
export async function runOrphanCleanup(o: RunOptions): Promise<RunResult> {
  const scan = await scanOrphans(o.staffModel, o.userModel);
  o.log(formatReport(scan, o.apply ? 'APPLY' : 'DRY-RUN (nothing will be changed)', o.target));
  const result: RunResult = { scanned: scan, changed: 0, outcomes: {} };
  if (!o.apply) return result;

  if (!o.confirmDb || o.confirmDb !== o.target.db) {
    result.refused = `Refusing --apply: --confirm-db must equal the actual database name "${o.target.db}" (got "${o.confirmDb ?? ''}").`;
    o.log(result.refused);
    return result;
  }
  if (scan.candidates.length === 0) { o.log('Nothing to change.'); return result; }

  // 1) backup every document that will change, then verify it before any update
  const users: any[] = await o.userModel.find({ _id: { $in: toObjectIds(scan.candidates.map(c => c.userId)) } }).lean();
  const stripped = users.map(u => { const c = { ...u }; for (const f of SECRET_FIELDS) delete c[f]; return c; });
  const staffDocs: any[] = await o.staffModel.find({ _id: { $in: toObjectIds(scan.candidates.map(c => c.staffId)) } }).select('_id status isActive userId tenantId').lean();
  const payload = JSON.stringify({ createdAt: o.now.toISOString(), db: o.target.db, host: o.target.host, note: 'secrets (password hash, reset token) intentionally omitted; only fields this script changes matter for a restore', users: stripped, staff: staffDocs }, null, 2);
  const stamp = o.now.toISOString().replace(/[:.]/g, '-');
  const path = `${o.backupDir.replace(/\/$/, '')}/orphaned-staff-logins-${stamp}.json`;
  const sum = createHash('sha256').update(payload).digest('hex');
  try {
    o.fs.mkdirSync(o.backupDir, { recursive: true });
    o.fs.writeFileSync(path, payload);
    o.fs.writeFileSync(path + '.sha256', `${sum}  ${path}\n`);
    const back = o.fs.readFileSync(path, 'utf8');
    const parsed = JSON.parse(back);
    if (createHash('sha256').update(back).digest('hex') !== sum || parsed.users.length !== users.length) throw new Error('verification mismatch');
  } catch (err) {
    result.refused = `Backup could not be written/verified (${(err as Error).message}); NOTHING was changed.`;
    o.log(result.refused);
    return result;
  }
  result.backupPath = path;
  o.log(`Backup written and verified: ${path} (sha256 ${sum}) - ${users.length} user(s), ${staffDocs.length} staff row(s)`);

  // 2) apply through the same service logic as the live paths
  for (const c of scan.candidates) {
    const r = await o.deactivate(c.userId, 'orphan_cleanup', 'system:script', { name: 'system: orphan cleanup script' });
    result.outcomes[r.outcome] = (result.outcomes[r.outcome] || 0) + 1;
    if (r.outcome === 'deactivated' || r.outcome === 'demoted') result.changed++;
  }
  o.log(`Applied. changed=${result.changed} outcomes=${JSON.stringify(result.outcomes)}`);
  return result;
}

export function parseArgs(argv: string[], env: Record<string, string | undefined>) {
  const get = (k: string) => { const a = argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : undefined; };
  return { apply: argv.includes('--apply'), confirmDb: get('confirm-db'), uri: get('uri') || env.MONGODB_URI, backupDir: get('backup-dir') || './backups' };
}
