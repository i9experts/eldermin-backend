import 'reflect-metadata';
import { ForbiddenException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';
import { TeachingController } from './teaching.controller';
import { ROLES_KEY } from '../../auth/decorators';
import { SCHOOL_STAFF_ROLES } from '../../auth/role-sets';

// BB6: a teacher may only view/grade submissions of homework in their own classes/subjects (TEACHER_SCOPE_GUARD_MODE), parents/students never.
const oid = () => new Types.ObjectId();
const STAFF = oid(), PROFILE = oid(), CAMPUS = String(oid());
const teacher: any = { userId: oid().toHexString(), role: 'teacher', name: 'T', schoolSlug: 's', tenantId: 't', campusId: CAMPUS };
const ENV = 'TEACHER_SCOPE_GUARD_MODE';
let warn: jest.SpyInstance;
beforeEach(() => { delete process.env[ENV]; warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
afterEach(() => { warn.mockRestore(); delete process.env[ENV]; });
const logs = () => warn.mock.calls.map((c) => { try { return JSON.parse(String(c[0])); } catch { return null; } }).filter((x) => x?.event === 'teacher_scope_guard');

const assignment = (over: any = {}) => ({ _id: oid(), teacherId: oid(), campusId: CAMPUS, gradeLevel: 'Grade 5', sectionName: 'A', subject: 'Maths', title: 'HW', ...over });
function svc(a: any, profile: any) {
  const s: any = Object.create(TeachingService.prototype);
  s.staffModel = { findOne: jest.fn(() => ({ lean: async () => ({ _id: STAFF, firstName: 'T', lastName: 'X' }) })) };
  s.teacherProfileModel = { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: PROFILE, ...profile }) }) })) };
  s.assignmentModel = { findOne: jest.fn(() => ({ lean: async () => a })) };
  const sub = { _id: oid(), assignmentId: a._id, tenantId: 't', maxGrade: 100, studentId: oid(), save: jest.fn(async () => undefined), toObject: () => ({ ok: true }) };
  s.submissionModel = { find: jest.fn(() => { const c: any = { sort: () => c, lean: async () => [sub] }; return c; }), findOne: jest.fn(async () => sub) };
  s.recomputeAssignmentStats = jest.fn(async () => null); s.notifyGuardians = jest.fn(async () => undefined);
  return { s: s as TeachingService, sub };
}
const classTeacher = { isClassTeacher: true, classTeacherAssignments: [{ gradeName: 'Grade 5', sectionName: 'A' }] };
const subjectTeacher = { currentAssignments: [{ gradeLevel: 'Grade 5', sectionName: 'A', subjectName: 'Maths' }] };
const read = (a: any, p: any) => { const x = svc(a, p); return x.s.getSubmissionsForAssignment('t', String(a._id), teacher); };
const grade = (a: any, p: any) => { const x = svc(a, p); return x.s.gradeSubmission('t', String(a._id), String(x.sub._id), { grade: 5 } as any, teacher); };

describe('BB6 homework submissions: who may view and grade', () => {
  it.each([['owner by Staff id', (a: any) => (a.teacherId = STAFF), {}], ['owner by TeacherProfile id (admin-created row)', (a: any) => (a.teacherId = PROFILE), {}],
    ['class teacher of the class, any subject', () => undefined, classTeacher], ['subject teacher of class + subject', () => undefined, subjectTeacher]])
  ('%s: allowed in enforce mode, no would-deny line', async (_n, mut: any, profile) => {
    process.env[ENV] = 'enforce';
    const a: any = assignment(); mut(a);
    await expect(read(a, profile)).resolves.toBeTruthy();
    await expect(grade(a, profile)).resolves.toBeTruthy();
    expect(logs()).toHaveLength(0);
  });
  it.each([['another class', assignment({ gradeLevel: 'Grade 6' }), subjectTeacher], ['same class, other subject', assignment({ subject: 'Urdu' }), subjectTeacher], ['no classes at all', assignment(), {}],
    ['another section', assignment({ sectionName: 'B' }), classTeacher]])
  ('%s: ENFORCE 403 on read and grade; LOG proceeds and writes a would_deny line', async (_n, a: any, profile) => {
    process.env[ENV] = 'enforce';
    await expect(read(a, profile)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(grade(a, profile)).rejects.toBeInstanceOf(ForbiddenException);
    expect(logs().map((l) => l.decision)).toEqual(['denied', 'denied']);
    expect(logs()[0]).toMatchObject({ reason: 'teacher_submissions_outside_classes', mode: 'enforce' });
    process.env[ENV] = 'log'; warn.mockClear();
    await expect(read(a, profile)).resolves.toBeTruthy();
    await expect(grade(a, profile)).resolves.toBeTruthy();
    expect(logs().map((l) => l.decision)).toEqual(['would_deny', 'would_deny']);
    expect(JSON.stringify(logs())).not.toMatch(/HW|title|studentName/);
  });
  it('another campus is refused for everyone (grade had no campus check before)', async () => {
    const a = assignment({ campusId: String(oid()) }); a.teacherId = STAFF;
    await expect(read(a, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(grade(a, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('non-teacher staff roles keep today\'s behaviour (no profile lookup)', async () => {
    process.env[ENV] = 'enforce';
    const a = assignment(); const x = svc(a, {});
    await expect(x.s.getSubmissionsForAssignment('t', String(a._id), { userId: oid().toHexString(), role: 'principal', campusId: CAMPUS } as any)).resolves.toBeTruthy();
    expect((x.s as any).teacherProfileModel.findOne).not.toHaveBeenCalled();
  });
});

describe('BB6: parents and students never reach the submission routes (hard, not behind a flag)', () => {
  it.each(['getAssignments', 'getSubmissions', 'gradeSubmission'])('%s carries @Roles(SCHOOL_STAFF_ROLES): parent, student and reseller are not in it', (h) => {
    const roles = Reflect.getMetadata(ROLES_KEY, (TeachingController.prototype as any)[h]) as string[];
    expect(roles).toBeDefined();
    expect([...roles].sort()).toEqual([...SCHOOL_STAFF_ROLES].sort());
    for (const r of ['parent', 'student', 'reseller_admin', 'reseller_support']) expect(roles).not.toContain(r);
    for (const r of ['teacher', 'principal', 'admin', 'academic_coordinator']) expect(roles).toContain(r);
  });
});
