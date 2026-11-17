import { runMigration, scan, Coll, NEW_NAME } from './student-attendance-index.core';

const OLD = { v: 2, key: { studentId: 1, date: 1 }, name: 'studentId_1_date_1', unique: true };
const NEWI = { v: 2, key: { studentId: 1, date: 1, subject: 1 }, name: NEW_NAME, unique: true };
const OTHER = { v: 2, key: { studentId: 1, date: -1 }, name: 'studentId_1_date_-1' }; // must never be touched

function fake(init: { indexes: any[]; types?: any[]; exact?: any[]; logical?: any[]; docs?: number }) {
  const indexes = [...init.indexes];
  const calls: string[] = [];
  const coll: Coll = {
    indexes: async () => [...indexes],
    createIndex: async (key, opts) => { calls.push(`create:${opts.name}:${opts.unique}`); indexes.push({ key, name: opts.name, unique: opts.unique }); return opts.name; },
    dropIndex: async (name) => { calls.push(`drop:${name}`); const i = indexes.findIndex((x) => x.name === name); if (i >= 0) indexes.splice(i, 1); return {}; },
    aggregate: (p) => ({ toArray: async () => {
      const text = JSON.stringify(p);
      if (text.includes('"$type":"$studentId"') && !text.includes('$toString')) return init.types ?? [];
      if (text.includes('$toString')) return init.logical ?? [];
      return init.exact ?? [];
    } }),
    countDocuments: async () => init.docs ?? 0,
  };
  return { coll, calls, indexes };
}
const target = { host: 'h:27017', db: 'proddb' };
const run = async (f: ReturnType<typeof fake>, o: { apply?: boolean; confirmDb?: string } = {}) => {
  const lines: string[] = [];
  const res = await runMigration({ apply: !!o.apply, confirmDb: o.confirmDb, target, coll: f.coll, log: (s) => lines.push(s) });
  return { res, text: lines.join('\n'), calls: f.calls };
};

describe('student_attendance index migration', () => {
  it('DRY RUN (default) changes nothing: reports state, plan and counts', async () => {
    const f = fake({ indexes: [OTHER, OLD], types: [{ _id: 'string', n: 7 }, { _id: 'objectId', n: 3 }], docs: 10 });
    const { res, text, calls } = await run(f);
    expect(calls).toEqual([]);
    expect(res.exitCode).toBe(0);
    expect(res.state).toBe('old-only');
    expect(text).toContain('DRY RUN');
    expect(text).toContain('studentId stored as: string=7, objectId=3');
    expect(text).toContain('Plan: create unique index studentId_1_date_1_subject_1 on {studentId:1,date:1,subject:1}; then drop old index studentId_1_date_1');
    expect(text).toContain('--apply --confirm-db=proddb');
  });

  it('reports blocking and logical duplicates with ids only, and flags blocking ones', async () => {
    const f = fake({
      indexes: [],
      exact: [{ _id: { s: 'a'.repeat(24), d: new Date('2026-10-05'), sub: null }, n: 2 }],
      logical: [{ _id: { s: 'b'.repeat(24), d: new Date('2026-10-06'), sub: 'Maths' }, n: 2 }],
    });
    const { res, text } = await run(f);
    expect(res.scan.blockingTotal).toBe(1);
    expect(res.scan.logicalTotal).toBe(1);
    expect(text).toContain(`blocking  studentId=${'a'.repeat(24)} date=2026-10-05T00:00:00.000Z subject=null x2`);
    expect(text).toContain(`logical   studentId=${'b'.repeat(24)} date=2026-10-06T00:00:00.000Z subject=Maths x2`);
    expect(text).not.toMatch(/name|email|phone/i);
  });

  it('--apply WITHOUT --confirm-db is refused (exit 3), nothing changes', async () => {
    const f = fake({ indexes: [OLD] });
    const { res, calls } = await run(f, { apply: true });
    expect(res.exitCode).toBe(3);
    expect(res.refused).toMatch(/--confirm-db must equal/);
    expect(calls).toEqual([]);
  });
  it('--apply with the WRONG database name is refused (exit 3)', async () => {
    const f = fake({ indexes: [OLD] });
    const { res, calls } = await run(f, { apply: true, confirmDb: 'otherdb' });
    expect(res.exitCode).toBe(3);
    expect(calls).toEqual([]);
  });
  it('--apply with blocking duplicates and no new index is refused (exit 4), nothing changes', async () => {
    const f = fake({ indexes: [], exact: [{ _id: { s: 'x', d: new Date('2026-10-05'), sub: null }, n: 2 }] });
    const { res, calls } = await run(f, { apply: true, confirmDb: 'proddb' });
    expect(res.exitCode).toBe(4);
    expect(res.refused).toMatch(/would block/);
    expect(calls).toEqual([]);
  });

  it('--apply creates the NEW unique index FIRST, then drops the OLD one; the other indexes are untouched', async () => {
    const f = fake({ indexes: [OTHER, OLD] });
    const { res, calls } = await run(f, { apply: true, confirmDb: 'proddb' });
    expect(calls).toEqual([`create:${NEW_NAME}:true`, 'drop:studentId_1_date_1']);
    expect(res).toMatchObject({ created: true, dropped: true, exitCode: 0 });
    expect(f.indexes.map((i) => i.name).sort()).toEqual([OTHER.name, NEW_NAME].sort());
  });

  it('idempotent: a second run on a migrated database says there is nothing to do and changes nothing', async () => {
    const f = fake({ indexes: [OTHER, NEWI] });
    const { res, text, calls } = await run(f, { apply: true, confirmDb: 'proddb' });
    expect(res.state).toBe('new-only');
    expect(text).toContain('Nothing to do');
    expect(calls).toEqual([]);
  });

  it('half-done (both exist, e.g. the app already built the new index at boot): only the old index is dropped', async () => {
    const f = fake({ indexes: [OLD, NEWI] });
    const { res, calls } = await run(f, { apply: true, confirmDb: 'proddb' });
    expect(res.state).toBe('both');
    expect(calls).toEqual(['drop:studentId_1_date_1']);
  });

  it('a fresh database (neither index): apply creates the new one, drops nothing', async () => {
    const f = fake({ indexes: [] });
    const { calls } = await run(f, { apply: true, confirmDb: 'proddb' });
    expect(calls).toEqual([`create:${NEW_NAME}:true`]);
  });

  it('a NON-unique index on the new key is never treated as the migrated state', async () => {
    const f = fake({ indexes: [OLD, { ...NEWI, unique: false }] });
    const { res, calls } = await run(f, { apply: true, confirmDb: 'proddb' });
    expect(res.exitCode).toBe(4);
    expect(calls).toEqual([]);
  });

  it('a crash after create (drop fails) leaves BOTH indexes: still safe, and a re-run finishes the job', async () => {
    const f = fake({ indexes: [OLD] });
    const real = f.coll.dropIndex;
    f.coll.dropIndex = async () => { throw new Error('connection lost'); };
    await expect(run(f, { apply: true, confirmDb: 'proddb' })).rejects.toThrow('connection lost');
    expect(f.indexes.map((i) => i.name)).toEqual(['studentId_1_date_1', NEW_NAME]);
    f.coll.dropIndex = real;
    const { calls } = await run(f, { apply: true, confirmDb: 'proddb' });
    expect(calls).toEqual([`create:${NEW_NAME}:true`, 'drop:studentId_1_date_1']); // the shared log: create from run 1, drop from run 2
    expect(f.indexes.map((i) => i.name)).toEqual([NEW_NAME]);
  });

  it('scan() on a missing collection (no indexes) is state none', async () => {
    expect((await scan(fake({ indexes: [] }).coll)).state).toBe('none');
  });
});
