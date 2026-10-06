// ============================================================
// Grade / section comparison helpers for teacher-class scoping
// ============================================================
// Findings (what the repo actually stores):
//  - seed-demo.js grades: 'Pre-Nursery','Nursery','KG-1','KG-2','Grade 1'..'Grade 12';
//    sections 'A','B','C'. Student.currentGrade / currentSection are free-text
//    strings (students.service getDistinctGradesSections derives the filter
//    options from the raw strings, so whatever admins typed/imported occurs).
//  - Organization Grade.name is what gets copied into
//    TeacherProfile.classTeacherOfGradeName (organization.service), so it is
//    usually 'Grade 3'. TeacherProfile.currentAssignments[].gradeLevel and
//    Timetable/Subject gradeLevel are free text too; specs in the repo use
//    both bare '5' and 'Grade 6'. Student imports/UI may produce '5', 'grade 5',
//    ' A ' etc. Strict equality therefore wrongly 403s legitimate teachers.
//
// Normalisation (case-insensitive, trimmed, whitespace collapsed):
//  - grade: strip a leading 'grade' / 'class' / 'std' / 'standard' / 'g'
//    ONLY when immediately followed (after optional space, '-', '_', '.') by
//    a digit, so 'Grade 3', 'grade-3', 'Class 3', 'G3', '3' all become '3'.
//    Leading zeros on pure numbers are dropped ('03' -> '3').
//  - Deliberately NOT mapped: roman numerals, number words ('One'),
//    'Nursery' vs 'KG-1' (distinct values stay distinct), 'Pre-Nursery'.
//    Matching is whole-string equality, never substring, so '1' != '11'.
//  - section: also strips a leading 'section ' / 'sec ' prefix.
// null/undefined/'' all normalise to ''.
// ============================================================

const collapse = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' ').toLowerCase();

export function normalizeGradeName(v: unknown): string {
  let s = collapse(v);
  s = s.replace(/^(?:grade|class|standard|std|g)[\s\-_.]*(?=\d)/, '');
  if (/^\d+$/.test(s)) s = String(parseInt(s, 10));
  return s;
}

export function normalizeSectionName(v: unknown): string {
  let s = collapse(v);
  s = s.replace(/^(?:section|sec)[\s\-_.:]+(?=\S)/, '');
  return s;
}

export function sameGrade(a: unknown, b: unknown): boolean {
  return normalizeGradeName(a) === normalizeGradeName(b);
}

export function sameSection(a: unknown, b: unknown): boolean {
  return normalizeSectionName(a) === normalizeSectionName(b);
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

/**
 * Mongo-queryable equivalent of sameGrade(): matches every stored spelling
 * of a grade ('Grade 3', 'grade-3', 'G3', '3', '03', ...) for the given one.
 */
export function gradeMatcher(grade: unknown): RegExp {
  const n = normalizeGradeName(grade);
  if (/^\d+$/.test(n)) return new RegExp(`^\\s*(?:(?:grade|class|standard|std|g)[\\s\\-_.]*)?0*${n}\\s*$`, 'i');
  return new RegExp(`^\\s*${escapeRe(n)}\\s*$`, 'i');
}

/** Mongo-queryable equivalent of sameSection(). */
export function sectionMatcher(section: unknown): RegExp {
  const n = normalizeSectionName(section);
  return new RegExp(`^\\s*(?:(?:section|sec)[\\s\\-_.:]+)?${escapeRe(n)}\\s*$`, 'i');
}
