// Explicit field allowlists for what a guardian may receive about their
// child's academic results (Assessment Master Settings' parent-visibility
// rules), same convention as parent-behaviour.projection.ts (B0 security
// fix: anything not listed is never sent, so a new ReportCard/TermReportCard
// field is private by default).
//
// A child's own marks/grade/GPA/subject breakdown are what a results app is
// for and are gated only by the school's shareGPA/shareSubjectBreakdown
// settings (both default ON). classPosition/totalStudents/
// classAveragePercentage are cohort-comparison data the school may not want
// shared at all - gated by shareClassPosition/shareClassAverage, BOTH
// DEFAULT OFF, and excluded entirely (not just zeroed) when off so a parent
// app can't infer anything from a present-but-null field.
//
// Never sent regardless of settings (internal-only): schoolSlug, campusId,
// principalRemarks (staff-to-staff, not for a parent), gradingScale/
// gradingScaleSnapshotted/framework (how the grade was computed, not the
// grade itself).

import { AssessmentVisibilitySettings } from '../assessments/schemas/assessment-visibility-settings.schema';

export const PARENT_REPORT_CARD_BASE_FIELDS = [
  '_id', 'assessmentId', 'assessmentTitle', 'assessmentType',
  'studentId', 'studentName', 'rollNumber', 'grade', 'section', 'academicYear', 'term',
  'totalMaxMarks', 'totalObtainedMarks', 'overallPercentage', 'overallGrade', 'overallResult',
  'classTeacherRemarks', 'published', 'publishedAt',
] as const;

export const PARENT_SUBJECT_REPORT_BASE_FIELDS = ['subject', 'totalMarks', 'obtainedMarks', 'percentage', 'grade', 'result', 'remarks'] as const;

export const PARENT_TERM_REPORT_CARD_BASE_FIELDS = [
  '_id', 'studentId', 'studentName', 'rollNumber', 'grade', 'section', 'academicYear', 'term',
  'assessmentsIncluded', 'totalObtainedMarks', 'totalMaxMarks', 'overallPercentage', 'overallGrade', 'overallResult',
  'strongestSubject', 'weakestSubject', 'sectionsIncluded',
  'tarbiyah', 'qaida', 'nazra', 'qaidaNazraExtras', 'attendance', 'parentEngagement', 'teacherFeedback',
  'classTeacherRemarks', 'principalRemarks', 'published', 'publishedAt',
] as const;

export const PARENT_TERM_SUBJECT_SUMMARY_BASE_FIELDS = ['subject', 'obtainedMarks', 'totalMarks', 'percentage', 'grade', 'isAbsent'] as const;

export function pickFields(doc: any, fields: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  if (!doc) return out;
  for (const f of fields) if (doc[f] !== undefined) out[f] = doc[f];
  return out;
}

type VisibilityLike = Pick<AssessmentVisibilitySettings, 'shareGPA' | 'shareSubjectBreakdown' | 'shareClassPosition' | 'shareClassAverage'>;

export function projectParentReportCard(rc: any, settings: VisibilityLike): Record<string, any> {
  const out = pickFields(rc, PARENT_REPORT_CARD_BASE_FIELDS);
  if (settings.shareGPA) out.overallGPA = rc.overallGPA;
  if (settings.shareSubjectBreakdown && Array.isArray(rc.subjects)) {
    out.subjects = rc.subjects.map((s: any) => {
      const sub = pickFields(s, PARENT_SUBJECT_REPORT_BASE_FIELDS);
      if (settings.shareGPA) sub.gpa = s.gpa;
      return sub;
    });
  }
  if (settings.shareClassPosition) {
    out.classPosition = rc.classPosition;
    out.totalStudents = rc.totalStudents;
  }
  if (settings.shareClassAverage) out.classAveragePercentage = rc.classAveragePercentage;
  return out;
}

export function projectParentTermReportCard(rc: any, settings: VisibilityLike): Record<string, any> {
  const out = pickFields(rc, PARENT_TERM_REPORT_CARD_BASE_FIELDS);
  if (settings.shareGPA) out.overallGPA = rc.overallGPA;
  if (settings.shareSubjectBreakdown && Array.isArray(rc.subjects)) {
    out.subjects = rc.subjects.map((s: any) => pickFields(s, PARENT_TERM_SUBJECT_SUMMARY_BASE_FIELDS));
  }
  if (settings.shareClassPosition) {
    out.classPosition = rc.classPosition;
    out.totalStudents = rc.totalStudents;
  }
  if (settings.shareClassAverage) out.classAveragePercentage = rc.classAveragePercentage;
  return out;
}
