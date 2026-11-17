import { Types } from 'mongoose';
import { AssessmentService } from './assessment.service';

// Regression coverage for the comprehensive Term Report Card feature:
// a cumulative, whole-term report combining every assessment in a term
// (with a TERM-WIDE class position, not a single-exam one) plus optional
// Tarbiyah/Qaida/Nazra/attendance/teacher-feedback/parent-engagement
// snapshots, requested so a school can generate one rich report per
// student per term instead of per exam.

const chain = (v: any) => {
  const c: any = {
    lean: () => Promise.resolve(v),
    select: () => c,
    sort: () => c,
    skip: () => c,
    limit: () => c,
    then: (r: any, j: any) => Promise.resolve(v).then(r, j),
  };
  return c;
};

const oid = () => new Types.ObjectId();

function buildService(o: {
  students?: any[];
  assessments?: any[];
  marks?: any[];
  sections?: any;
  behaviourService?: any;
  qaidaService?: any;
  nazraService?: any;
  qaidaNazraExtrasService?: any;
  studentsService?: any;
  parentEngagementService?: any;
}) {
  const studentModel: any = { find: jest.fn(() => chain(o.students ?? [])) };
  const assessmentModel: any = { find: jest.fn(() => chain(o.assessments ?? [])) };
  const markModel: any = { find: jest.fn(() => chain(o.marks ?? [])) };
  const termReportCardModel: any = {
    findOneAndUpdate: jest.fn(async (_filter: any, update: any) => ({ _id: oid(), ...update.$set })),
    find: jest.fn(() => chain([])),
    countDocuments: jest.fn(async () => 0),
    db: {},
  };
  const noop: any = {};
  const service = new AssessmentService(
    assessmentModel, noop /*question*/, markModel, noop /*reportCard*/, noop /*examPaper*/, noop /*omr*/, noop /*quizAttempt*/,
    studentModel, noop /*school*/, noop /*campus*/, noop /*institution*/, noop /*grade*/, noop /*subject*/,
    noop /*staff*/, noop /*teacherProfile*/, noop /*config*/, noop /*pdf*/, noop /*upload*/,
    undefined /*gamification*/,
    termReportCardModel,
    o.behaviourService, o.qaidaService, o.nazraService, o.qaidaNazraExtrasService, o.studentsService, o.parentEngagementService,
  );
  return { service, termReportCardModel, studentModel, assessmentModel, markModel };
}

const student = (over: any = {}) => ({ _id: oid(), status: 'active', firstName: 'A', lastName: 'Student', admissionNumber: 'R1', currentGrade: 'Grade-1', currentSection: 'A', ...over });

describe('AssessmentService.generateTermReportCards', () => {
  it('generates a term report card per student, ranked within their own grade/section', async () => {
    const s1 = student({ admissionNumber: 'R1' });
    const s2 = student({ admissionNumber: 'R2' });
    const assessmentId = oid();
    const assessment = { _id: assessmentId, title: 'Mid Term', type: 'mid_term', academicYear: '2025-26', term: 'Term 1', startDate: new Date('2025-09-01'), endDate: new Date('2025-09-10') };
    const marks = [
      { studentId: s1._id, studentName: 'A Student', grade: 'Grade-1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 90, isAbsent: false, isExempt: false, assessmentId, remarks: 'Great job' },
      { studentId: s2._id, studentName: 'A Student', grade: 'Grade-1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 60, isAbsent: false, isExempt: false, assessmentId },
    ];
    const { service, termReportCardModel } = buildService({ students: [s1, s2], assessments: [assessment], marks });

    const result = await service.generateTermReportCards({ academicYear: '2025-26', term: 'Term 1', schoolSlug: 's' } as any);

    expect(result.count).toBe(2);
    expect(termReportCardModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    const calls = termReportCardModel.findOneAndUpdate.mock.calls;
    const top = calls.find((c: any) => c[1].$set.studentId.equals(s1._id))[1].$set;
    const bottom = calls.find((c: any) => c[1].$set.studentId.equals(s2._id))[1].$set;
    expect(top.classPosition).toBe(1);
    expect(bottom.classPosition).toBe(2);
    expect(top.totalStudents).toBe(2);
    expect(top.overallPercentage).toBe(90);
  });

  it('still generates a report for a student with no marks this term, with the academic section left blank', async () => {
    // e.g. a Qaida/Hifz-only student who sat no written exams this term -
    // Tarbiyah/Qaida/Attendance can all be real even with zero Marks.
    const withMarks = student();
    const withoutMarks = student();
    const assessmentId = oid();
    const assessment = { _id: assessmentId, title: 'Mid Term', type: 'mid_term', academicYear: '2025-26', term: 'Term 1', startDate: new Date(), endDate: new Date() };
    const marks = [
      { studentId: withMarks._id, studentName: 'A Student', grade: 'Grade-1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 80, isAbsent: false, isExempt: false, assessmentId },
    ];
    const { service, termReportCardModel } = buildService({ students: [withMarks, withoutMarks], assessments: [assessment], marks });

    const result = await service.generateTermReportCards({ academicYear: '2025-26', term: 'Term 1', schoolSlug: 's' } as any);

    expect(result.count).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.message).toContain('1 with no marks on record');
    expect(termReportCardModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    const calls = termReportCardModel.findOneAndUpdate.mock.calls;
    const withoutMarksDoc = calls.find((c: any) => c[1].$set.studentId.equals(withoutMarks._id))[1].$set;
    expect(withoutMarksDoc.hasAcademicData).toBe(false);
    expect(withoutMarksDoc.subjects).toEqual([]);
    expect(withoutMarksDoc.totalObtainedMarks).toBe(0);
    expect(withoutMarksDoc.overallResult).toBeUndefined();
    expect(withoutMarksDoc.grade).toBe('Grade-1');
    const withMarksDoc = calls.find((c: any) => c[1].$set.studentId.equals(withMarks._id))[1].$set;
    expect(withMarksDoc.hasAcademicData).toBe(true);
  });

  it('still generates a report when no assessments exist yet for the term (purely qualitative sections)', async () => {
    const { service, termReportCardModel } = buildService({ students: [student()], assessments: [], marks: [] });
    const result = await service.generateTermReportCards({ academicYear: '2025-26', term: 'Term 1', schoolSlug: 's' } as any);
    expect(result.count).toBe(1);
    expect(termReportCardModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const saved = termReportCardModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(saved.hasAcademicData).toBe(false);
    expect(saved.subjects).toEqual([]);
  });

  it('includes the Tarbiyah section only when requested and the service is available', async () => {
    const s = student();
    const assessmentId = oid();
    const assessment = { _id: assessmentId, title: 'Mid Term', type: 'mid_term', academicYear: '2025-26', term: 'Term 1', startDate: new Date(), endDate: new Date() };
    const marks = [{ studentId: s._id, studentName: 'A Student', grade: 'Grade-1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 70, isAbsent: false, isExempt: false, assessmentId }];
    const behaviourService: any = {
      getTarbiyahAssessments: jest.fn(async () => ({ data: [{ period: 'Term 1 2025-26', overallScore: 4.2, overallPercentage: 84, overallRating: 'good', traits: [], teacherObservations: 'Doing well' }] })),
      getStudentBehaviourProfile: jest.fn(async () => ({ recent: [] })),
    };
    const { service, termReportCardModel } = buildService({ students: [s], assessments: [assessment], marks, behaviourService });

    await service.generateTermReportCards({ academicYear: '2025-26', term: 'Term 1', schoolSlug: 's', sections: { tarbiyah: true } } as any);

    const saved = termReportCardModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(saved.tarbiyah).toMatchObject({ overallScore: 4.2, overallRating: 'good' });
    expect(saved.sectionsIncluded.tarbiyah).toBe(true);
    expect(saved.sectionsIncluded.attendance).toBe(false);
  });

  it('leaves a section null (not an error) when its service is unavailable, even if requested', async () => {
    const s = student();
    const assessmentId = oid();
    const assessment = { _id: assessmentId, title: 'Mid Term', type: 'mid_term', academicYear: '2025-26', term: 'Term 1', startDate: new Date(), endDate: new Date() };
    const marks = [{ studentId: s._id, studentName: 'A Student', grade: 'Grade-1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 70, isAbsent: false, isExempt: false, assessmentId }];
    const { service, termReportCardModel } = buildService({ students: [s], assessments: [assessment], marks });

    await service.generateTermReportCards({ academicYear: '2025-26', term: 'Term 1', schoolSlug: 's', sections: { tarbiyah: true, attendance: true, parentEngagement: true } } as any);

    const saved = termReportCardModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(saved.tarbiyah).toBeNull();
    expect(saved.attendance).toBeNull();
    expect(saved.parentEngagement).toBeNull();
  });

  it('scopes to a single student when scopeType is student', async () => {
    const s1 = student();
    const assessmentId = oid();
    const assessment = { _id: assessmentId, title: 'Mid Term', type: 'mid_term', academicYear: '2025-26', term: 'Term 1', startDate: new Date(), endDate: new Date() };
    const marks = [{ studentId: s1._id, studentName: 'A Student', grade: 'Grade-1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 70, isAbsent: false, isExempt: false, assessmentId }];
    const { service, studentModel } = buildService({ students: [s1], assessments: [assessment], marks });

    await service.generateTermReportCards({ academicYear: '2025-26', term: 'Term 1', schoolSlug: 's', scopeType: 'student', scopeValue: String(s1._id) } as any);

    expect(studentModel.find).toHaveBeenCalledWith(expect.objectContaining({ _id: expect.any(Types.ObjectId) }));
  });
});
