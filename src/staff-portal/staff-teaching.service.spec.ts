import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StaffTeachingService } from './staff-teaching.service';

// Hand-rolled fakes. The assignment fake's aggregate() honours the pipeline's
// leading $match (equality + $ne) and emulates the $lookup/$project result
// from in-memory submissions, so scoping rules are really exercised.

const oid = () => new Types.ObjectId();
const same = (a: any, b: any) => String(a) === String(b);

function matches(doc: any, m: any): boolean {
  return Object.entries(m).every(([k, cond]: [string, any]) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Types.ObjectId) && '$ne' in cond) return !same(doc[k], cond.$ne);
    return same(doc[k], cond);
  });
}

function setup(opts: { staff?: any; assignments?: any[]; submissions?: any[]; timetables?: any[] } = {}) {
  const tenantId = oid();
  const user = { userId: oid().toString(), schoolSlug: 'demo', role: 'teacher' };
  const staff = opts.staff === undefined ? { _id: oid(), tenantId, campusId: null } : opts.staff;
  const staffModel: any = { findOne: jest.fn().mockResolvedValue(staff) };
  const assignments = opts.assignments || [];
  const submissions = opts.submissions || [];
  const assignmentModel: any = {
    aggregate: jest.fn(async (pipeline: any[]) => {
      const m = pipeline[0].$match;
      return assignments.filter((a) => matches(a, m)).map((a) => {
        const subs = submissions.filter((s) => same(s.assignmentId, a._id));
        const ung = subs.filter((s) => ['submitted', 'late'].includes(s.status));
        const times = ung.map((s) => s.submittedAt).filter(Boolean).map((d: any) => +new Date(d));
        return {
          ...a,
          totalSubmissions: subs.length,
          submittedCount: ung.length,
          oldestSubmittedAt: times.length ? new Date(Math.min(...times)) : undefined,
        };
      });
    }),
  };
  const timetableModel: any = {
    find: jest.fn((f: any) => ({ lean: () => Promise.resolve((opts.timetables || []).filter((t) => t.status === 'active')) })),
  };
  const service = new StaffTeachingService(staffModel, assignmentModel, timetableModel);
  return { service, user, staff, tenantId, assignmentModel, timetableModel, staffModel };
}

describe('StaffTeachingService.pendingGrading', () => {
  const mk = (staff: any, over: any = {}) => ({
    _id: oid(), tenantId: staff.tenantId, teacherId: staff._id, title: 'HW', subject: 'Math',
    gradeLevel: 'Grade 5', sectionName: 'A', status: 'assigned', dueDate: new Date('2026-10-01T00:00:00Z'), ...over,
  });
  const sub = (a: any, status: string, submittedAt?: string) => ({ assignmentId: a._id, status, submittedAt: submittedAt && new Date(submittedAt) });

  it('403s with no staff record', async () => {
    const { service, user } = setup({ staff: null });
    await expect(service.pendingGrading(user as any)).rejects.toThrow(ForbiddenException);
  });

  it('403s without school context', async () => {
    const { service, user } = setup();
    await expect(service.pendingGrading({ ...user, schoolSlug: undefined } as any)).rejects.toThrow(ForbiddenException);
  });

  it('empty when no assignments', async () => {
    const { service, user } = setup();
    const r = await service.pendingGrading(user as any);
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
    expect(typeof r.generatedAt).toBe('string');
  });

  it('counts submitted+late as ungraded, ignores graded/pending/missed, reports oldest', async () => {
    const { service, user, staff } = setup();
    const a = mk(staff);
    const s = setup({ staff, assignments: [a], submissions: [
      sub(a, 'submitted', '2026-10-03T08:00:00Z'), sub(a, 'late', '2026-10-02T08:00:00Z'),
      sub(a, 'graded', '2026-09-01T08:00:00Z'), sub(a, 'pending'), sub(a, 'missed'),
    ] });
    const r = await s.service.pendingGrading(s.user as any);
    expect(r.total).toBe(2);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      assignmentId: String(a._id), title: 'HW', subject: 'Math', gradeLevel: 'Grade 5', sectionName: 'A',
      submittedCount: 2, totalSubmissions: 5, oldestSubmittedAt: '2026-10-02T08:00:00.000Z',
    });
    expect(r.items[0].dueDate).toBe('2026-10-01T00:00:00.000Z');
  });

  it('only my assignments (other teacher excluded) and query is scoped by tenant+staff', async () => {
    const staff = { _id: oid(), tenantId: oid() };
    const mine = mk(staff);
    const theirs = mk(staff, { teacherId: oid(), title: 'Other' });
    const s = setup({ staff, assignments: [mine, theirs], submissions: [sub(mine, 'submitted', '2026-10-02T00:00:00Z'), sub(theirs, 'submitted', '2026-10-02T00:00:00Z')] });
    const r = await s.service.pendingGrading(s.user as any);
    expect(r.items.map((i) => i.title)).toEqual(['HW']);
    expect(r.total).toBe(1);
    const match = s.assignmentModel.aggregate.mock.calls[0][0][0].$match;
    expect(String(match.teacherId)).toBe(String(staff._id));
    expect(String(match.tenantId)).toBe(String(staff.tenantId));
  });

  it('excludes draft assignments', async () => {
    const staff = { _id: oid(), tenantId: oid() };
    const draft = mk(staff, { status: 'draft' });
    const s = setup({ staff, assignments: [draft], submissions: [sub(draft, 'submitted', '2026-10-02T00:00:00Z')] });
    const r = await s.service.pendingGrading(s.user as any);
    expect(r).toMatchObject({ total: 0, items: [] });
  });

  it('omits zero-ungraded assignments', async () => {
    const staff = { _id: oid(), tenantId: oid() };
    const done = mk(staff, { title: 'Done' });
    const open = mk(staff, { title: 'Open' });
    const s = setup({ staff, assignments: [done, open], submissions: [sub(done, 'graded', '2026-10-01T00:00:00Z'), sub(open, 'late', '2026-10-02T00:00:00Z')] });
    const r = await s.service.pendingGrading(s.user as any);
    expect(r.items.map((i) => i.title)).toEqual(['Open']);
  });

  it('total spans all assignments beyond the limit; sorted oldest first', async () => {
    const staff = { _id: oid(), tenantId: oid() };
    const as = [1, 2, 3].map((i) => mk(staff, { title: `A${i}` }));
    const subs = [
      sub(as[0], 'submitted', '2026-10-03T00:00:00Z'), sub(as[0], 'submitted', '2026-10-04T00:00:00Z'),
      sub(as[1], 'submitted', '2026-10-01T00:00:00Z'),
      sub(as[2], 'late', '2026-10-02T00:00:00Z'),
    ];
    const s = setup({ staff, assignments: as, submissions: subs });
    const r = await s.service.pendingGrading(s.user as any, { limit: '2' });
    expect(r.total).toBe(4);
    expect(r.items.map((i) => i.title)).toEqual(['A2', 'A3']);
  });

  it('limit defaults to 50 and clamps to 200', async () => {
    const staff = { _id: oid(), tenantId: oid() };
    const as = Array.from({ length: 210 }, (_, i) => mk(staff, { title: `A${i}` }));
    const subs = as.map((a, i) => sub(a, 'submitted', new Date(2026, 9, 1, 0, i).toISOString()));
    const s = setup({ staff, assignments: as, submissions: subs });
    expect((await s.service.pendingGrading(s.user as any)).items).toHaveLength(50);
    expect((await s.service.pendingGrading(s.user as any, { limit: '9999' })).items).toHaveLength(200);
    expect((await s.service.pendingGrading(s.user as any, { limit: 'abc' })).items).toHaveLength(50);
  });
});
