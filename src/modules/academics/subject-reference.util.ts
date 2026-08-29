// Pure, framework-free helpers for AcademicsService's subject-delete guard
// (see PR "subject scoping and groups"). A Subject is catalog/config data,
// so a genuine hard delete is fine once it's confirmed unreferenced - but
// several other collections point at a subject either by its ObjectId
// (Curriculum.subjectId, Syllabus.subjectId, SubjectGroup.subjectIds - all
// real refs) or, for the older modules that predate Subject having a
// stable id, by its name as a plain string (Timetable periods' `subject`
// field, ElectiveGroup.subject). Kept dependency-free so the "what's
// blocking this delete" logic is directly unit-testable without mocking
// five different Mongoose models.

export interface SubjectRefCounts {
  curricula: number;
  syllabi: number;
  timetablePeriods: number;
  electiveGroups: number;
  subjectGroups: number;
}

/**
 * Turns raw reference counts into the human-readable list of reasons a
 * subject can't be deleted yet - empty array means it's safe to hard
 * delete. Mirrors the "name what's using it" convention used elsewhere
 * (e.g. Teaching's deleteTimetable active-status guard).
 */
export function describeSubjectBlockers(counts: SubjectRefCounts): string[] {
  const reasons: string[] = [];
  if (counts.curricula > 0) {
    reasons.push(`${counts.curricula} curriculum record${counts.curricula === 1 ? '' : 's'}`);
  }
  if (counts.syllabi > 0) {
    reasons.push(`${counts.syllabi} syllabus document${counts.syllabi === 1 ? '' : 's'}`);
  }
  if (counts.timetablePeriods > 0) {
    reasons.push(`${counts.timetablePeriods} timetable${counts.timetablePeriods === 1 ? '' : 's'} with scheduled periods`);
  }
  if (counts.electiveGroups > 0) {
    reasons.push(`${counts.electiveGroups} elective group${counts.electiveGroups === 1 ? '' : 's'}`);
  }
  if (counts.subjectGroups > 0) {
    reasons.push(`${counts.subjectGroups} subject group${counts.subjectGroups === 1 ? '' : 's'}`);
  }
  return reasons;
}

/** Builds the full "cannot delete" message from the blocker list. */
export function buildSubjectInUseMessage(reasons: string[]): string {
  return `Cannot delete this subject - it is still referenced by ${reasons.join(', ')}. Remove or reassign those first, or deactivate the subject instead.`;
}
