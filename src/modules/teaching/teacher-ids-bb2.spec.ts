import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';
import { SyllabusService } from '../../syllabus/syllabus.service';
import { teacherIdsMatch } from '../../staff-portal/teacher-identity.util';

// BB2: teacher-keyed lists matched only Staff._id, but admin-created rows (through the web's TeacherDropdown) carry the TeacherProfile._id.
const oid = () => new Types.ObjectId();
const STAFF = oid(), PROFILE = oid(), UID = oid().toHexString();
const teacher: any = { userId: UID, role: 'teacher', name: 'T', schoolSlug: 's', tenantId: 't', campusId: String(oid()) };
const admin: any = { userId: oid().toHexString(), role: 'admin', name: 'A', schoolSlug: 's', tenantId: 't', campusId: String(oid()) };

const identityModels = (withProfile = true) => ({
  staffModel: { findOne: jest.fn(() => ({ lean: async () => ({ _id: STAFF, firstName: 'T', lastName: 'X' }) })) },
  teacherProfileModel: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => (withProfile ? { _id: PROFILE } : null) }) })) },
});
const finder = (rows: any[] = []) => { const c: any = { sort: () => c, limit: () => c, skip: () => c, lean: async () => rows, then: undefined }; return jest.fn((f: any) => { (c as any).filter = f; return c; }); };

function teaching(withProfile = true) {
  const s: any = Object.create(TeachingService.prototype);
  Object.assign(s, identityModels(withProfile));
  s.lessonPlanModel = { find: finder() }; s.assignmentModel = { find: finder() }; s.classDiaryModel = { find: finder() };
  s.behaviourModel = { find: finder(), countDocuments: jest.fn(async () => 0) };
  return s as TeachingService & Record<string, any>;
}
const idsOf = (filter: any, key: string) => (filter[key].$in as any[]).map(String);

describe('teacherIdsMatch', () => {
  it('both ids, in ObjectId AND string form; only my staff id when there is no profile', () => {
    const both = teacherIdsMatch({ userId: 'u', name: 'n', staffId: String(STAFF), teacherProfileId: String(PROFILE) }).$in;
    expect(both.filter((x) => typeof x === 'string').sort()).toEqual([String(STAFF), String(PROFILE)].sort());
    expect(both.filter((x) => x instanceof Types.ObjectId)).toHaveLength(2);
    expect(teacherIdsMatch({ userId: 'u', name: 'n', staffId: String(STAFF), teacherProfileId: null }).$in).toHaveLength(2);
    expect(teacherIdsMatch({ userId: 'u', name: 'n', staffId: 'not-an-id', teacherProfileId: null }).$in).toHaveLength(0);
  });
});

describe('BB2: every teacher-keyed list matches Staff._id AND TeacherProfile._id for a TEACHER caller', () => {
  it('lesson plans (teaching.service getLessonPlans)', async () => {
    const t = teaching(); await t.getLessonPlans('t', {}, teacher);
    expect(idsOf((t as any).lessonPlanModel.find.mock.calls[0][0], 'teacherId')).toEqual(expect.arrayContaining([String(STAFF), String(PROFILE)]));
  });
  it('assignments / homework (getAssignments)', async () => {
    const t = teaching(); await t.getAssignments('t', {}, teacher);
    expect(idsOf((t as any).assignmentModel.find.mock.calls[0][0], 'teacherId')).toEqual(expect.arrayContaining([String(STAFF), String(PROFILE)]));
  });
  it('the request can neither widen nor narrow it: a caller-supplied teacherId is overridden', async () => {
    const t = teaching(); await t.getAssignments('t', { teacherId: String(oid()) }, teacher);
    expect(idsOf((t as any).assignmentModel.find.mock.calls[0][0], 'teacherId').sort()).toEqual([String(STAFF), String(PROFILE), String(STAFF), String(PROFILE)].sort());
  });
  it('behaviour notes (getBehaviourNotes, reportedBy)', async () => {
    const t = teaching(); await t.getBehaviourNotes('t', {}, teacher);
    expect(idsOf((t as any).behaviourModel.find.mock.calls[0][0], 'reportedBy')).toEqual(expect.arrayContaining([String(STAFF), String(PROFILE)]));
  });
  it('class diary (getClassDiaryEntries)', async () => {
    const t = teaching(); await t.getClassDiaryEntries('t', {}, teacher);
    expect(idsOf((t as any).classDiaryModel.find.mock.calls[0][0], 'teacherId')).toEqual(expect.arrayContaining([String(STAFF), String(PROFILE)]));
  });
  it('a teacher without a TeacherProfile still matches their Staff id (nothing breaks)', async () => {
    const t = teaching(false); await t.getLessonPlans('t', {}, teacher);
    expect(idsOf((t as any).lessonPlanModel.find.mock.calls[0][0], 'teacherId')).toEqual([String(STAFF), String(STAFF)].sort());
  });
  it('other roles keep their own behaviour: no teacherId is forced on an admin', async () => {
    const t = teaching(); await t.getLessonPlans('t', {}, admin); await t.getAssignments('t', {}, admin);
    expect((t as any).lessonPlanModel.find.mock.calls[0][0].teacherId).toBeUndefined();
    expect((t as any).assignmentModel.find.mock.calls[0][0].teacherId).toBeUndefined();
  });
});

describe('BB2: syllabus list and weekly planner', () => {
  function syllabus(withProfile = true) {
    const s: any = Object.create(SyllabusService.prototype);
    Object.assign(s, identityModels(withProfile));
    s.syllabusModel = { find: finder() };
    s.computeCurrentWeek = jest.fn(async () => null);
    return s as SyllabusService & Record<string, any>;
  }
  it('list: both ids for a teacher', async () => {
    const s = syllabus(); await s.findAll('t', {} as any, teacher);
    expect(idsOf((s as any).syllabusModel.find.mock.calls[0][0], 'teacherId')).toEqual(expect.arrayContaining([String(STAFF), String(PROFILE)]));
  });
  it('weekly planner: a TEACHER always gets their OWN (both ids), the teacherId query param is ignored', async () => {
    const s = syllabus(); await s.getTeacherWeeklyPlanner('t', 's', String(oid()), teacher);
    expect(idsOf((s as any).syllabusModel.find.mock.calls[0][0], 'teacherId')).toEqual(expect.arrayContaining([String(STAFF), String(PROFILE)]));
    expect(idsOf((s as any).syllabusModel.find.mock.calls[0][0], 'teacherId')).toHaveLength(4);
  });
  it('weekly planner: other roles keep the param, and a malformed id is a 400 (was a 500)', async () => {
    const s = syllabus(); const target = oid();
    await s.getTeacherWeeklyPlanner('t', 's', String(target), admin);
    expect(String((s as any).syllabusModel.find.mock.calls[0][0].teacherId)).toBe(String(target));
    await expect(s.getTeacherWeeklyPlanner('t', 's', 'nope', admin)).rejects.toBeInstanceOf(BadRequestException);
  });
});
