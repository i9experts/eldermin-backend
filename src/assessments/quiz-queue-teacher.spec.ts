import { ForbiddenException } from '@nestjs/common';
import { makeAssessmentService, oid, teacherUser } from './assessment-test-fakes';

const a = (grade: string, section: string) => ({ _id: oid(), grade, section, status: 'submitted', examPaperId: oid(), answers: [] });
const all = [a('Grade 5', 'A'), a('5', 'B'), a('Grade 6', 'A'), a('Grade 7', 'C')];
const paper = { sections: [{ questionIds: [] }] };

describe('quiz queue scoping: teacher', () => {
  it('assignment with a section: only that class (tolerant spelling)', async () => {
    const profile = { isClassTeacher: false, currentAssignments: [{ gradeLevel: '5', sectionName: 'a' }] };
    const { service } = makeAssessmentService({ attempts: all, profile });
    const r = await service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser());
    expect(r).toEqual([all[0]]);
  });
  it('class teacher class + assignments are unioned; assignment without section covers all sections', async () => {
    const profile = { isClassTeacher: true, classTeacherOfGradeName: 'Grade 7', classTeacherOfSectionName: 'C', currentAssignments: [{ gradeLevel: 'Grade 5' }] };
    const { service } = makeAssessmentService({ attempts: all, profile });
    const r = await service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser());
    expect(r).toEqual([all[0], all[1], all[3]]);
  });
  it('teacher with no classes sees nothing; no staff record -> 403', async () => {
    const none = makeAssessmentService({ attempts: all, profile: { isClassTeacher: false, currentAssignments: [] } });
    expect(await none.service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser())).toEqual([]);
    const ns = makeAssessmentService({ attempts: all, staff: null });
    await expect(ns.service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('GET :id outside my classes -> 403, inside -> ok', async () => {
    const profile = { isClassTeacher: false, currentAssignments: [{ gradeLevel: 'Grade 5', sectionName: 'A' }] };
    const out = makeAssessmentService({ attempt: all[2], profile, paper });
    await expect(out.service.getQuizAttemptForReview('s', String(all[2]._id), teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
    const inn = makeAssessmentService({ attempt: all[0], profile, paper });
    await expect(inn.service.getQuizAttemptForReview('s', String(all[0]._id), teacherUser())).resolves.toBeDefined();
  });
});

describe.each(['principal', 'admin', 'institution_owner', 'academic_coordinator'])('quiz queue %s unchanged', (role) => {
  it('school-wide list, no staff lookup', async () => {
    const { service, staffModel } = makeAssessmentService({ attempts: all });
    expect(await service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser({ role }))).toEqual(all);
    expect(staffModel.findOne).not.toHaveBeenCalled();
  });
  it('GET :id of any class works', async () => {
    const { service, staffModel } = makeAssessmentService({ attempt: all[3], paper });
    await expect(service.getQuizAttemptForReview('s', String(all[3]._id), teacherUser({ role }))).resolves.toBeDefined();
    expect(staffModel.findOne).not.toHaveBeenCalled();
  });
});
