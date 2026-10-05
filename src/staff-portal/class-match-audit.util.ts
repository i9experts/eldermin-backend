import { normalizeGradeName, normalizeSectionName, sameGrade, sameSection } from '../common/utils/class-match.util';

export interface AuditStudent { id: string; name?: string; grade?: string | null; section?: string | null }
export interface AuditAssignment {
  teacherId: string; teacherName?: string;
  grade?: string | null; section?: string | null;
  source: 'classTeacher' | 'assignment';
}

/** Same rule the portal uses: grade must match; section only checked when the assignment has one. */
export function assignmentMatchesStudent(a: AuditAssignment, s: AuditStudent): boolean {
  return sameGrade(a.grade, s.grade) && (!normalizeSectionName(a.section) || sameSection(a.section, s.section));
}

export interface ClassMatchAudit {
  unmatchedStudents: AuditStudent[];
  unmatchedAssignments: AuditAssignment[];
  studentRaw: { grades: Record<string, number>; sections: Record<string, number> };
  assignmentRaw: { grades: Record<string, number>; sections: Record<string, number> };
  totals: { students: number; assignments: number };
}

const bump = (m: Record<string, number>, k: unknown) => {
  const key = k === null || k === undefined || k === '' ? '(empty)' : JSON.stringify(String(k));
  m[key] = (m[key] || 0) + 1;
};

/** Pure: no I/O. Assignments with no grade are ignored for matching (they cannot scope anything). */
export function auditClassMatching(students: AuditStudent[], assignments: AuditAssignment[]): ClassMatchAudit {
  const usable = assignments.filter((a) => normalizeGradeName(a.grade));
  const studentRaw = { grades: {} as Record<string, number>, sections: {} as Record<string, number> };
  const assignmentRaw = { grades: {} as Record<string, number>, sections: {} as Record<string, number> };
  students.forEach((s) => { bump(studentRaw.grades, s.grade); bump(studentRaw.sections, s.section); });
  assignments.forEach((a) => { bump(assignmentRaw.grades, a.grade); bump(assignmentRaw.sections, a.section); });

  return {
    unmatchedStudents: students.filter((s) => !usable.some((a) => assignmentMatchesStudent(a, s))),
    unmatchedAssignments: usable.filter((a) => !students.some((s) => assignmentMatchesStudent(a, s))),
    studentRaw, assignmentRaw,
    totals: { students: students.length, assignments: usable.length },
  };
}
