// B0: teacher class scoping, ownership, author-or-admin and protected-field
// stripping in BehaviourService. Fakes only; no DB.
import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { BehaviourService } from './behaviour.service';
import { BehaviourAccessContext } from './behaviour-access';

const CAMPUS = new Types.ObjectId().toString();
const TEACHER_USER = { userId: new Types.ObjectId().toString(), name: 'Ms Noor', role: 'teacher', schoolSlug: 'demo', tenantId: 't1', campusId: CAMPUS };
const ADMIN_USER = { userId: new Types.ObjectId().toString(), name: 'Principal', role: 'principal', schoolSlug: 'demo', tenantId: 't1', campusId: CAMPUS };

const access = (over: Partial<BehaviourAccessContext> = {}): BehaviourAccessContext => ({
  mode: 'enforce', enforce: true, role: 'teacher', isTeacher: true, elevated: false, route: '/api/v1/behaviour/records', method: 'GET', ...over,
});
const logMode = (over: Partial<BehaviourAccessContext> = {}) => access({ mode: 'log', enforce: false, ...over });
const adminAccess = () => access({ role: 'principal', isTeacher: false, elevated: true });

/** thenable that also supports .select().lean() / .sort().skip().limit() */
function q(result: any) {
  const p: any = Promise.resolve(result);
  const o: any = { select: () => o, lean: () => p, sort: () => o, skip: () => o, limit: () => p, then: (a: any, b: any) => p.then(a, b), catch: (b: any) => p.catch(b) };
  return o;
}

interface Fixture { records?: any[]; tarbiyah?: any[]; student?: any | null; staff?: any | null; profile?: any }
function build(f: Fixture = {}) {
  const recordModel: any = {
    find: jest.fn(() => q(f.records ?? [])),
    findOne: jest.fn(() => q((f.records ?? [])[0] ?? null)),
    countDocuments: jest.fn(() => Promise.resolve((f.records ?? []).length)),
    findOneAndUpdate: jest.fn(() => Promise.resolve({ ok: 1 })),
    db: {},
  };
  const tarbiyahModel: any = {
    find: jest.fn(() => q(f.tarbiyah ?? [])),
    findOne: jest.fn(() => q((f.tarbiyah ?? [])[0] ?? null)),
    countDocuments: jest.fn(() => Promise.resolve(0)),
    findOneAndUpdate: jest.fn(() => Promise.resolve({ _id: 'a1', studentId: new Types.ObjectId(), period: 'T1', studentName: 'X' })),
    db: { collection: () => ({ find: () => ({ project: () => ({ toArray: () => Promise.resolve([]) }) }), insertMany: jest.fn() }) },
  };
  const settingsModel: any = {
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
    findOneAndUpdate: jest.fn(() => Promise.resolve({})),
  };
  const studentModel: any = { findOne: jest.fn(() => q(f.student === undefined ? { currentGrade: 'Grade 5', currentSection: 'A' } : f.student)) };
  const staffModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(f.staff === undefined ? { _id: new Types.ObjectId(), firstName: 'Noor', lastName: 'A' } : f.staff) })) };
  const profile = f.profile === undefined ? { currentAssignments: [], isClassTeacher: true, classTeacherAssignments: [{ gradeName: 'Grade 5', sectionName: 'A' }] } : f.profile;
  const teacherProfileModel: any = { findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(profile) }), lean: () => Promise.resolve(profile) })) };
  const n: any = {};
  const svc = new BehaviourService(recordModel, tarbiyahModel, n, n, n, settingsModel, studentModel, staffModel, teacherProfileModel);
  return { svc, recordModel, tarbiyahModel, settingsModel, studentModel, staffModel, teacherProfileModel };
}

const rec = (over: any = {}) => ({ _id: new Types.ObjectId(), grade: 'Grade 5', section: 'A', studentId: new Types.ObjectId(), reportedById: new Types.ObjectId(TEACHER_USER.userId), reportedBy: 'Ms Noor', ...over });
const OID = () => new Types.ObjectId().toString();

let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
afterEach(() => warn.mockRestore());
const events = () => warn.mock.calls.map(c => { try { return JSON.parse(String(c[0])); } catch { return null; } }).filter(e => e?.event === 'behaviour_guard');
const logEvents = () => events().filter(e => e.mode === 'log');

describe('getRecords: teacher narrowing', () => {
  it('enforce: a teacher list is narrowed to their classes (grade/section matchers), campus scope untouched', async () => {
    const { svc, recordModel } = build({ records: [rec()] });
    await svc.getRecords('demo', {}, { ...TEACHER_USER, campusId: 'c1' } as any, access());
    const filter = recordModel.find.mock.calls[0][0];
    expect(filter.schoolSlug).toBe('demo');
    expect(filter.$and).toHaveLength(1);
    const or = filter.$and[0].$or;
    expect(or).toHaveLength(1);
    expect(or[0].grade.test('5')).toBe(true);          // tolerant: '5' == 'Grade 5'
    expect(or[0].grade.test('Grade 6')).toBe(false);
    expect(or[0].section.test('A')).toBe(true);
    expect(or[0].section.test('B')).toBe(false);
  });

  it('enforce: a teacher with no classes sees nothing (impossible filter), not everything', async () => {
    const { svc, recordModel } = build({ profile: { currentAssignments: [] } });
    await svc.getRecords('demo', {}, TEACHER_USER as any, access());
    expect(recordModel.find.mock.calls[0][0].$and[0]).toEqual({ _id: { $in: [] } });
  });

  it('enforce: the narrowing is ANDed with a search $or, not merged into it', async () => {
    const { svc, recordModel } = build();
    await svc.getRecords('demo', { search: 'ali' }, TEACHER_USER as any, access());
    const f = recordModel.find.mock.calls[0][0];
    expect(f.$or).toHaveLength(3);
    expect(f.$and).toHaveLength(1);
  });

  it('log mode: the query is NOT narrowed (web unchanged) but a would-narrow event is logged', async () => {
    const { svc, recordModel } = build({ records: [rec(), rec({ grade: 'Grade 9', section: 'C' })] });
    const res = await svc.getRecords('demo', {}, TEACHER_USER as any, logMode());
    expect(recordModel.find.mock.calls[0][0].$and).toBeUndefined();
    expect(res.data).toHaveLength(2);
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ mode: 'log', decision: 'would_deny', reason: 'teacher_scope_would_narrow:1/2', role: 'teacher' });
  });

  it('log mode: no event when everything returned is inside the teacher\'s classes', async () => {
    const { svc } = build({ records: [rec()] });
    await svc.getRecords('demo', {}, TEACHER_USER as any, logMode());
    expect(events()).toHaveLength(0);
  });

  it('admins and other roles are never class-scoped and incur no teacher lookup', async () => {
    const { svc, recordModel, staffModel } = build();
    await svc.getRecords('demo', {}, ADMIN_USER as any, adminAccess());
    expect(recordModel.find.mock.calls[0][0].$and).toBeUndefined();
    expect(staffModel.findOne).not.toHaveBeenCalled();
  });

  it('a teacher with no Staff record: enforce 403; log mode allows and logs', async () => {
    await expect(build({ staff: null }).svc.getRecords('demo', {}, TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
    const { svc } = build({ staff: null });
    await expect(svc.getRecords('demo', {}, TEACHER_USER as any, logMode())).resolves.toBeDefined();
    expect(events().some(e => e.reason === 'teacher_identity_unresolved')).toBe(true);
  });
});

describe('single-record and student reads', () => {
  it('getRecordById: out-of-class record is 403 in enforce, allowed + logged in log mode', async () => {
    const out = rec({ grade: 'Grade 9', section: 'C' });
    await expect(build({ records: [out] }).svc.getRecordById(OID(), 'demo', TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
    await expect(build({ records: [out] }).svc.getRecordById(OID(), 'demo', TEACHER_USER as any, logMode())).resolves.toBe(out);
    expect(logEvents()[0]).toMatchObject({ decision: 'would_deny', reason: 'teacher_record_outside_classes' });
  });

  it('getRecordById: in-class (spelling-tolerant) record is returned; admin unaffected', async () => {
    const mine = rec({ grade: '5', section: 'a' });
    await expect(build({ records: [mine] }).svc.getRecordById(OID(), 'demo', TEACHER_USER as any, access())).resolves.toBe(mine);
    const out = rec({ grade: 'Grade 9' });
    await expect(build({ records: [out] }).svc.getRecordById(OID(), 'demo', ADMIN_USER as any, adminAccess())).resolves.toBe(out);
  });

  it('student profile: non-assigned student is 403 in enforce, unknown student too; assigned student passes', async () => {
    const sid = OID();
    await expect(build({ student: { currentGrade: 'Grade 9', currentSection: 'C' } }).svc.getStudentBehaviourProfile(sid, 'demo', undefined, TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
    await expect(build({ student: null }).svc.getStudentBehaviourProfile(sid, 'demo', undefined, TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
    const ok = build({ student: { currentGrade: 'Grade 5', currentSection: 'A' } });
    ok.recordModel.aggregate = jest.fn(() => Promise.resolve([]));
    ok.recordModel.find = jest.fn(() => q([]));
    ok.tarbiyahModel.find = jest.fn(() => q([]));
    await expect(ok.svc.getStudentBehaviourProfile(sid, 'demo', undefined, TEACHER_USER as any, access())).resolves.toBeDefined();
  });

  it('student lookup is school-scoped', async () => {
    const { svc, studentModel } = build({ student: { currentGrade: 'Grade 9' } });
    await svc.getStudentBehaviourProfile(OID(), 'demo', undefined, TEACHER_USER as any, logMode()).catch(() => undefined);
    expect(studentModel.findOne.mock.calls[0][0]).toMatchObject({ schoolSlug: 'demo' });
  });
});

describe('writes: create / edit / resolve', () => {
  it('createRecord: teacher logging for a student outside their classes is 403 (enforce) / logged (log)', async () => {
    const data = { studentId: OID(), schoolSlug: 'demo', date: '2026-09-01' };
    const bad = { student: { currentGrade: 'Grade 9', currentSection: 'C' } };
    const b1 = build(bad);
    b1.recordModel.save = undefined;
    await expect(b1.svc.createRecord({ ...data }, TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
    expect(events()).toHaveLength(1);
  });

  it('createRecord: admins skip the student lookup', async () => {
    const { svc, studentModel } = build();
    (svc as any).recordModel = function Fake(this: any, d: any) { Object.assign(this, d); this.save = () => Promise.resolve(this); };
    await svc.createRecord({ studentId: OID(), schoolSlug: 'demo', date: '2026-09-01', title: 't' }, ADMIN_USER as any, adminAccess());
    expect(studentModel.findOne).not.toHaveBeenCalled();
  });

  it('updateRecord: teacher may edit only their own record (by id, or legacy name when no id); others 403 in enforce', async () => {
    const own = rec();
    const other = rec({ reportedById: new Types.ObjectId(), reportedBy: 'Mr Khan' });
    const legacyMine = rec({ reportedById: undefined, reportedBy: ' ms noor ' });
    const legacyOther = rec({ reportedById: undefined, reportedBy: 'Someone Else' });
    await expect(build({ records: [own] }).svc.updateRecord(OID(), 'demo', { title: 'x' }, TEACHER_USER as any, access())).resolves.toBeDefined();
    await expect(build({ records: [legacyMine] }).svc.updateRecord(OID(), 'demo', { title: 'x' }, TEACHER_USER as any, access())).resolves.toBeDefined();
    await expect(build({ records: [other] }).svc.updateRecord(OID(), 'demo', { title: 'x' }, TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
    await expect(build({ records: [legacyOther] }).svc.updateRecord(OID(), 'demo', { title: 'x' }, TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
  });

  it('updateRecord: log mode lets a teacher edit another teacher\'s record but logs it; admin can edit any record', async () => {
    const other = rec({ reportedById: new Types.ObjectId(), reportedBy: 'Mr Khan' });
    await expect(build({ records: [other] }).svc.updateRecord(OID(), 'demo', { title: 'x' }, TEACHER_USER as any, logMode())).resolves.toBeDefined();
    expect(logEvents()[0]).toMatchObject({ decision: 'would_deny', reason: 'teacher_edits_other_record' });
    await expect(build({ records: [other] }).svc.updateRecord(OID(), 'demo', { title: 'x' }, ADMIN_USER as any, adminAccess())).resolves.toBeDefined();
  });

  it('updateRecord never lets the body move a record to another school/campus', async () => {
    const { svc, recordModel } = build({ records: [rec()] });
    await svc.updateRecord(OID(), 'demo', { title: 'x', schoolSlug: 'evil-school', campusId: OID(), _id: OID() }, ADMIN_USER as any, adminAccess());
    const [filter, update] = recordModel.findOneAndUpdate.mock.calls[0];
    expect(filter.schoolSlug).toBe('demo');
    expect(update.$set).toEqual({ title: 'x' });
  });

  it('resolveRecord: teacher can resolve in-class records only', async () => {
    await expect(build({ records: [rec({ grade: 'Grade 9', section: 'C' })] }).svc.resolveRecord(OID(), 'demo', 'n', 'Ms Noor', TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
    await expect(build({ records: [rec()] }).svc.resolveRecord(OID(), 'demo', 'n', 'Ms Noor', TEACHER_USER as any, access())).resolves.toBeDefined();
  });
});

describe('Tarbiyah: author or admin', () => {
  const mineT = () => ({ _id: 'a1', assessedById: new Types.ObjectId(TEACHER_USER.userId), assessedBy: 'Ms Noor', parentShared: false });
  const otherT = () => ({ _id: 'a1', assessedById: new Types.ObjectId(), assessedBy: 'Mr Khan', parentShared: false });
  const legacyT = (name: string) => ({ _id: 'a1', assessedBy: name, parentShared: false });

  it('author may edit; a non-author teacher/coordinator is 403 in enforce and only logged in log mode', async () => {
    await expect(build({ tarbiyah: [mineT()] }).svc.updateTarbiyahAssessment(OID(), 'demo', { teacherObservations: 'x' }, TEACHER_USER as any, access())).resolves.toBeDefined();
    await expect(build({ tarbiyah: [otherT()] }).svc.updateTarbiyahAssessment(OID(), 'demo', { teacherObservations: 'x' }, TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
    await expect(build({ tarbiyah: [otherT()] }).svc.updateTarbiyahAssessment(OID(), 'demo', { teacherObservations: 'x' }, TEACHER_USER as any, logMode())).resolves.toBeDefined();
    expect(logEvents()[0]).toMatchObject({ decision: 'would_deny', reason: 'tarbiyah_edit_not_author_or_admin' });
  });

  it('admin (elevated) may edit anyone\'s assessment', async () => {
    await expect(build({ tarbiyah: [otherT()] }).svc.updateTarbiyahAssessment(OID(), 'demo', { teacherObservations: 'x' }, ADMIN_USER as any, adminAccess())).resolves.toBeDefined();
  });

  it('legacy assessments without assessedById fall back to the display name', async () => {
    await expect(build({ tarbiyah: [legacyT('MS NOOR')] }).svc.updateTarbiyahAssessment(OID(), 'demo', { teacherObservations: 'x' }, TEACHER_USER as any, access())).resolves.toBeDefined();
    await expect(build({ tarbiyah: [legacyT('Mr Khan')] }).svc.updateTarbiyahAssessment(OID(), 'demo', { teacherObservations: 'x' }, TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
  });

  it('an update never re-homes or re-attributes (schoolSlug/studentId/assessedById; assessedBy for non-admins)', async () => {
    const t = build({ tarbiyah: [mineT()] });
    await t.svc.updateTarbiyahAssessment(OID(), 'demo', { teacherObservations: 'x', schoolSlug: 'evil', studentId: OID(), assessedById: OID(), assessedBy: 'Forged', campusId: OID() }, TEACHER_USER as any, access());
    expect(t.tarbiyahModel.findOneAndUpdate.mock.calls[0][1].$set).toEqual({ teacherObservations: 'x' });
    const a = build({ tarbiyah: [otherT()] });
    await a.svc.updateTarbiyahAssessment(OID(), 'demo', { assessedBy: 'Renamed', schoolSlug: 'evil' }, ADMIN_USER as any, adminAccess());
    expect(a.tarbiyahModel.findOneAndUpdate.mock.calls[0][1].$set).toEqual({ assessedBy: 'Renamed' });
  });

  it('the parentShared notification path still works (existing record read once)', async () => {
    const t = build({ tarbiyah: [mineT()] });
    await t.svc.updateTarbiyahAssessment(OID(), 'demo', { parentShared: true }, TEACHER_USER as any, access());
    expect(t.tarbiyahModel.findOne).toHaveBeenCalledTimes(1);
    expect(t.tarbiyahModel.findOneAndUpdate.mock.calls[0][1].$set.parentShared).toBe(true);
    expect(t.tarbiyahModel.findOneAndUpdate.mock.calls[0][1].$set.parentSharedDate).toBeInstanceOf(Date);
  });

  it('createTarbiyahAssessment stamps assessedById from the token (body value ignored) and class-checks teachers', async () => {
    const t = build({ student: { currentGrade: 'Grade 5', currentSection: 'A' } });
    const saved: any[] = [];
    (t.svc as any).tarbiyahModel = function Fake(this: any, d: any) { Object.assign(this, d); this.save = () => { saved.push(this); return Promise.resolve(this); }; };
    await t.svc.createTarbiyahAssessment('demo', { studentId: OID(), assessmentDate: '2026-09-01', traits: [{ traitKey: 'sidq', score: 4 }], assessedById: OID() }, TEACHER_USER as any, access());
    expect(String(saved[0].assessedById)).toBe(TEACHER_USER.userId);
    const out = build({ student: { currentGrade: 'Grade 9', currentSection: 'C' } });
    await expect(out.svc.createTarbiyahAssessment('demo', { studentId: OID(), assessmentDate: '2026-09-01', traits: [] }, TEACHER_USER as any, access())).rejects.toThrow(ForbiddenException);
  });

  it('list: teachers are narrowed to their classes in enforce', async () => {
    const t = build();
    await t.svc.getTarbiyahAssessments('demo', {}, TEACHER_USER as any, access());
    expect(t.tarbiyahModel.find.mock.calls[0][0].$and).toHaveLength(1);
  });
});

describe('other protected writes', () => {
  it('character settings PUT cannot rewrite schoolSlug', async () => {
    const { svc, settingsModel } = build();
    await svc.updateCharacterSettings('demo', { moduleDisplayName: 'Akhlaq', schoolSlug: 'evil' });
    expect(settingsModel.findOneAndUpdate.mock.calls[0][0]).toEqual({ schoolSlug: 'demo' });
    expect(settingsModel.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { moduleDisplayName: 'Akhlaq' } });
  });

  it('signContract rejects an arbitrary signedBy (no dynamic field injection)', async () => {
    const { svc } = build();
    await expect(svc.signContract(OID(), 'demo', 'status' as any)).rejects.toThrow(BadRequestException);
  });
});
