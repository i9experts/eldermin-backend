import { AssessmentService } from './assessment.service';

// End-to-end wiring check for getPerformanceAnalytics - the pure math
// (grade bands, weak/strong subject, topic accuracy, etc) is already
// covered in analytics.util.spec.ts; this just pins that the service
// resolves assessments by filter, pulls marks/quiz answers scoped to
// those assessments, and assembles the final response shape the
// Analytics tab reads.

function chain(result: any) {
  return { select: () => ({ lean: () => Promise.resolve(result) }) };
}

function makeService(models: { assessment?: any[]; marks?: any[]; attempts?: any[]; questions?: any[] }) {
  const n: any = {};
  const assessmentModel: any = { find: () => chain(models.assessment ?? []) };
  const markModel: any = { find: () => chain(models.marks ?? []) };
  const quizAttemptModel: any = { find: () => chain(models.attempts ?? []) };
  const questionModel: any = { find: () => chain(models.questions ?? []) };
  const args = [
    assessmentModel, questionModel, markModel, n, n, n, quizAttemptModel,
    n, n, n, n, n, n, n, n, n, n, n,
  ];
  const AssessmentServiceAny: any = AssessmentService;
  return new AssessmentServiceAny(...args) as AssessmentService;
}

describe('AssessmentService.getPerformanceAnalytics', () => {
  it('scopes marks to assessments matching the filters and assembles subject-wise, grade distribution and at-risk students', async () => {
    const a1 = { _id: 'a1', title: 'Term 1 Test', type: 'class_test', term: 'Term 1', startDate: new Date('2026-09-01'), grade: 'Grade-1', section: 'A' };
    const service = makeService({
      assessment: [a1],
      marks: [
        { studentId: 's1', studentName: 'Ayesha', grade: 'Grade-1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 90, isAbsent: false, isExempt: false, result: 'pass', assessmentId: 'a1' },
        { studentId: 's2', studentName: 'Bilal', grade: 'Grade-1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 20, isAbsent: false, isExempt: false, result: 'fail', assessmentId: 'a1' },
      ],
    });

    const result: any = await service.getPerformanceAnalytics('demo-school', { academicYear: '2026-27', grade: 'Grade-1' });

    expect(result.meta.totalAssessments).toBe(1);
    expect(result.meta.totalStudentsEvaluated).toBe(2);
    expect(result.subjectWise).toEqual([{ subject: 'Math', total: 2, avgPct: 55, passRate: 50 }]);
    expect(result.gradeDistribution.find((g: any) => g.grade === 'A+').count).toBe(1);
    expect(result.atRiskStudents).toHaveLength(1);
    expect(result.atRiskStudents[0].studentName).toBe('Bilal');
    expect(result.topPerformers[0].studentName).toBe('Ayesha');
    expect(result.trendByAssessment).toEqual([expect.objectContaining({ assessmentId: 'a1', title: 'Term 1 Test', avgPct: 55 })]);
  });

  it('returns quiz-only topic/Blooms/difficulty insights joined from Question data', async () => {
    const a1 = { _id: 'a1', title: 'Online Quiz', type: 'quiz', term: 'Term 1', startDate: new Date(), grade: 'Grade-2', section: null };
    const service = makeService({
      assessment: [a1],
      marks: [],
      attempts: [{ answers: [{ questionId: 'q1', isCorrect: true }, { questionId: 'q2', isCorrect: false }] }],
      questions: [
        { _id: 'q1', subject: 'Science', topic: 'Plants', chapter: 'Ch 1', bloomsLevel: 'remember', difficulty: 'easy' },
        { _id: 'q2', subject: 'Science', topic: 'Animals', chapter: 'Ch 2', bloomsLevel: 'analyze', difficulty: 'hard' },
      ],
    });

    const result: any = await service.getPerformanceAnalytics('demo-school', { academicYear: '2026-27' });

    expect(result.meta.totalQuizAttempts).toBe(1);
    expect(result.byTopic).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic: 'Animals', accuracyPct: 0 }),
      expect.objectContaining({ topic: 'Plants', accuracyPct: 100 }),
    ]));
    expect(result.byBloomsLevel).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'remember', accuracyPct: 100 }),
      expect.objectContaining({ level: 'analyze', accuracyPct: 0 }),
    ]));
  });

  it('returns empty, well-shaped results when no assessment matches the filters', async () => {
    const service = makeService({ assessment: [] });
    const result: any = await service.getPerformanceAnalytics('demo-school', { academicYear: '2026-27', grade: 'Grade-9' });
    expect(result.meta.totalAssessments).toBe(0);
    expect(result.subjectWise).toEqual([]);
    expect(result.topPerformers).toEqual([]);
    expect(result.byTopic).toEqual([]);
  });
});
