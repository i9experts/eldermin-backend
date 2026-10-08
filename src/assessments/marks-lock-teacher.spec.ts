import { ForbiddenException } from '@nestjs/common';
import { makeAssessmentService, oid, teacherUser } from './assessment-test-fakes';
import { TEACHER_MARKS_LOCKED_MESSAGE } from './assessment.service';

// Fakes only. Server-side marks lock for the teacher role (published / cancelled assessments).
const base = { title: 'Mid', subjects: [{ subject: 'Math', totalMarks: 50, passingMarks: 20 }] };
const sid = oid().toString();
const dto = () => ({ assessmentId: oid().toString(), subject: 'Math', grade: 'Grade 5', marks: [{ studentId: sid, studentName: 'Ali', rollNumber: '1', section: 'A', obtainedMarks: 10 }], schoolSlug: 's', academicYear: '2025-26', enteredBy: 'x' } as any);
const ADMINS = ['principal', 'admin', 'institution_owner', 'vice_principal', 'academic_coordinator', 'super_admin'];

describe('marks/bulk teacher lock', () => {
  it('message text is the documented one', () => {
    expect(TEACHER_MARKS_LOCKED_MESSAGE).toBe('Results for this assessment are published (or the assessment is cancelled): marks can no longer be changed. Contact an administrator.');
  });
  it.each([
    ['result_published', { status: 'result_published' }],
    ['cancelled', { status: 'cancelled' }],
    ['resultPublished flag', { status: 'completed', resultPublished: true }],
  ])('teacher: 403 on %s, nothing written, no verified lookup', async (_n, extra) => {
    const { service, markModel } = makeAssessmentService({ assessment: { ...base, ...extra } });
    await expect(service.bulkEnterMarks(dto(), teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.bulkEnterMarks(dto(), teacherUser())).rejects.toThrow(TEACHER_MARKS_LOCKED_MESSAGE);
    expect(markModel.bulkWrite).not.toHaveBeenCalled();
    expect(markModel.find).not.toHaveBeenCalled();
  });
  it.each(['scheduled', 'ongoing', 'completed', 'draft'])('teacher: %s still writes (draft is not blocked server-side)', async (status) => {
    const { service, markModel } = makeAssessmentService({ assessment: { ...base, status } });
    await service.bulkEnterMarks(dto(), teacherUser());
    expect(markModel.bulkWrite).toHaveBeenCalledTimes(1);
  });
  it.each(ADMINS)('%s can still edit published and cancelled assessments', async (role) => {
    for (const status of ['result_published', 'cancelled']) {
      const { service, markModel } = makeAssessmentService({ assessment: { ...base, status, resultPublished: status === 'result_published' } });
      await service.bulkEnterMarks(dto(), teacherUser({ role }));
      expect(markModel.bulkWrite).toHaveBeenCalledTimes(1);
    }
  });
});

describe('quiz grade teacher lock', () => {
  const q1 = oid();
  const teaches = { isClassTeacher: false, currentAssignments: [{ gradeLevel: 'Grade 5', sectionName: 'A', subjectName: 'Math' }] };
  const mkAttempt = () => ({
    _id: oid(), status: 'submitted', studentId: oid(), assessmentId: oid(), subject: 'Math', examPaperId: oid(),
    grade: 'Grade 5', section: 'A', totalMarks: 5, passingMarks: 2, schoolSlug: 's', academicYear: '2025-26',
    assessmentTitle: 'T', studentName: 'Ali', rollNumber: '1',
    answers: [{ questionId: q1, needsManualGrading: true, marksAwarded: null }],
    markModified: jest.fn(), save: jest.fn(async function (this: any) { return this; }),
  } as any);
  const mk = (attempt: any, assessment: any) => makeAssessmentService({ attempt, assessment, profile: teaches, paper: { sections: [{ questionIds: [q1] }] }, questions: [{ _id: q1, marks: 5 }] });
  const g = [{ questionId: String(q1), marksAwarded: 4 }];

  it.each(['result_published', 'cancelled'])('teacher: 403 on %s; attempt not saved, no MarkEntry written', async (status) => {
    const attempt = mkAttempt();
    const { service, markModel } = mk(attempt, { ...base, status });
    await expect(service.gradeQuizAttempt('s', String(attempt._id), g, 'Me', teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.gradeQuizAttempt('s', String(attempt._id), g, 'Me', teacherUser())).rejects.toThrow(TEACHER_MARKS_LOCKED_MESSAGE);
    expect(attempt.save).not.toHaveBeenCalled();
    expect(markModel.updateOne).not.toHaveBeenCalled();
  });
  it('teacher: ongoing/completed grades and writes the mark as today', async () => {
    for (const status of ['ongoing', 'completed']) {
      const attempt = mkAttempt();
      const { service, markModel } = mk(attempt, { ...base, status });
      await service.gradeQuizAttempt('s', String(attempt._id), g, 'Me', teacherUser());
      expect(markModel.updateOne).toHaveBeenCalledTimes(1);
    }
  });
  it.each(ADMINS)('%s can still grade on a published assessment', async (role) => {
    const attempt = mkAttempt();
    const { service, markModel } = mk(attempt, { ...base, status: 'result_published', resultPublished: true });
    await service.gradeQuizAttempt('s', String(attempt._id), g, 'Me', teacherUser({ role }));
    expect(attempt.save).toHaveBeenCalled();
    expect(markModel.updateOne).toHaveBeenCalledTimes(1);
  });
});
