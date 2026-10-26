// ============================================================
// PERFORMANCE ANALYTICS — pure, unit-tested aggregation helpers
// ============================================================
// Kept separate from AssessmentService so the actual "who is strong,
// who is weak, in what" logic can be tested against plain arrays
// instead of a live Mongo aggregation pipeline. Mirrors the exact
// absent/exempt handling generateReportCards already uses (an absence
// counts as 0 earned against that subject's full marks; an exemption
// drops the subject out of both sides) so a student's "overall %" here
// never silently disagrees with their actual report card.
// ============================================================

export interface AnalyticsMarkRow {
  studentId: string;
  studentName: string;
  grade: string;
  section?: string;
  subject: string;
  totalMarks: number;
  obtainedMarks: number | null;
  isAbsent: boolean;
  isExempt: boolean;
}

export interface StudentOverallStat {
  studentId: string;
  studentName: string;
  grade: string;
  section?: string;
  totalObtained: number;
  totalMax: number;
  overallPct: number;
  subjects: Array<{ subject: string; pct: number; obtainedMarks: number; totalMarks: number; isAbsent: boolean }>;
  strongestSubject: { subject: string; pct: number } | null;
  weakestSubject: { subject: string; pct: number } | null;
}

/** One row per student: their overall %, plus which of their own
 * subjects (within whatever filter scope the caller already applied)
 * is personally strongest/weakest - a student's own "weak area" is
 * relative to themselves, not the class average. Exempt subjects are
 * excluded entirely (matches generateReportCards); an absence counts
 * as 0 earned but still consumes the subject's full marks. A student
 * with every subject exempt/absent-with-zero-total is skipped (nothing
 * to measure). */
export function computeStudentOverallStats(marks: AnalyticsMarkRow[]): StudentOverallStat[] {
  const byStudent = new Map<string, AnalyticsMarkRow[]>();
  for (const m of marks) {
    const key = m.studentId;
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key)!.push(m);
  }

  const results: StudentOverallStat[] = [];
  for (const [studentId, rows] of byStudent) {
    const scored = rows.filter((m) => !m.isExempt);
    if (scored.length === 0) continue;
    const totalMax = scored.reduce((a, m) => a + (m.totalMarks || 0), 0);
    const totalObtained = scored.filter((m) => !m.isAbsent).reduce((a, m) => a + (m.obtainedMarks || 0), 0);
    if (totalMax <= 0) continue;
    const overallPct = parseFloat(((totalObtained / totalMax) * 100).toFixed(1));

    // One entry per subject (a student can have multiple mark rows for
    // the same subject across different assessments within the filtered
    // scope - combine them rather than treating each as a separate
    // "subject").
    const bySubject = new Map<string, { obtained: number; total: number; anyAbsent: boolean }>();
    for (const m of scored) {
      const cur = bySubject.get(m.subject) || { obtained: 0, total: 0, anyAbsent: false };
      cur.total += m.totalMarks || 0;
      if (!m.isAbsent) cur.obtained += m.obtainedMarks || 0;
      else cur.anyAbsent = true;
      bySubject.set(m.subject, cur);
    }
    const subjects = Array.from(bySubject.entries()).map(([subject, v]) => ({
      subject, obtainedMarks: v.obtained, totalMarks: v.total, isAbsent: v.anyAbsent,
      pct: v.total > 0 ? parseFloat(((v.obtained / v.total) * 100).toFixed(1)) : 0,
    }));
    const bySubjectPct = [...subjects].sort((a, b) => b.pct - a.pct);

    results.push({
      studentId, studentName: rows[0].studentName, grade: rows[0].grade, section: rows[0].section,
      totalObtained, totalMax, overallPct, subjects,
      strongestSubject: bySubjectPct.length > 0 ? { subject: bySubjectPct[0].subject, pct: bySubjectPct[0].pct } : null,
      weakestSubject: bySubjectPct.length > 0 ? { subject: bySubjectPct[bySubjectPct.length - 1].subject, pct: bySubjectPct[bySubjectPct.length - 1].pct } : null,
    });
  }
  return results;
}

const GRADE_BANDS = [
  { grade: 'A+', min: 90 }, { grade: 'A', min: 80 }, { grade: 'B+', min: 70 },
  { grade: 'B', min: 60 }, { grade: 'C', min: 50 }, { grade: 'D', min: 40 }, { grade: 'F', min: 0 },
] as const;

/** Letter-grade distribution across a set of students' overall % -
 * same bands assessment.service.ts's getGrade() uses for report cards,
 * so this chart and an individual report card never disagree. */
export function gradeDistribution(stats: StudentOverallStat[]): Array<{ grade: string; count: number }> {
  const counts = new Map(GRADE_BANDS.map((b) => [b.grade, 0]));
  for (const s of stats) {
    const band = GRADE_BANDS.find((b) => s.overallPct >= b.min) || GRADE_BANDS[GRADE_BANDS.length - 1];
    counts.set(band.grade, (counts.get(band.grade) || 0) + 1);
  }
  return GRADE_BANDS.map((b) => ({ grade: b.grade, count: counts.get(b.grade) || 0 }));
}

/** Grade+section comparison - average overall %, pass rate (>=40%,
 * matching the 'D' band floor used everywhere else) and headcount per
 * class, for spotting which specific class is lagging. */
export function classComparison(stats: StudentOverallStat[]): Array<{ grade: string; section: string; avgPct: number; passRate: number; studentCount: number }> {
  const byClass = new Map<string, StudentOverallStat[]>();
  for (const s of stats) {
    const key = `${s.grade}||${s.section || ''}`;
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key)!.push(s);
  }
  return Array.from(byClass.entries()).map(([key, group]) => {
    const [grade, section] = key.split('||');
    const avgPct = parseFloat((group.reduce((a, s) => a + s.overallPct, 0) / group.length).toFixed(1));
    const passRate = parseFloat(((group.filter((s) => s.overallPct >= 40).length / group.length) * 100).toFixed(1));
    return { grade, section, avgPct, passRate, studentCount: group.length };
  }).sort((a, b) => a.avgPct - b.avgPct);
}

export interface QuizAnswerRow {
  isCorrect: boolean | null;
  question: { subject: string; topic?: string; chapter?: string; bloomsLevel: string; difficulty: string } | null;
}

export interface TopicStat { subject: string; topic: string; chapter: string; attempts: number; correct: number; accuracyPct: number }
export interface LevelStat { level: string; attempts: number; correct: number; accuracyPct: number }

/** Topic/chapter, Bloom's-level and difficulty-level accuracy from
 * auto-graded online quiz answers (mcq/true_false) - the one place
 * Eldermin actually has PER-QUESTION right/wrong data, since a
 * teacher-marked paper only ever records one total score per subject.
 * Answers still awaiting manual grading (isCorrect === null) are
 * excluded rather than counted as wrong. */
export function computeQuizInsights(answers: QuizAnswerRow[]): { byTopic: TopicStat[]; byBloomsLevel: LevelStat[]; byDifficulty: LevelStat[] } {
  const graded = answers.filter((a) => a.isCorrect !== null && a.question);

  const topicMap = new Map<string, TopicStat>();
  const bloomMap = new Map<string, LevelStat>();
  const difficultyMap = new Map<string, LevelStat>();

  for (const a of graded) {
    const q = a.question!;
    const topicKey = `${q.subject}||${q.topic || 'Untopiced'}||${q.chapter || ''}`;
    const t = topicMap.get(topicKey) || { subject: q.subject, topic: q.topic || 'Untopiced', chapter: q.chapter || '', attempts: 0, correct: 0, accuracyPct: 0 };
    t.attempts += 1;
    if (a.isCorrect) t.correct += 1;
    topicMap.set(topicKey, t);

    const b = bloomMap.get(q.bloomsLevel) || { level: q.bloomsLevel, attempts: 0, correct: 0, accuracyPct: 0 };
    b.attempts += 1;
    if (a.isCorrect) b.correct += 1;
    bloomMap.set(q.bloomsLevel, b);

    const d = difficultyMap.get(q.difficulty) || { level: q.difficulty, attempts: 0, correct: 0, accuracyPct: 0 };
    d.attempts += 1;
    if (a.isCorrect) d.correct += 1;
    difficultyMap.set(q.difficulty, d);
  }

  const finalize = <T extends { attempts: number; correct: number; accuracyPct: number }>(m: Map<string, T>) =>
    Array.from(m.values()).map((v) => ({ ...v, accuracyPct: v.attempts > 0 ? parseFloat(((v.correct / v.attempts) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => a.accuracyPct - b.accuracyPct);

  return { byTopic: finalize(topicMap), byBloomsLevel: finalize(bloomMap), byDifficulty: finalize(difficultyMap) };
}
