// B0.1 (written, NOT yet run): section fallback for teacher scoping, and raw PUTs that
// receive the whole object (protected fields stripped, never rejected).
import { ForbiddenException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';
import { BehaviourAccessContext } from './behaviour-access';
import { classIncludes, classScopeFilter, PROTECTED_UPDATE_FIELDS, stripProtectedFields } from './behaviour-teacher-scope';

const CAMPUS = new Types.ObjectId().toString();
const TEACHER = { userId: new Types.ObjectId().toString(), name: 'Ms Noor', role: 'teacher', schoolSlug: 'demo', tenantId: 't1', campusId: CAMPUS };
const ADMIN = { userId: new Types.ObjectId().toString(), name: 'Principal', role: 'principal', schoolSlug: 'demo', tenantId: 't1', campusId: CAMPUS };
const OID = () => new Types.ObjectId().toString();

const access = (over: Partial<BehaviourAccessContext> = {}): BehaviourAccessContext => ({
  mode: 'enforce', enforce: true, role: 'teacher', isTeacher: true, elevated: false, route: '/api/v1/behaviour/records', method: 'GET', ...over,
});
const adminAccess = () => access({ role: 'principal', isTeacher: false, elevated: true });

function q(result: any) {
  const p: any = Promise.resolve(result);
  const o: any = { select: () => o, lean: () => p, sort: () => o, skip: () => o, limit: () => p, then: (a: any, b: any) => p.then(a, b), catch: (b: any) => p.catch(b) };
  return o;
}

function build(f: { records?: any[]; tarbiyah?: any[]; student?: any; profile?: any } = {}) {
  const recordModel: any = {
    find: jest.fn(() => q(f.records ?? [])), findOne: jest.fn(() => q((f.records ?? [])[0] ?? null)),
    countDocuments: jest.fn(() => Promise.resolve((f.records ?? []).length)),
    findOneAndUpdate: jest.fn(() => Promise.resolve({ ok: 1 })), db: {},
  };
  const tarbiyahModel: any = {
    find: jest.fn(() => q(f.tarbiyah ?? [])), findOne: jest.fn(() => q((f.tarbiyah ?? [])[0] ?? null)),
    countDocuments: jest.fn(() => Promise.resolve(0)),
    findOneAndUpdate: jest.fn(() => Promise.resolve({ _id: 'a1', ok: 1 })),
    db: { collection: () => ({ find: () => ({ project: () => ({ toArray: () => Promise.resolve([]) }) }), insertMany: jest.fn() }) },
  };
  const settingsModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })), findOneAndUpdate: jest.fn(() => Promise.resolve({})) };
  const studentModel: any = { findOne: jest.fn(() => q(f.student === undefined ? { currentGrade: 'Grade 5', currentSection: 'A' } : f.student)) };
  const staffModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve({ _id: new Types.ObjectId(), firstName: 'Noor', lastName: 'A' }) })) };
  const profile = f.profile === undefined ? { currentAssignments: [], isClassTeacher: true, classTeacherAssignments: [{ gradeName: 'Grade 5', sectionName: 'A' }] } : f.profile;
  const teacherProfileModel: any = { findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(profile) }), lean: () => Promise.resolve(profile) })) };
  const n: any = {};
  const svc = new BehaviourService(recordModel, tarbiyahModel, n, n, n, settingsModel, studentModel, staffModel, teacherProfileModel);
  return { svc, ctl: new BehaviourController(svc), recordModel, tarbiyahModel };
}

const rec = (over: any = {}) => ({ _id: new Types.ObjectId(), grade: 'Grade 5', section: 'A', studentId: new Types.ObjectId(), reportedById: new Types.ObjectId(TEACHER.userId), reportedBy: 'Ms Noor', ...over });

let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
afterEach(() => warn.mockRestore());

describe('section fallback: a record with no section matches the teacher by class only', () => {
  const A = [{ grade: 'Grade 5', section: 'A' }];

  it('classIncludes: blank / missing / whitespace section matches when the grade is assigned (any section)', () => {
    for (const sec of [undefined, null, '', '   ']) expect(classIncludes(A, 'Grade 5', sec)).toBe(true);
    expect(classIncludes(A, '5', undefined)).toBe(true);           // grade spelling tolerant
  });

  it('classIncludes: still requires the grade, and still requires the section when the record has one', () => {
    expect(classIncludes(A, 'Grade 6', undefined)).toBe(false);
    expect(classIncludes(A, 'Grade 5', 'B')).toBe(false);
    expect(classIncludes(A, 'Grade 5', 'a')).toBe(true);
    expect(classIncludes([], 'Grade 5', undefined)).toBe(false);   // no classes: nothing
    expect(classIncludes([{ grade: 'Grade 5' }], 'Grade 5', 'Z')).toBe(true); // class without section covers all
  });

  it('classScopeFilter: a sectioned class also matches stored sections that are null / "" / whitespace / missing', () => {
    const f = classScopeFilter(A);
    const [branch] = f.$or;
    expect(branch.grade.test('Grade 5')).toBe(true);
    const [bySection, noSection] = branch.$or;
    expect(bySection.section.test('A')).toBe(true);
    expect(bySection.section.test('B')).toBe(false);
    const [nul, empty, blank] = noSection.section.$in;
    expect(nul).toBeNull();
    expect(empty).toBe('');
    expect(blank.test('   ')).toBe(true);
    expect(blank.test('B')).toBe(false);
  });

  it('classScopeFilter: a class without a section is unchanged (grade only); no classes matches nothing', () => {
    expect(Object.keys(classScopeFilter([{ grade: 'Grade 5' }]).$or[0])).toEqual(['grade']);
    expect(classScopeFilter([])).toEqual({ _id: { $in: [] } });
  });

  it('list (enforce): the query sent to Mongo carries the no-section branch', async () => {
    const { svc, recordModel } = build();
    await svc.getRecords('demo', {}, TEACHER as any, access());
    const branch = recordModel.find.mock.calls[0][0].$and[0].$or[0];
    expect(branch.$or).toHaveLength(2);
  });

  it('list (log mode): a no-section record in the teacher\'s grade is NOT reported as would-narrow', async () => {
    const { svc } = build({ records: [rec({ section: undefined }), rec({ section: '' })] });
    await svc.getRecords('demo', {}, TEACHER as any, access({ mode: 'log', enforce: false }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('single read: no-section record in an assigned grade is returned; wrong grade is 403', async () => {
    const noSec = rec({ section: undefined });
    await expect(build({ records: [noSec] }).svc.getRecordById(OID(), 'demo', TEACHER as any, access())).resolves.toBe(noSec);
    await expect(build({ records: [rec({ section: '  ' })] }).svc.getRecordById(OID(), 'demo', TEACHER as any, access())).resolves.toBeDefined();
    await expect(build({ records: [rec({ section: undefined, grade: 'Grade 9' })] }).svc.getRecordById(OID(), 'demo', TEACHER as any, access())).rejects.toThrow(ForbiddenException);
    await expect(build({ records: [rec({ section: 'B' })] }).svc.getRecordById(OID(), 'demo', TEACHER as any, access())).rejects.toThrow(ForbiddenException);
  });

  it('resolve: no-section record in an assigned grade can be resolved; another grade cannot', async () => {
    await expect(build({ records: [rec({ section: undefined })] }).svc.resolveRecord(OID(), 'demo', 'n', 'Ms Noor', TEACHER as any, access())).resolves.toBeDefined();
    await expect(build({ records: [rec({ section: undefined, grade: 'Grade 9' })] }).svc.resolveRecord(OID(), 'demo', 'n', 'Ms Noor', TEACHER as any, access())).rejects.toThrow(ForbiddenException);
  });

  it('a student with no current section is matched by grade for create / profile', async () => {
    const t = build({ student: { currentGrade: 'Grade 5', currentSection: '' } });
    t.recordModel.aggregate = jest.fn(() => Promise.resolve([]));
    t.tarbiyahModel.find = jest.fn(() => q([]));
    await expect(t.svc.getStudentBehaviourProfile(OID(), 'demo', undefined, TEACHER as any, access())).resolves.toBeDefined();
  });

  it('Tarbiyah list uses the same fallback filter', async () => {
    const { svc, tarbiyahModel } = build();
    await svc.getTarbiyahAssessments('demo', {}, TEACHER as any, access());
    expect(tarbiyahModel.find.mock.calls[0][0].$and[0].$or[0].$or).toHaveLength(2);
  });
});

describe('raw PUT with the full object: protected fields are stripped (ignored), never rejected', () => {
  it('stripProtectedFields never throws and removes exactly the protected set (+ extras)', () => {
    const body: any = { title: 'x', ...Object.fromEntries(PROTECTED_UPDATE_FIELDS.map(f => [f, 'v'])), studentId: 's', assessedById: 'a' };
    const out = stripProtectedFields(body, ['studentId', 'assessedById']);
    expect(out).toEqual({ title: 'x' });
    expect(body.schoolSlug).toBe('v'); // input not mutated
  });

  const fullRecordBody = () => ({
    _id: OID(), __v: 3, createdAt: '2026-01-01', updatedAt: '2026-02-01', schoolSlug: 'other-school', campusId: OID(), studentId: OID(),
    studentName: 'Ali', grade: 'Grade 5', section: 'A', date: '2026-09-01', type: 'negative', category: 'misconduct', title: 'Edited title',
    description: 'd', severity: 'low', points: -1, academicYear: '2026-27', reportedBy: 'Ms Noor', reportedById: TEACHER.userId, parentNotified: false,
  });

  it('records PUT (admin, whole object back): resolves, schoolSlug/campusId/_id/timestamps ignored, filter pinned to the token school', async () => {
    const { ctl, recordModel } = build({ records: [rec()] });
    const body = fullRecordBody();
    await expect(ctl.updateRecord(OID(), body, { user: ADMIN, headers: {}, behaviourAccess: adminAccess() })).resolves.toEqual({ ok: 1 });
    const [filter, update] = recordModel.findOneAndUpdate.mock.calls[0];
    expect(filter.schoolSlug).toBe('demo');
    for (const f of ['_id', '__v', 'createdAt', 'updatedAt', 'schoolSlug', 'campusId']) expect(update.$set).not.toHaveProperty(f);
    expect(update.$set).toMatchObject({ title: 'Edited title', points: -1, studentName: 'Ali' });
  });

  it('records PUT (teacher, own record, whole object back): also resolves; authorship fields ignored too', async () => {
    const { ctl, recordModel } = build({ records: [rec()] });
    await expect(ctl.updateRecord(OID(), fullRecordBody(), { user: TEACHER, headers: {}, behaviourAccess: access() })).resolves.toEqual({ ok: 1 });
    const set = recordModel.findOneAndUpdate.mock.calls[0][1].$set;
    for (const f of ['schoolSlug', 'campusId', 'reportedBy', 'reportedById', 'verifiedBy']) expect(set).not.toHaveProperty(f);
    expect(set.title).toBe('Edited title');
  });

  const fullTarbiyahBody = () => ({
    _id: OID(), __v: 1, createdAt: 'x', updatedAt: 'y', schoolSlug: 'other-school', campusId: OID(), studentId: OID(), assessedById: OID(), assessedBy: 'Ms Noor',
    studentName: 'Ali', grade: 'Grade 5', section: 'A', period: 'Term 1', periodType: 'termly', assessmentDate: '2026-09-10',
    traits: [{ traitKey: 'sidq', score: 4 }], teacherObservations: 'Edited', parentShared: false,
  });

  it('tarbiyah PUT (author, whole object back): resolves, schoolSlug/campusId/studentId/assessedById unchanged', async () => {
    const mine = { _id: 'a1', assessedById: new Types.ObjectId(TEACHER.userId), assessedBy: 'Ms Noor', parentShared: false };
    const { ctl, tarbiyahModel } = build({ tarbiyah: [mine] });
    await expect(ctl.updateTarbiyah(OID(), fullTarbiyahBody(), { user: TEACHER, headers: {}, behaviourAccess: access() })).resolves.toBeDefined();
    const [filter, update] = tarbiyahModel.findOneAndUpdate.mock.calls[0];
    expect(filter.schoolSlug).toBe('demo');
    for (const f of ['_id', '__v', 'createdAt', 'updatedAt', 'schoolSlug', 'campusId', 'studentId', 'assessedById', 'assessedBy']) expect(update.$set).not.toHaveProperty(f);
    expect(update.$set).toMatchObject({ teacherObservations: 'Edited', period: 'Term 1' });
    expect(update.$set.overallScore).toBe(4); // recomputed from traits as before
  });

  it('tarbiyah PUT (admin): same stripping; an admin MAY still rename assessedBy', async () => {
    const other = { _id: 'a1', assessedById: new Types.ObjectId(), assessedBy: 'Mr Khan', parentShared: false };
    const { ctl, tarbiyahModel } = build({ tarbiyah: [other] });
    await expect(ctl.updateTarbiyah(OID(), fullTarbiyahBody(), { user: ADMIN, headers: {}, behaviourAccess: adminAccess() })).resolves.toBeDefined();
    const set = tarbiyahModel.findOneAndUpdate.mock.calls[0][1].$set;
    for (const f of ['schoolSlug', 'campusId', 'studentId', 'assessedById']) expect(set).not.toHaveProperty(f);
    expect(set.assessedBy).toBe('Ms Noor');
  });
});
