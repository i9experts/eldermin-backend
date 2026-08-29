// Pure helper behind SubjectGroup's "assign to class" action (and the
// Subjects table's bulk "Assign Selected to Class" action, which reuses
// the same merge logic per-subject). Adding a class to a subject means:
// make sure gradeLevel is in gradeLevels, and - only when a specific
// section was asked for - add a {gradeLevel, sectionName} entry to
// sections. Asking for a bare grade (no section) never removes any
// section-level narrowing that already existed for that grade; it's purely
// additive, same as everything else in this schema change.

export interface SubjectClassScope {
  gradeLevels: string[];
  sections: { gradeLevel: string; sectionName: string }[];
}

export function mergeClassAssignment(
  current: SubjectClassScope,
  gradeLevel: string,
  sectionName?: string | null,
): SubjectClassScope {
  const gradeLevels = current.gradeLevels.includes(gradeLevel)
    ? current.gradeLevels
    : [...current.gradeLevels, gradeLevel];

  if (!sectionName) {
    // Whole-grade assignment - gradeLevels alone already covers it once
    // no section-level entries exist for this grade; if some already do
    // (a previous narrower assignment), leave them as-is rather than
    // silently discarding them.
    return { gradeLevels, sections: current.sections };
  }

  const alreadyPresent = current.sections.some(
    s => s.gradeLevel === gradeLevel && s.sectionName === sectionName,
  );
  const sections = alreadyPresent
    ? current.sections
    : [...current.sections, { gradeLevel, sectionName }];

  return { gradeLevels, sections };
}
