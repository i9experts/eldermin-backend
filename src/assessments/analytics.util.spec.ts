import {
  computeStudentOverallStats, gradeDistribution, classComparison, computeQuizInsights,
} from './analytics.util';

describe('computeStudentOverallStats', () => {
  it('treats an absence as 0 earned but still counts its full marks, and excludes exempt subjects entirely', () => {
    const stats = computeStudentOverallStats([
      { studentId: 's1', studentName: 'Ayesha', grade: 'Grade-1', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 80, isAbsent: false, isExempt: false },
      { studentId: 's1', studentName: 'Ayesha', grade: 'Grade-1', section: 'A', subject: 'English', totalMarks: 100, obtainedMarks: null, isAbsent: true, isExempt: false },
      { studentId: 's1', studentName: 'Ayesha', grade: 'Grade-1', section: 'A', subject: 'Art', totalMarks: 50, obtainedMarks: null, isAbsent: false, isExempt: true },
    ]);
    expect(stats).toHaveLength(1);
    // totalMax = 100 (Math) + 100 (English, absent still counts) = 200, excluding exempt Art.
    expect(stats[0].totalMax).toBe(200);
    expect(stats[0].totalObtained).toBe(80);
    expect(stats[0].overallPct).toBe(40);
  });

  it('identifies the strongest and weakest subject relative to the student themselves', () => {
    const stats = computeStudentOverallStats([
      { studentId: 's1', studentName: 'Bilal', grade: 'Grade-2', section: 'A', subject: 'Math', totalMarks: 100, obtainedMarks: 95, isAbsent: false, isExempt: false },
      { studentId: 's1', studentName: 'Bilal', grade: 'Grade-2', section: 'A', subject: 'Science', totalMarks: 100, obtainedMarks: 40, isAbsent: false, isExempt: false },
    ]);
    expect(stats[0].strongestSubject).toEqual({ subject: 'Math', pct: 95 });
    expect(stats[0].weakestSubject).toEqual({ subject: 'Science', pct: 40 });
  });

  it('combines multiple mark rows for the same subject (e.g. two assessments) into one subject entry', () => {
    const stats = computeStudentOverallStats([
      { studentId: 's1', studentName: 'Sana', grade: 'Grade-3', section: 'A', subject: 'Math', totalMarks: 50, obtainedMarks: 40, isAbsent: false, isExempt: false },
      { studentId: 's1', studentName: 'Sana', grade: 'Grade-3', section: 'A', subject: 'Math', totalMarks: 50, obtainedMarks: 30, isAbsent: false, isExempt: false },
    ]);
    expect(stats[0].subjects).toHaveLength(1);
    expect(stats[0].subjects[0]).toMatchObject({ subject: 'Math', obtainedMarks: 70, totalMarks: 100, pct: 70 });
  });

  it('skips a student whose only marks are exempt (nothing left to measure)', () => {
    const stats = computeStudentOverallStats([
      { studentId: 's1', studentName: 'Zoya', grade: 'Grade-1', section: 'A', subject: 'Art', totalMarks: 50, obtainedMarks: null, isAbsent: false, isExempt: true },
    ]);
    expect(stats).toHaveLength(0);
  });
});

describe('gradeDistribution', () => {
  it('buckets overall percentages into the same A+/A/B+/B/C/D/F bands as report cards', () => {
    const stats: any[] = [
      { overallPct: 95 }, { overallPct: 85 }, { overallPct: 72 }, { overallPct: 61 },
      { overallPct: 55 }, { overallPct: 41 }, { overallPct: 20 },
    ];
    const dist = gradeDistribution(stats);
    expect(dist).toEqual([
      { grade: 'A+', count: 1 }, { grade: 'A', count: 1 }, { grade: 'B+', count: 1 },
      { grade: 'B', count: 1 }, { grade: 'C', count: 1 }, { grade: 'D', count: 1 }, { grade: 'F', count: 1 },
    ]);
  });
});

describe('classComparison', () => {
  it('ranks classes by average % ascending (lagging class first) and computes a 40%-floor pass rate', () => {
    const stats: any[] = [
      { grade: 'Grade-1', section: 'A', overallPct: 90 },
      { grade: 'Grade-1', section: 'A', overallPct: 30 },
      { grade: 'Grade-1', section: 'B', overallPct: 50 },
      { grade: 'Grade-1', section: 'B', overallPct: 60 },
    ];
    const result = classComparison(stats);
    expect(result[0]).toMatchObject({ grade: 'Grade-1', section: 'B', avgPct: 55, passRate: 100, studentCount: 2 });
    expect(result[1]).toMatchObject({ grade: 'Grade-1', section: 'A', avgPct: 60, passRate: 50, studentCount: 2 });
  });
});

describe('computeQuizInsights', () => {
  it('computes per-topic, per-Blooms-level and per-difficulty accuracy, excluding ungraded answers', () => {
    const { byTopic, byBloomsLevel, byDifficulty } = computeQuizInsights([
      { isCorrect: true, question: { subject: 'Math', topic: 'Fractions', chapter: 'Ch 3', bloomsLevel: 'apply', difficulty: 'medium' } },
      { isCorrect: false, question: { subject: 'Math', topic: 'Fractions', chapter: 'Ch 3', bloomsLevel: 'apply', difficulty: 'medium' } },
      { isCorrect: false, question: { subject: 'Math', topic: 'Geometry', chapter: 'Ch 5', bloomsLevel: 'analyze', difficulty: 'hard' } },
      { isCorrect: null, question: { subject: 'Math', topic: 'Geometry', chapter: 'Ch 5', bloomsLevel: 'analyze', difficulty: 'hard' } },
    ]);
    expect(byTopic).toEqual(expect.arrayContaining([
      expect.objectContaining({ topic: 'Geometry', attempts: 1, correct: 0, accuracyPct: 0 }),
      expect.objectContaining({ topic: 'Fractions', attempts: 2, correct: 1, accuracyPct: 50 }),
    ]));
    // sorted weakest-accuracy first
    expect(byTopic[0].topic).toBe('Geometry');
    expect(byBloomsLevel).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'apply', attempts: 2, correct: 1, accuracyPct: 50 }),
      expect.objectContaining({ level: 'analyze', attempts: 1, correct: 0, accuracyPct: 0 }),
    ]));
    expect(byDifficulty).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'medium', attempts: 2, correct: 1, accuracyPct: 50 }),
      expect.objectContaining({ level: 'hard', attempts: 1, correct: 0, accuracyPct: 0 }),
    ]));
  });
});
