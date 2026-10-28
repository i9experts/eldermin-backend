// B1: Student 360 behaviour block = union of behaviour_records + legacy student_behaviour (fakes only).
import { Types } from 'mongoose';
import { StudentsService } from './students.service';
import { mergeBehaviour360 } from './student-360-behaviour.util';

const d = (s: string) => new Date(s);
const sid = new Types.ObjectId();

describe('mergeBehaviour360', () => {
  const legacyRecent = [
    { _id: 'L1', type: 'positive', category: 'helping', description: 'legacy merit', date: d('2026-09-03'), points: 2, followUpNote: 'LEGACY-INTERNAL' },
    { _id: 'L2', type: 'negative', category: 'late_coming', description: 'legacy late', date: d('2026-08-01'), points: 1 },
  ];
  const recordsRecent = [
    { _id: 'R1', type: 'negative', category: 'misconduct', title: 'rec demerit', description: 'rec desc', date: d('2026-09-05'), points: -3, witnesses: ['W'], followUpNote: 'INTERNAL', reportedById: 'u1', attachments: ['x'] },
    { _id: 'R2', type: 'positive', category: 'good_conduct', title: 'rec merit', description: 'd', date: d('2026-09-01'), points: 1 },
  ];
  const input = (over: any = {}) => ({
    legacySummary: [{ _id: 'positive', count: 1, totalPoints: 2 }, { _id: 'negative', count: 1, totalPoints: 1 }],
    recordsSummary: [{ _id: 'positive', count: 1, totalPoints: 1 }, { _id: 'negative', count: 1, totalPoints: -3 }],
    legacyRecent, recordsRecent, ...over,
  });

  it('unions both sources, newest first, each item tagged with its source', () => {
    const { recent } = mergeBehaviour360(input());
    expect(recent.map((r) => r._id)).toEqual(['R1', 'L1', 'R2', 'L2']);
    expect(recent.map((r) => r.source)).toEqual(['records', 'legacy', 'records', 'legacy']);
  });

  it('keeps every original field for staff (existing response fields do not break)', () => {
    const { recent } = mergeBehaviour360(input());
    const r1 = recent.find((r) => r._id === 'R1')!;
    expect(r1).toMatchObject({ type: 'negative', category: 'misconduct', description: 'rec desc', points: -3, witnesses: ['W'], followUpNote: 'INTERNAL' });
    expect(recent.find((r) => r._id === 'L1')).toMatchObject({ description: 'legacy merit', points: 2 });
  });

  it('limit applies after the union; ties are stable (by id)', () => {
    expect(mergeBehaviour360(input({ limit: 2 })).recent.map((r) => r._id)).toEqual(['R1', 'L1']);
    const tie = mergeBehaviour360({ legacySummary: [], recordsSummary: [], legacyRecent: [{ _id: 'A', date: d('2026-01-01') }], recordsRecent: [{ _id: 'B', date: d('2026-01-01') }] });
    expect(tie.recent.map((r) => r._id)).toEqual(['B', 'A']);
  });

  it('summary: counts add up across sources, points are the raw stored sums (as before)', () => {
    const { summary } = mergeBehaviour360(input());
    expect(summary.positive).toEqual({ count: 2, points: 3 });
    expect(summary.negative).toEqual({ count: 2, points: -2 });
  });

  it('totalPoints is merit(+|p|) minus demerit(|p|) whether a store keeps demerits signed or not', () => {
    expect(mergeBehaviour360(input()).totalPoints).toBe(3 - 4); // +2 +1 -1 -3
    // legacy-only data behaves like the old formula (positive.points - negative.points) when demerits are stored positive
    const legacyOnly = mergeBehaviour360({ legacySummary: [{ _id: 'positive', count: 1, totalPoints: 5 }, { _id: 'negative', count: 1, totalPoints: 2 }], recordsSummary: [], legacyRecent: [], recordsRecent: [] });
    expect(legacyOnly.totalPoints).toBe(3);
  });

  it('missing / empty inputs and bad dates never throw', () => {
    expect(mergeBehaviour360({ legacySummary: undefined as any, recordsSummary: undefined as any, legacyRecent: undefined as any, recordsRecent: undefined as any })).toEqual({ summary: {}, totalPoints: 0, recent: [] });
    expect(() => mergeBehaviour360({ legacySummary: [], recordsSummary: [], legacyRecent: [{ _id: 'x', date: 'not a date' }], recordsRecent: [{ _id: 'y' }] })).not.toThrow();
  });

  it('guardian view: parent allowlist only (no witnesses, notes, reporter ids, attachments) + source', () => {
    const { recent } = mergeBehaviour360(input({ guardianView: true }));
    const r1 = recent.find((r) => r._id === 'R1')!;
    expect(Object.keys(r1).sort()).toEqual(['_id', 'category', 'date', 'description', 'points', 'source', 'title', 'type']);
    for (const f of ['witnesses', 'followUpNote', 'reportedById', 'attachments']) expect(r1).not.toHaveProperty(f);
    expect(JSON.stringify(recent)).not.toMatch(/INTERNAL/);
  });
});

// ---- getStudent360 wiring ----
const chain = (v: any) => {
  const c: any = { select: () => c, sort: () => c, skip: () => c, limit: () => c, lean: () => Promise.resolve(v), then: (r: any, j: any) => Promise.resolve(v).then(r, j) };
  return c;
};
function makeService(withRecords = true, legacy: any = {}, records: any = {}) {
  const studentModel: any = { findOne: jest.fn(() => chain({ _id: sid, currentAcademicYear: '2026-27', schoolSlug: 's' })) };
  const empty: any = { aggregate: jest.fn(async () => []), find: jest.fn(() => chain([])) };
  const behaviourModel: any = { aggregate: jest.fn(async () => legacy.summary || []), find: jest.fn(() => chain(legacy.recent || [])) };
  const recordModel: any = { aggregate: jest.fn(async () => records.summary || []), find: jest.fn(() => chain(records.recent || [])) };
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  const args: any[] = [studentModel, empty, empty, behaviourModel, { find: jest.fn(() => chain([])) }, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n];
  const svc = new (StudentsService as any)(...args, ...(withRecords ? [recordModel] : []));
  return { svc, recordModel, behaviourModel };
}
const teacher = { role: 'teacher', schoolSlug: 's', userId: 'u1' };
const parent = { role: 'parent', schoolSlug: 's', userId: 'p1', guardianOfStudentIds: [String(sid)] };

describe('StudentsService.getStudent360 behaviour union', () => {
  const legacy = { summary: [{ _id: 'positive', count: 1, totalPoints: 2 }], recent: [{ _id: 'L1', type: 'positive', date: d('2026-09-03'), points: 2, description: 'legacy' }] };
  const records = { summary: [{ _id: 'negative', count: 1, totalPoints: -3 }], recent: [{ _id: 'R1', type: 'negative', date: d('2026-09-05'), points: -3, title: 'rec', witnesses: ['W'], followUpNote: 'INTERNAL' }] };

  it('returns both sources, the existing response fields, and queries behaviour_records scoped to the student + school', async () => {
    const { svc, recordModel } = makeService(true, legacy, records);
    const res: any = await svc.getStudent360(String(sid), 's', teacher as any);
    expect(Object.keys(res.behaviour).sort()).toEqual(['recent', 'summary', 'totalPoints']);
    expect(res.behaviour.recent.map((r: any) => `${r.source}:${r._id}`)).toEqual(['records:R1', 'legacy:L1']);
    expect(res.behaviour.summary).toEqual({ positive: { count: 1, points: 2 }, negative: { count: 1, points: -3 } });
    expect(res.behaviour.totalPoints).toBe(2 - 3);
    expect((recordModel.find.mock.calls as any[][])[0][0]).toEqual({ studentId: sid, schoolSlug: 's' });
    expect(((recordModel.aggregate.mock.calls as any[][])[0][0][0]).$match).toMatchObject({ studentId: sid, schoolSlug: 's', academicYear: '2026-27' });
  });

  it('a parent / student token gets the allowlisted items only (the 360 must not leak staff-only fields)', async () => {
    const { svc } = makeService(true, legacy, records);
    const res: any = await svc.getStudent360(String(sid), 's', parent as any);
    const r1 = res.behaviour.recent.find((r: any) => r._id === 'R1');
    expect(r1).not.toHaveProperty('witnesses');
    expect(r1).not.toHaveProperty('followUpNote');
    expect(r1.source).toBe('records');
  });

  it('without the records model (older construction) the block is legacy-only and still works', async () => {
    const { svc } = makeService(false, legacy, records);
    const res: any = await svc.getStudent360(String(sid), 's', teacher as any);
    expect(res.behaviour.recent.map((r: any) => r.source)).toEqual(['legacy']);
    expect(res.behaviour.totalPoints).toBe(2);
  });

  it('no data in either store: empty block, no throw', async () => {
    const { svc } = makeService(true);
    const res: any = await svc.getStudent360(String(sid), 's', teacher as any);
    expect(res.behaviour).toEqual({ summary: {}, totalPoints: 0, recent: [] });
  });
});
