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
