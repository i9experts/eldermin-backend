import { ForbiddenException } from '@nestjs/common';
import { makeAssessmentService, oid, teacherUser } from './assessment-test-fakes';
import { sameSubject, teacherSubjectAssignmentsOf } from '../staff-portal/teacher-identity.util';

// Item 3: class teacher = all subjects of own class; subject teacher = class AND subject; both = union. Fakes only.
const q1 = oid();
const att = (grade: string, section: string | undefined, subject: string, over: any = {}) => ({
  _id: oid(), grade, section, subject, status: 'submitted', studentId: oid(), assessmentId: oid(), examPaperId: oid(), totalMarks: 5,
  answers: [{ questionId: q1, needsManualGrading: true, marksAwarded: null }], schoolSlug: 's', academicYear: 'y', ...over,
});
const a5aMath = att('Grade 5', 'A', 'Math');
const a5aEng = att('Grade 5', 'A', 'English');
const a5bMath = att('Grade 5', 'B', 'Math');
const a6bEng = att('Grade 6', 'B', 'English');
const a6bMath = att('Grade 6', 'B', 'Math');
const a7cSci = att('Grade 7', 'C', 'Science');
const all = [a5aMath, a5aEng, a5bMath, a6bEng, a6bMath, a7cSci];
const paper = { sections: [{ questionIds: [q1] }] };

const classTeacher5A = { isClassTeacher: true, classTeacherOfGradeName: 'Grade 5', classTeacherOfSectionName: 'A', currentAssignments: [] };
const subjectTeacher = { isClassTeacher: false, currentAssignments: [{ gradeLevel: 'Grade 6', sectionName: 'B', subjectName: 'English' }] };
const both = { ...classTeacher5A, currentAssignments: [{ gradeLevel: 'Grade 6', sectionName: 'B', subjectName: 'English' }] };

const list = async (profile: any, extra: any = {}) => {
  const { service } = makeAssessmentService({ attempts: all, profile, ...extra });
  return service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser());
};

describe('quiz scope: class teacher / subject teacher / both', () => {
  it('class teacher: ALL subjects of own class, nothing else', async () => {
    expect(await list(classTeacher5A)).toEqual([a5aMath, a5aEng]);
  });
  it('subject teacher: only class AND subject matches (English of 6-B, not Math of 6-B)', async () => {
    expect(await list(subjectTeacher)).toEqual([a6bEng]);
  });
  it('both: union of all subjects in own class and assigned subject elsewhere', async () => {
    expect(await list(both)).toEqual([a5aMath, a5aEng, a6bEng]);
  });
  it('subject teacher of a class they teach another subject in does not get the rest', async () => {
    const p = { isClassTeacher: false, currentAssignments: [{ gradeLevel: 'Grade 5', sectionName: 'A', subjectName: 'Math' }] };
    expect(await list(p)).toEqual([a5aMath]);
  });
  it('assignment without a section covers every section of that grade for that subject', async () => {
    const p = { isClassTeacher: false, currentAssignments: [{ gradeLevel: '5', subjectName: 'Math' }] };
    expect(await list(p)).toEqual([a5aMath, a5bMath]);
  });
  it('assignment without subjectName grants nothing (class-only no longer enough)', async () => {
    const p = { isClassTeacher: false, currentAssignments: [{ gradeLevel: 'Grade 5', sectionName: 'A' }] };
    expect(await list(p)).toEqual([]);
  });
  it('class teacher flag without a class name grants nothing', async () => {
    expect(await list({ isClassTeacher: true, currentAssignments: [] })).toEqual([]);
  });
  it('no-class teacher sees nothing; no staff record -> 403', async () => {
    expect(await list({ isClassTeacher: false, currentAssignments: [] })).toEqual([]);
    const ns = makeAssessmentService({ attempts: all, staff: null });
    await expect(ns.service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([
    ['  english ', 'English'], ['ENGLISH', 'english'], ['Islamic  Studies', 'islamic studies'], ['Islamic Studies\t', ' Islamic Studies'],
  ])('subject spelling variant %j matches %j', (assigned, stored) => {
    expect(sameSubject(assigned, stored)).toBe(true);
  });
  it('subject spelling variants work end to end; empty subjects never match', async () => {
    const p = { isClassTeacher: false, currentAssignments: [{ gradeLevel: 'grade 6', sectionName: 'b', subjectName: '  ENGLISH ' }, { gradeLevel: 'Grade 7', sectionName: 'C', subjectName: '' }] };
    expect(await list(p)).toEqual([a6bEng]);
    expect(sameSubject('', '')).toBe(false);
    expect(sameSubject('Math', 'Maths')).toBe(false);
  });
  it('grade/section tolerant spellings (5 / g5, a)', async () => {
    const p = { isClassTeacher: true, classTeacherOfGradeName: 'g5', classTeacherOfSectionName: 'a', currentAssignments: [] };
    expect(await list(p)).toEqual([a5aMath, a5aEng]);
  });
  it('attempt without a section is resolved from the student', async () => {
    const noSec = att('Grade 5', undefined, 'Math');
    const studentRows = [{ _id: noSec.studentId, currentSection: 'A' }];
    const { service, studentModel } = makeAssessmentService({ attempts: [noSec], profile: classTeacher5A, studentRows });
    expect(await service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser())).toEqual([noSec]);
    expect(studentModel.find).toHaveBeenCalledTimes(1);
    // and is excluded when the student's section is another class
    const other = makeAssessmentService({ attempts: [noSec], profile: classTeacher5A, studentRows: [{ _id: noSec.studentId, currentSection: 'B' }] });
    expect(await other.service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser())).toEqual([]);
  });
  it('teacherSubjectAssignmentsOf ignores rows lacking grade or subject', () => {
    expect(teacherSubjectAssignmentsOf({ currentAssignments: [{ gradeLevel: 'G5', subjectName: 'Math', sectionName: 'A' }, { subjectName: 'X' }, { gradeLevel: 'G5' }] }))
      .toEqual([{ grade: 'G5', section: 'A', subject: 'Math' }]);
  });
});

describe('quiz detail GET :id scope', () => {
  const detail = (attempt: any, profile: any) => makeAssessmentService({ attempt, profile, paper }).service
    .getQuizAttemptForReview('s', String(attempt._id), teacherUser());
  it('class teacher: any subject of own class ok; other class 403', async () => {
    await expect(detail(a5aEng, classTeacher5A)).resolves.toBeDefined();
    await expect(detail(a6bEng, classTeacher5A)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('subject teacher: matching subject ok; other subject of same class 403', async () => {
    await expect(detail(a6bEng, subjectTeacher)).resolves.toBeDefined();
    await expect(detail(a6bMath, subjectTeacher)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(detail(a5aEng, subjectTeacher)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('both: union; unrelated 403', async () => {
    await expect(detail(a5aMath, both)).resolves.toBeDefined();
    await expect(detail(a6bEng, both)).resolves.toBeDefined();
    await expect(detail(a6bMath, both)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(detail(a7cSci, both)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('quiz grade POST :id/grade scope', () => {
  const grade = (attempt: any, profile: any) => {
    const a: any = { ...attempt, markModified: jest.fn(), save: jest.fn(async function (this: any) { return this; }) };
    return makeAssessmentService({ attempt: a, profile, paper, questions: [{ _id: q1, marks: 5 }] }).service
      .gradeQuizAttempt('s', String(a._id), [{ questionId: String(q1), marksAwarded: 3 }], 'Ms Me', teacherUser());
  };
  it('class teacher grades any subject of own class; 403 elsewhere', async () => {
    await expect(grade(a5aEng, classTeacher5A)).resolves.toBeDefined();
    await expect(grade(a6bEng, classTeacher5A)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('subject teacher grades only class+subject', async () => {
    await expect(grade(a6bEng, subjectTeacher)).resolves.toBeDefined();
    await expect(grade(a6bMath, subjectTeacher)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(grade(a5aMath, subjectTeacher)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('both: union', async () => {
    await expect(grade(a5aEng, both)).resolves.toBeDefined();
    await expect(grade(a6bEng, both)).resolves.toBeDefined();
    await expect(grade(a6bMath, both)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('teacher with no classes -> 403', async () => {
    await expect(grade(a5aMath, { isClassTeacher: false, currentAssignments: [] })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe.each(['principal', 'admin', 'institution_owner', 'vice_principal', 'academic_coordinator', 'super_admin'])('%s unchanged', (role) => {
  it('school-wide list without any staff/profile lookup; detail of any class; grade not scoped', async () => {
    const { service, staffModel } = makeAssessmentService({ attempts: all });
    expect(await service.getQuizAttemptsPendingReview('s', undefined, undefined, teacherUser({ role }))).toEqual(all);
    const d = makeAssessmentService({ attempt: a7cSci, paper });
    await expect(d.service.getQuizAttemptForReview('s', String(a7cSci._id), teacherUser({ role }))).resolves.toBeDefined();
    const a: any = { ...a7cSci, markModified: jest.fn(), save: jest.fn(async function (this: any) { return this; }) };
    const g = makeAssessmentService({ attempt: a, paper, questions: [{ _id: q1, marks: 5 }] });
    await expect(g.service.gradeQuizAttempt('s', String(a._id), [{ questionId: String(q1), marksAwarded: 99 }], 'x', teacherUser({ role }))).resolves.toBeDefined();
    expect(staffModel.findOne).not.toHaveBeenCalled();
  });
});
