import { ForbiddenException, Logger } from '@nestjs/common';
import { makeAssessmentService, me, oid, teacherUser } from './assessment-test-fakes';

// BB6: marks bulk-write scoped to the teacher's assigned class + subject (TEACHER_SCOPE_GUARD_MODE).
const ENV = 'TEACHER_SCOPE_GUARD_MODE';
let warn: jest.SpyInstance;
beforeEach(() => { delete process.env[ENV]; warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
afterEach(() => { warn.mockRestore(); delete process.env[ENV]; });
const logs = () => warn.mock.calls.map((c) => { try { return JSON.parse(String(c[0])); } catch { return null; } }).filter((x) => x?.event === 'teacher_scope_guard');

const assessment = (over: any = {}) => ({ title: 'Mid', grade: 'Grade 5', section: 'A', subjects: [{ subject: 'Math', totalMarks: 50, passingMarks: 20 }, { subject: 'Urdu', totalMarks: 50, passingMarks: 20 }], ...over });
const sid = oid().toString();
const dto = (subject = 'Math') => ({ assessmentId: oid().toString(), subject, grade: 'Grade 5', marks: [{ studentId: sid, studentName: 'Ali', rollNumber: '1', section: 'A', obtainedMarks: 10 }], schoolSlug: 's', academicYear: '2025-26', enteredBy: 'x' } as any);
const classTeacher = { _id: me.profileId, isClassTeacher: true, classTeacherAssignments: [{ gradeName: 'Grade 5', sectionName: 'A' }], currentAssignments: [] };
const mathTeacher = { _id: me.profileId, isClassTeacher: false, currentAssignments: [{ gradeLevel: 'Grade 5', sectionName: 'A', subjectName: 'Math' }] };

describe('BB6 marks bulk-write scope', () => {
  it('a class teacher enters marks for EVERY subject of their class; a subject teacher only for their class + subject', async () => {
    process.env[ENV] = 'enforce';
    for (const subject of ['Math', 'Urdu']) {
      const { service, markModel } = makeAssessmentService({ assessment: assessment(), profile: classTeacher });
      await service.bulkEnterMarks(dto(subject), teacherUser());
      expect(markModel.bulkWrite).toHaveBeenCalled();
    }
    const m = makeAssessmentService({ assessment: assessment(), profile: mathTeacher });
    await m.service.bulkEnterMarks(dto('Math'), teacherUser());
    expect(m.markModel.bulkWrite).toHaveBeenCalled();
    expect(logs()).toHaveLength(0);
  });
  it.each([['other subject of the class (subject teacher)', assessment(), mathTeacher, 'Urdu'], ['another class', assessment({ grade: 'Grade 6' }), mathTeacher, 'Math'],
    ['another section', assessment({ section: 'B' }), mathTeacher, 'Math'], ['no assignments', assessment(), { _id: me.profileId }, 'Math']])
  ('%s: ENFORCE 403 and nothing written; LOG writes a would_deny line and the save proceeds', async (_n, a, profile, subject) => {
    process.env[ENV] = 'enforce';
    const e = makeAssessmentService({ assessment: a, profile });
    await expect(e.service.bulkEnterMarks(dto(subject), teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    expect(e.markModel.bulkWrite).not.toHaveBeenCalled();
    expect(logs()[0]).toMatchObject({ decision: 'denied', reason: 'teacher_marks_outside_assignment', route: 'POST /assessments/marks/bulk' });
    process.env[ENV] = 'log'; warn.mockClear();
    const l = makeAssessmentService({ assessment: a, profile });
    await l.service.bulkEnterMarks(dto(subject), teacherUser());
    expect(l.markModel.bulkWrite).toHaveBeenCalled();
    expect(logs()[0]).toMatchObject({ decision: 'would_deny', mode: 'log' });
  });
  it('a section-less assessment (whole grade) is matched by class only', async () => {
    process.env[ENV] = 'enforce';
    const { service, markModel } = makeAssessmentService({ assessment: assessment({ section: undefined }), profile: mathTeacher });
    await service.bulkEnterMarks(dto('Math'), teacherUser());
    expect(markModel.bulkWrite).toHaveBeenCalled();
  });
  it('admin / coordinator callers are not scoped (no teacher context lookup)', async () => {
    process.env[ENV] = 'enforce';
    const { service, markModel, staffModel } = makeAssessmentService({ assessment: assessment({ grade: 'Grade 9' }), profile: {} });
    await service.bulkEnterMarks(dto('Math'), { userId: me.userId, role: 'academic_coordinator', name: 'C', schoolSlug: 's' } as any);
    expect(markModel.bulkWrite).toHaveBeenCalled();
    expect(staffModel.findOne).not.toHaveBeenCalled();
  });
});

// PR #243 (Mark Sheet): PATCH marks/:id edits one mark, DELETE marks/:id removes one. The edit is covered by the same class + subject scope; the delete is admin-only.
import { AssessmentController } from './assessment.controller';
import { ROLES_OR_MODULE_KEY } from '../roles/decorators/roles-or-module-manage.decorator';
import { TEACHING_ADMIN_ROLES } from '../auth/role-sets';

describe('BB6 single-mark edit (PATCH marks/:id) and delete (DELETE marks/:id)', () => {
  const mark = (over: any = {}) => ({ _id: oid(), assessmentId: oid(), studentId: oid(), studentName: 'Ali', subject: 'Math', totalMarks: 50, passingMarks: 20, verified: false, save: jest.fn(async () => undefined), ...over });
  it('a teacher edits a mark of their own class + subject: 200-equivalent, saved (enforce)', async () => {
    process.env[ENV] = 'enforce';
    const m = mark();
    const { service } = makeAssessmentService({ assessment: assessment(), profile: mathTeacher, existingMarkEntry: m });
    await service.updateMarkEntry(String(m._id), 's', { obtainedMarks: 40 }, teacherUser() as any);
    expect(m.save).toHaveBeenCalled();
    expect(logs()).toHaveLength(0);
  });
  it.each([['another subject (Urdu) of the class', assessment(), 'Urdu'], ['another class', assessment({ grade: 'Grade 6' }), 'Math']])
  ('%s: ENFORCE 403 and nothing saved; LOG saves and writes a would_deny line', async (_n, a, subject) => {
    process.env[ENV] = 'enforce';
    const m = mark({ subject });
    const e = makeAssessmentService({ assessment: a, profile: mathTeacher, existingMarkEntry: m });
    await expect(e.service.updateMarkEntry(String(m._id), 's', { obtainedMarks: 40 }, teacherUser() as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.save).not.toHaveBeenCalled();
    expect(logs()[0]).toMatchObject({ decision: 'denied', reason: 'teacher_marks_outside_assignment', route: 'PATCH /assessments/marks/:id' });
    process.env[ENV] = 'log'; warn.mockClear();
    const l = makeAssessmentService({ assessment: a, profile: mathTeacher, existingMarkEntry: m });
    await l.service.updateMarkEntry(String(m._id), 's', { obtainedMarks: 40 }, teacherUser() as any);
    expect(m.save).toHaveBeenCalled();
    expect(logs()[0]).toMatchObject({ decision: 'would_deny', mode: 'log' });
  });
  it('a class teacher edits any subject of their class; the principal / coordinator are not scoped (no teacher context lookup)', async () => {
    process.env[ENV] = 'enforce';
    const m1 = mark({ subject: 'Urdu' });
    await makeAssessmentService({ assessment: assessment(), profile: classTeacher, existingMarkEntry: m1 }).service.updateMarkEntry(String(m1._id), 's', { obtainedMarks: 10 }, teacherUser() as any);
    expect(m1.save).toHaveBeenCalled();
    const m2 = mark({ subject: 'Urdu' });
    const x = makeAssessmentService({ assessment: assessment({ grade: 'Grade 9' }), profile: {}, existingMarkEntry: m2 });
    await x.service.updateMarkEntry(String(m2._id), 's', { obtainedMarks: 10 }, { userId: me.userId, role: 'academic_coordinator', schoolSlug: 's' } as any);
    expect(m2.save).toHaveBeenCalled();
    expect(x.staffModel.findOne).not.toHaveBeenCalled();
  });
  it('DELETE marks/:id is admin roles only: the teacher role is not in its @RolesOrModuleManage set; PATCH marks/:id stays STAFF_WRITE (teacher in)', () => {
    const del = Reflect.getMetadata(ROLES_OR_MODULE_KEY, (AssessmentController.prototype as any).deleteMarkEntry);
    expect(del.roles).toEqual(TEACHING_ADMIN_ROLES);
    expect(del.roles).not.toContain('teacher');
    const patch = Reflect.getMetadata(ROLES_OR_MODULE_KEY, (AssessmentController.prototype as any).updateMarkEntry);
    expect(patch.roles).toContain('teacher');
  });
});
