import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { makeAssessmentService, me, oid, teacherUser } from './assessment-test-fakes';

const assessment = { title: 'Mid', subjects: [{ subject: 'Math', totalMarks: 50, passingMarks: 20 }] };
const sid = oid().toString();
const sid2 = oid().toString();
const row = (over: any = {}) => ({ studentId: sid, studentName: 'Ali', rollNumber: '1', section: 'A', obtainedMarks: 10, ...over });
const dto = (marks: any[]) => ({ assessmentId: oid().toString(), subject: 'Math', grade: 'Grade 5', marks, schoolSlug: 's', academicYear: '2025-26', enteredBy: 'x' } as any);

describe('marks/bulk teacher rules', () => {
  it('rejects > total (400, nothing written)', async () => {
    const { service, markModel } = makeAssessmentService({ assessment });
    await expect(service.bulkEnterMarks(dto([row({ obtainedMarks: 51 })]), teacherUser())).rejects.toBeInstanceOf(BadRequestException);
    expect(markModel.bulkWrite).not.toHaveBeenCalled();
  });
  it('lists every offending row in the message', async () => {
    const { service } = makeAssessmentService({ assessment });
    await expect(service.bulkEnterMarks(dto([row({ obtainedMarks: 99, studentName: 'Zed' }), row({ studentId: sid2, obtainedMarks: 5 }), row({ studentId: oid().toString(), studentName: 'Yan', obtainedMarks: 60 })]), teacherUser()))
      .rejects.toThrow(/2 student\(s\).*Zed.*Yan/);
  });
  it('rejects negative', async () => {
    const { service, markModel } = makeAssessmentService({ assessment });
    await expect(service.bulkEnterMarks(dto([row({ obtainedMarks: -1 })]), teacherUser())).rejects.toBeInstanceOf(BadRequestException);
    expect(markModel.bulkWrite).not.toHaveBeenCalled();
  });
  it('accepts equal to total and 0', async () => {
    const { service, markModel } = makeAssessmentService({ assessment });
    await service.bulkEnterMarks(dto([row({ obtainedMarks: 50 }), row({ studentId: sid2, obtainedMarks: 0 })]), teacherUser());
    expect(markModel.bulkWrite).toHaveBeenCalledTimes(1);
  });
  it('a verified row blocks the whole request (409, nothing written)', async () => {
    const { service, markModel } = makeAssessmentService({ assessment, existingMarks: [{ studentId: sid, studentName: 'Ali', rollNumber: '1' }] });
    await expect(service.bulkEnterMarks(dto([row(), row({ studentId: sid2 })]), teacherUser()))
      .rejects.toThrow(new ConflictException('Marks for 1 students are verified and locked: Ali (roll 1)'));
    expect(markModel.bulkWrite).not.toHaveBeenCalled();
    expect(markModel.find.mock.calls[0][0].verified).toBe(true);
  });
  it('unverified rows are written', async () => {
    const { service, markModel } = makeAssessmentService({ assessment, existingMarks: [] });
    const r = await service.bulkEnterMarks(dto([row()]), teacherUser());
    expect(markModel.bulkWrite.mock.calls[0][0]).toHaveLength(1);
    expect(r.message).toMatch(/1 students/);
  });
  it('absent/exempt rows clear stale percentage/grade/gpa (teacher)', async () => {
    const { service, markModel } = makeAssessmentService({ assessment });
    await service.bulkEnterMarks(dto([row({ obtainedMarks: null, isAbsent: true })]), teacherUser());
    const set = markModel.bulkWrite.mock.calls[0][0][0].updateOne.update.$set;
    expect(set).toMatchObject({ percentage: null, grade_result: null, gpa: null, result: 'absent' });
  });
  it('a marks value on an absent row is not bounds-checked (absent wins)', async () => {
    const { service, markModel } = makeAssessmentService({ assessment });
    await service.bulkEnterMarks(dto([row({ obtainedMarks: 500, isAbsent: true })]), teacherUser());
    expect(markModel.bulkWrite).toHaveBeenCalled();
  });
  it('non-teacher callers need no teacher context lookups (admin keeps today\'s behaviour)', async () => {
    const { service, staffModel } = makeAssessmentService({ assessment });
    await service.bulkEnterMarks(dto([row({ obtainedMarks: 500 })]), { userId: me.userId, role: 'admin', name: 'A', schoolSlug: 's' } as any);
    expect(staffModel.findOne).not.toHaveBeenCalled();
  });
  it('a teacher caller resolves their class/subject scope once (BB6)', async () => {
    const { service, staffModel } = makeAssessmentService({ assessment });
    await service.bulkEnterMarks(dto([row()]), teacherUser());
    expect(staffModel.findOne).toHaveBeenCalledTimes(1);
  });
});
