import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AcademicsService } from './academics.service';
import { AcademicsController } from './academics.controller';

// Teacher sees only status 'active' curricula (enum draft|active|archived); other roles unchanged. Fakes only.
const T = new Types.ObjectId().toString();
const docs = [
  { _id: new Types.ObjectId(), tenantId: T, status: 'draft', gradeLevel: 'Grade 5', subjectName: 'Math' },
  { _id: new Types.ObjectId(), tenantId: T, status: 'active', gradeLevel: 'Grade 5', subjectName: 'English' },
  { _id: new Types.ObjectId(), tenantId: T, status: 'archived', gradeLevel: 'Grade 5', subjectName: 'Art' },
];
const matches = (d: any, f: any) => Object.entries(f).every(([k, v]) => k === '_id' ? String(d._id) === String(v) : String(d[k]) === String(v));
function make() {
  const sink: any = { filters: [] as any[] };
  const curriculumModel: any = {
    find: jest.fn((f: any) => { sink.filters.push(f); const r = docs.filter(d => matches(d, f)); const c: any = { sort: () => c, lean: () => Promise.resolve(r) }; return c; }),
    findOne: jest.fn((f: any) => { sink.filters.push(f); const r = docs.find(d => matches(d, f)) ?? null; return { lean: () => Promise.resolve(r) }; }),
  };
  const n: any = {};
  const svc = new AcademicsService(n, n, curriculumModel, n, n, n, n, n, n, n, n, n, n);
  return { svc, sink, curriculumModel };
}
const teacher = { role: 'teacher' };
const OTHERS = ['principal', 'admin', 'institution_owner', 'vice_principal', 'academic_coordinator', 'super_admin'];

describe('curriculum list: teacher', () => {
  it('only active, even with no status', async () => {
    const r = await make().svc.getCurricula(T, {}, teacher);
    expect(r.map((d: any) => d.status)).toEqual(['active']);
  });
  it.each(['draft', 'archived', 'active'])('status=%s query cannot widen the teacher scope', async (status) => {
    const r = await make().svc.getCurricula(T, { status }, teacher);
    expect(r.every((d: any) => d.status === 'active')).toBe(true);
  });
  it.each(OTHERS)('%s: tenant-wide incl. drafts as today', async (role) => {
    const { svc, sink } = make();
    expect((await svc.getCurricula(T, {}, { role })).map((d: any) => d.status).sort()).toEqual(['active', 'archived', 'draft']);
    expect(sink.filters[0].status).toBeUndefined();
    expect((await svc.getCurricula(T, { status: 'draft' }, { role })).length).toBe(1);
  });
  it('no user (internal callers): unchanged', async () => {
    expect((await make().svc.getCurricula(T, {})).length).toBe(3);
  });
});

describe('curriculum detail: teacher', () => {
  it('draft and archived -> 404; active -> ok', async () => {
    const { svc } = make();
    await expect(svc.getCurriculumById(T, String(docs[0]._id), teacher)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.getCurriculumById(T, String(docs[2]._id), teacher)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.getCurriculumById(T, String(docs[1]._id), teacher)).resolves.toMatchObject({ status: 'active' });
  });
  it.each(OTHERS)('%s: draft and archived still readable', async (role) => {
    const { svc } = make();
    await expect(svc.getCurriculumById(T, String(docs[0]._id), { role })).resolves.toMatchObject({ status: 'draft' });
    await expect(svc.getCurriculumById(T, String(docs[2]._id), { role })).resolves.toMatchObject({ status: 'archived' });
  });
  it('no user: unchanged', async () => {
    await expect(make().svc.getCurriculumById(T, String(docs[0]._id))).resolves.toMatchObject({ status: 'draft' });
  });
});

describe('curriculum controller passes the caller', () => {
  it('both GET routes forward req.user', () => {
    const svc: any = { getCurricula: jest.fn(), getCurriculumById: jest.fn() };
    const c = new AcademicsController(svc);
    const req: any = { user: { role: 'teacher', tenantId: T } };
    c.getCurricula(req, { status: 'draft' });
    c.getCurriculumById(req, 'x');
    expect(svc.getCurricula).toHaveBeenCalledWith(T, { status: 'draft' }, req.user);
    expect(svc.getCurriculumById).toHaveBeenCalledWith(T, 'x', req.user);
  });
});
