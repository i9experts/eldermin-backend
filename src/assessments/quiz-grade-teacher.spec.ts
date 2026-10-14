import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { makeAssessmentService, oid, teacherUser } from './assessment-test-fakes';

const q1 = oid(); const q2 = oid(); const qAuto = oid();
const questions = [{ _id: q1, marks: 5 }, { _id: q2, marks: 10 }, { _id: qAuto, marks: 2 }];
const paper = { sections: [{ questionIds: [q1, q2, qAuto] }] };
const teaches = { isClassTeacher: false, currentAssignments: [{ gradeLevel: 'Grade 5', sectionName: 'A', subjectName: 'Math' }] };

function mkAttempt(over: any = {}) {
  const a: any = {
    _id: oid(), status: 'submitted', studentId: oid(), assessmentId: oid(), subject: 'Math', examPaperId: oid(),
    grade: 'Grade 5', section: 'A', totalMarks: 17, passingMarks: 6, schoolSlug: 's', academicYear: '2025-26',
    assessmentTitle: 'T', studentName: 'Ali', rollNumber: '1',
    answers: [
      { questionId: q1, needsManualGrading: true, marksAwarded: null },
      { questionId: q2, needsManualGrading: true, marksAwarded: null },
      { questionId: qAuto, needsManualGrading: false, marksAwarded: 2 },
    ],
    markModified: jest.fn(), save: jest.fn(async function (this: any) { return this; }),
    ...over,
  };
  return a;
}
const mk = (attempt: any, extra: any = {}) => makeAssessmentService({ attempt, profile: teaches, paper, questions, ...extra });
const grades = (a: number, b: number) => [{ questionId: String(q1), marksAwarded: a }, { questionId: String(q2), marksAwarded: b }];

describe('quiz grade: teacher bounds / re-grade / scope', () => {
  it('score above the question max -> 400 listing the question; nothing saved', async () => {
    const attempt = mkAttempt();
    const { service } = mk(attempt);
    await expect(service.gradeQuizAttempt('s', String(attempt._id), grades(6, 3), 'Me', teacherUser())).rejects.toThrow(new RegExp(`${q1}.*allowed 0..5`));
    expect(attempt.save).not.toHaveBeenCalled();
  });
  it('negative -> 400', async () => {
    const attempt = mkAttempt();
    const { service } = mk(attempt);
    await expect(service.gradeQuizAttempt('s', String(attempt._id), grades(-1, 3), 'Me', teacherUser())).rejects.toBeInstanceOf(BadRequestException);
  });
  it('lists all offending questions', async () => {
    const attempt = mkAttempt();
    const { service } = mk(attempt);
    await expect(service.gradeQuizAttempt('s', String(attempt._id), grades(9, 11), 'Me', teacherUser())).rejects.toThrow(/2 question\(s\)/);
  });
  it('a question that is not manual for this attempt (auto) is rejected', async () => {
    const attempt = mkAttempt();
    const { service } = mk(attempt);
    await expect(service.gradeQuizAttempt('s', String(attempt._id), [{ questionId: String(qAuto), marksAwarded: 1 }], 'Me', teacherUser())).rejects.toBeInstanceOf(BadRequestException);
  });
  it('equal to max is fine and completes + writes the mark', async () => {
    const attempt = mkAttempt();
    const { service, markModel } = mk(attempt);
    await service.gradeQuizAttempt('s', String(attempt._id), grades(5, 10), 'Me', teacherUser());
    expect(attempt.status).toBe('graded');
    expect(attempt.obtainedMarks).toBe(17);
    expect(markModel.updateOne).toHaveBeenCalledTimes(1);
  });
  it('re-grade of a graded attempt -> 409', async () => {
    const attempt = mkAttempt({ status: 'graded' });
    const { service } = mk(attempt);
    await expect(service.gradeQuizAttempt('s', String(attempt._id), grades(1, 1), 'Me', teacherUser())).rejects.toBeInstanceOf(ConflictException);
    expect(attempt.save).not.toHaveBeenCalled();
  });
  it('attempt outside my classes -> 403', async () => {
    const attempt = mkAttempt({ grade: 'Grade 7' });
    const { service } = mk(attempt);
    await expect(service.gradeQuizAttempt('s', String(attempt._id), grades(1, 1), 'Me', teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('no staff record -> 403', async () => {
    const attempt = mkAttempt();
    const { service } = mk(attempt, { staff: null });
    await expect(service.gradeQuizAttempt('s', String(attempt._id), grades(1, 1), 'Me', teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe.each(['principal', 'admin', 'institution_owner', 'academic_coordinator'])('quiz grade %s unchanged', (role) => {
  it('no bounds, re-grade allowed, no class scope, no staff lookup', async () => {
    const attempt = mkAttempt({ status: 'graded', grade: 'Grade 9' });
    const { service, staffModel, examPaperModel } = mk(attempt);
    await service.gradeQuizAttempt('s', String(attempt._id), grades(99, -4), 'Boss', teacherUser({ role }));
    expect(attempt.save).toHaveBeenCalled();
    expect(attempt.answers[0].marksAwarded).toBe(99);
    expect(staffModel.findOne).not.toHaveBeenCalled();
    expect(examPaperModel.findOne).not.toHaveBeenCalled();
  });
});

describe('MarkEntry upsert on completion (all roles: data integrity)', () => {
  const finish = async (existing: any, role = 'admin') => {
    const attempt = mkAttempt();
    const ctx = mk(attempt, { existingMarkEntry: existing });
    await ctx.service.gradeQuizAttempt('s', String(attempt._id), grades(5, 10), 'X', teacherUser({ role }));
    return { ...ctx, attempt };
  };
  it('no existing entry -> inserted with provenance marker', async () => {
    const { markModel, attempt } = await finish(null);
    const [filter, update, opts] = markModel.updateOne.mock.calls[0];
    expect(update.$set.quizAttemptId).toBe(attempt._id);
    expect(opts).toEqual({ upsert: true });
    expect(filter.subject).toBe('Math');
  });
  it('verified entry is never overwritten (even a quiz one)', async () => {
    const { markModel } = await finish({ verified: true, quizAttemptId: oid() });
    expect(markModel.updateOne).not.toHaveBeenCalled();
  });
  it('manually entered (unverified) entry is not overwritten', async () => {
    const { markModel } = await finish({ verified: false, enteredBy: 'Ms Teacher' });
    expect(markModel.updateOne).not.toHaveBeenCalled();
  });
  it('entry from a quiz attempt (marker) is updated', async () => {
    const { markModel } = await finish({ verified: false, quizAttemptId: oid(), enteredBy: 'Online Quiz (auto)' });
    expect(markModel.updateOne).toHaveBeenCalledTimes(1);
  });
  it('legacy quiz entry (enteredBy marker only) is updated', async () => {
    const { markModel } = await finish({ verified: false, enteredBy: 'Online Quiz (auto)' });
    expect(markModel.updateOne).toHaveBeenCalledTimes(1);
  });
  it('the grade itself still succeeds when the mark is protected (teacher too)', async () => {
    const { attempt } = await finish({ verified: true }, 'teacher');
    expect(attempt.status).toBe('graded');
  });
});
