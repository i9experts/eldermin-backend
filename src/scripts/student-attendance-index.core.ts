// Core of the student_attendance index migration. No Nest, no process.exit, no direct database access:
// everything it touches is injected, so it is unit-testable and can never reach a database by accident.
//
// Why: subject-wise attendance needs ONE record per student, day AND subject. The collection still carries the old UNIQUE index
// {studentId:1, date:1}, so a second subject on the same day is a duplicate-key error. The migration creates the new unique index
// {studentId:1, date:1, subject:1} FIRST and only then drops the old one (a crash in between leaves both: still safe).
//
// The new index can always be built when the old unique index exists (a duplicate on the longer key would already be a duplicate on
// the old key), so "blocking duplicates" only appear on a database where the old index is missing. The scan also reports LOGICAL
// duplicates (same student written once as a string and once as an ObjectId, the old bulk-save bug): they do not block either index and
// are NOT deleted by this script, they are listed (ids only) for a human decision.

export const COLLECTION = 'student_attendance';
export const OLD_KEY = { studentId: 1, date: 1 } as const;
export const NEW_KEY = { studentId: 1, date: 1, subject: 1 } as const;
export const NEW_NAME = 'studentId_1_date_1_subject_1';

export interface Coll {
  indexes(): Promise<any[]>;
  createIndex(key: Record<string, number>, opts: Record<string, any>): Promise<string>;
  dropIndex(name: string): Promise<any>;
  aggregate(pipeline: any[]): { toArray(): Promise<any[]> };
  countDocuments(filter?: any): Promise<number>;
}

const sameKey = (a: Record<string, any>, b: Record<string, any>) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k, i) => kb[i] === k && a[k] === b[k]);
};

export type IndexState = 'old-only' | 'both' | 'new-only' | 'none';

export interface Scan {
  totalDocs: number;
  oldIndex?: { name: string; unique: boolean };
  newIndex?: { name: string; unique: boolean };
  state: IndexState;
  byIdType: Record<string, number>;
  /** exact duplicates on {studentId(type), date, subject}: these BLOCK the new unique index */
  blocking: { studentId: string; date: string; subject: string | null; count: number }[];
  blockingTotal: number;
  /** same student as string + ObjectId on the same day+subject: reported, not blocking */
  logical: { studentId: string; date: string; subject: string | null; count: number }[];
  logicalTotal: number;
}

const iso = (d: any) => (d instanceof Date ? d.toISOString() : String(d));
const LIMIT = 25;

export async function scan(coll: Coll): Promise<Scan> {
  const idx = await coll.indexes();
  const old = idx.find((i) => sameKey(i.key, OLD_KEY));
  const neu = idx.find((i) => sameKey(i.key, NEW_KEY));
  const state: IndexState = old && neu ? 'both' : old ? 'old-only' : neu ? 'new-only' : 'none';

  const types = await coll.aggregate([{ $group: { _id: { $type: '$studentId' }, n: { $sum: 1 } } }]).toArray();
  const byIdType: Record<string, number> = {};
  for (const t of types) byIdType[String(t._id)] = t.n;

  const exact = await coll.aggregate([
    { $group: { _id: { s: '$studentId', d: '$date', sub: { $ifNull: ['$subject', null] } }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  const logical = await coll.aggregate([
    { $group: { _id: { s: { $toString: '$studentId' }, d: '$date', sub: { $ifNull: ['$subject', null] } }, n: { $sum: 1 }, types: { $addToSet: { $type: '$studentId' } } } },
    { $match: { n: { $gt: 1 }, 'types.1': { $exists: true } } },
    { $sort: { n: -1 } },
  ]).toArray();
  const row = (r: any) => ({ studentId: String(r._id.s), date: iso(r._id.d), subject: r._id.sub ?? null, count: r.n });
  return {
    totalDocs: await coll.countDocuments({}),
    oldIndex: old && { name: old.name, unique: !!old.unique },
    newIndex: neu && { name: neu.name, unique: !!neu.unique },
    state, byIdType,
    blocking: exact.slice(0, LIMIT).map(row), blockingTotal: exact.length,
    logical: logical.slice(0, LIMIT).map(row), logicalTotal: logical.length,
  };
}

export interface RunOpts {
  apply: boolean;
  confirmDb?: string;
  target: { host: string; db: string };
  coll: Coll;
  log: (s: string) => void;
}
export interface RunResult { refused?: string; state: IndexState; created?: boolean; dropped?: boolean; scan: Scan; exitCode: number }

/** Exit codes: 0 ok / nothing to do, 3 refused (confirm-db), 4 blocking duplicates. */
export async function runMigration(o: RunOpts): Promise<RunResult> {
  const { coll, log } = o;
  log(`Target: host=${o.target.host} db=${o.target.db} collection=${COLLECTION}`);
  log(`Mode: ${o.apply ? 'APPLY' : 'DRY RUN (nothing is changed)'}`);
  const s = await scan(coll);
  log(`Documents: ${s.totalDocs}; studentId stored as: ${Object.entries(s.byIdType).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`);
  log(`Old unique index {studentId,date}: ${s.oldIndex ? `${s.oldIndex.name}${s.oldIndex.unique ? ' (unique)' : ' (NOT unique)'}` : 'absent'}`);
  log(`New unique index {studentId,date,subject}: ${s.newIndex ? `${s.newIndex.name}${s.newIndex.unique ? ' (unique)' : ' (NOT unique)'}` : 'absent'}`);
  log(`State: ${s.state}`);
  log(`Duplicates that would BLOCK the new unique index (exact studentId type + day + subject): ${s.blockingTotal}`);
  for (const r of s.blocking) log(`  blocking  studentId=${r.studentId} date=${r.date} subject=${r.subject ?? 'null'} x${r.count}`);
  log(`Logical duplicates (same student stored as string AND ObjectId, same day + subject; NOT blocking, NOT changed): ${s.logicalTotal}`);
  for (const r of s.logical) log(`  logical   studentId=${r.studentId} date=${r.date} subject=${r.subject ?? 'null'} x${r.count}`);

  const base = { state: s.state, scan: s };
  if (s.state === 'new-only') { log('Nothing to do: the new index exists and the old one is gone.'); return { ...base, exitCode: 0 }; }

  const plan: string[] = [];
  if (!s.newIndex) plan.push(`create unique index ${NEW_NAME} on {studentId:1,date:1,subject:1}`);
  if (s.oldIndex) plan.push(`drop old index ${s.oldIndex.name}`);
  log(`Plan: ${plan.length ? plan.join('; then ') : 'nothing'}`);
  if (!o.apply) { log('Dry run only. To apply: --apply --confirm-db=' + o.target.db); return { ...base, exitCode: 0 }; }

  if (o.confirmDb !== o.target.db) {
    const refused = `Refusing --apply: --confirm-db must equal the actual database name "${o.target.db}".`;
    log(refused);
    return { ...base, refused, exitCode: 3 };
  }
  if (s.blockingTotal > 0 && !s.newIndex) {
    const refused = `Refusing --apply: ${s.blockingTotal} duplicate group(s) would block the new unique index. Resolve them first (listed above).`;
    log(refused);
    return { ...base, refused, exitCode: 4 };
  }
  let created = false, dropped = false;
  if (!s.newIndex) {
    await coll.createIndex({ studentId: 1, date: 1, subject: 1 }, { unique: true, name: NEW_NAME });
    created = true;
    log(`Created ${NEW_NAME}.`);
  } else if (!s.newIndex.unique) {
    const refused = `Refusing --apply: an index on {studentId,date,subject} named ${s.newIndex.name} exists but is not unique; drop it by hand first.`;
    log(refused);
    return { ...base, refused, exitCode: 4 };
  }
  if (s.oldIndex) {
    await coll.dropIndex(s.oldIndex.name);
    dropped = true;
    log(`Dropped ${s.oldIndex.name}.`);
  }
  log('Done.');
  return { ...base, created, dropped, exitCode: 0 };
}
