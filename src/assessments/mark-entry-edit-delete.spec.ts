import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { makeAssessmentService, oid, teacherUser } from './assessment-test-fakes';

// Pins the fix for "Mark Sheet has no way to edit/delete an already-saved
// mark" - the only other entry point (bulkEnterMarks) always seeds blank
// rows from the class roster, so there was genuinely no way to correct or
// remove a single mark short of re-running the whole subject's entry.
// updateMarkEntry/deleteMarkEntry close that gap.

function makeMark(over: any = {}) {
  return {
    _id: oid(), assessmentId: oid(), studentId: oid(), studentName: 'Ali', rollNumber: '1',
    subject: 'Math', totalMarks: 50, passingMarks: 20, obtainedMarks: 30, isAbsent: false, isExempt: false,
    percentage: 60, grade_result: 'B', gpa: 3.0, result: 'pass', verified: false, schoolSlug: 's',
    save: jest.fn(async function (this: any) { return this; }),
    ...over,
  };
}

describe('updateMarkEntry', () => {
  it('recomputes percentage/grade/gpa/result from the new obtainedMarks', async () => {
    const mark = makeMark();
    const { service } = makeAssessmentService({ existingMarkEntry: mark });
    const result = await service.updateMarkEntry(String(mark._id), 's', { obtainedMarks: 45 });
    expect(result.obtainedMarks).toBe(45);
    expect(result.percentage).toBe(90);
    expect(result.grade_result).toBe('A+');
    expect(result.result).toBe('pass');
    expect(mark.save).toHaveBeenCalledTimes(1);
  });

  it('marking a student absent clears the numeric fields and sets result to absent', async () => {
    const mark = makeMark();
    const { service } = makeAssessmentService({ existingMarkEntry: mark });
    const result = await service.updateMarkEntry(String(mark._id), 's', { isAbsent: true });
    expect(result.obtainedMarks).toBeUndefined();
    expect(result.percentage).toBeNull();
    expect(result.grade_result).toBeNull();
    expect(result.result).toBe('absent');
  });

  it('rejects an obtainedMarks above the mark\'s own totalMarks', async () => {
    const mark = makeMark({ totalMarks: 50 });
    const { service } = makeAssessmentService({ existingMarkEntry: mark });
    await expect(service.updateMarkEntry(String(mark._id), 's', { obtainedMarks: 60 })).rejects.toBeInstanceOf(BadRequestException);
    expect(mark.save).not.toHaveBeenCalled();
  });

  it('404s when the mark does not exist (or belongs to a different school)', async () => {
    const { service } = makeAssessmentService({ existingMarkEntry: null });
    await expect(service.updateMarkEntry(String(oid()), 's', { obtainedMarks: 10 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a teacher is blocked from editing a verified (locked) mark', async () => {
    const mark = makeMark({ verified: true });
    const { service } = makeAssessmentService({ existingMarkEntry: mark, assessment: { status: 'ongoing' } });
    await expect(service.updateMarkEntry(String(mark._id), 's', { obtainedMarks: 10 }, teacherUser())).rejects.toBeInstanceOf(ConflictException);
    expect(mark.save).not.toHaveBeenCalled();
  });

  it('a teacher is blocked once the assessment\'s results are published, same as bulk entry', async () => {
    const mark = makeMark();
    const { service } = makeAssessmentService({ existingMarkEntry: mark, assessment: { status: 'result_published' } });
    await expect(service.updateMarkEntry(String(mark._id), 's', { obtainedMarks: 10 }, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an admin can still edit a verified mark - same overwrite behaviour as bulk entry', async () => {
    const mark = makeMark({ verified: true });
    const { service } = makeAssessmentService({ existingMarkEntry: mark, assessment: { status: 'result_published' } });
    const result = await service.updateMarkEntry(String(mark._id), 's', { obtainedMarks: 10 }, teacherUser({ role: 'admin' }));
    expect(result.obtainedMarks).toBe(10);
    expect(mark.save).toHaveBeenCalledTimes(1);
  });
});

describe('deleteMarkEntry', () => {
  it('deletes the mark', async () => {
    const mark = makeMark();
    const { service, markModel } = makeAssessmentService({ existingMarkEntry: mark });
    const result = await service.deleteMarkEntry(String(mark._id), 's');
    expect(result).toEqual({ success: true });
    expect(markModel.findOneAndDelete).toHaveBeenCalledWith({ _id: String(mark._id), schoolSlug: 's' });
  });

  it('404s when the mark does not exist (or belongs to a different school)', async () => {
    const { service } = makeAssessmentService({ existingMarkEntry: null });
    await expect(service.deleteMarkEntry(String(oid()), 's')).rejects.toBeInstanceOf(NotFoundException);
  });
});
