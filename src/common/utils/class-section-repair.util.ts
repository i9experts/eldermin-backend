// ============================================================
// CLASS/SECTION DATA REPAIR — shared core for the admin-triggerable
// repair tool (Institution Setup -> Classes & Sections, and the
// super-admin "all schools" variant) and the older ops-only
// `fix-student-class-section-names` script, which now delegates here
// instead of keeping its own separate copy of this logic.
//
// Student.currentGrade/currentSection are free-text, no-FK fields that
// drift from the real Grade/Section master over time (typos/casing
// variants like "Grade-1" vs "GRADE-1", or a full class label typed
// into the grade field during a CSV import, e.g. "KG-B"). That drift is
// invisible until a feature that filters students by the master's exact
// spelling - a class teacher's own Attendance register being the one
// most likely to be reported as "nobody shows" - quietly returns zero
// students for an otherwise perfectly normal class.
// ============================================================

export interface RepairGrade {
  name: string;
  sections?: Array<{ name?: string; isActive?: boolean }>;
}

export interface RepairStudent {
  id: string;
  name: string;
  currentGrade?: string;
  currentSection?: string;
}

export interface ClassSectionFix {
  studentId: string;
  studentName: string;
  oldGrade: string;
  oldSection: string;
  newGrade?: string;
  newSection?: string;
}

export interface ClassSectionUnresolved {
  studentId: string;
  studentName: string;
  currentGrade: string;
  currentSection: string;
}

export interface ClassSectionRepairReport {
  totalStudents: number;
  fixes: ClassSectionFix[];
  unresolved: ClassSectionUnresolved[];
}

const normalize = (s: string) => String(s || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

/** Pure, read-only: computes what WOULD change, touching nothing. */
export function computeClassSectionRepair(grades: RepairGrade[], students: RepairStudent[]): ClassSectionRepairReport {
  const gradeByNorm = new Map<string, string>();
  const sectionIndex = new Map<string, { gradeName: string; sectionName: string }>();
  for (const g of grades) {
    gradeByNorm.set(normalize(g.name), g.name);
    for (const s of g.sections || []) {
      if (s.isActive === false || !s.name) continue;
      sectionIndex.set(normalize(s.name), { gradeName: g.name, sectionName: s.name });
    }
  }

  const fixes: ClassSectionFix[] = [];
  const unresolved: ClassSectionUnresolved[] = [];

  for (const s of students) {
    const rawGrade = s.currentGrade || '';
    const rawSection = s.currentSection || '';
    let newGrade: string | undefined = gradeByNorm.get(normalize(rawGrade));
    let newSection: string | undefined;

    if (newGrade) {
      const grade = grades.find((g) => g.name === newGrade);
      const match = (grade?.sections || []).find((sec) => normalize(sec.name || '') === normalize(rawSection));
      newSection = match?.name;
    } else {
      // Grade field doesn't match any Grade.name - check whether it's
      // actually a full class label (grade+section mixed into the grade
      // field), by matching it against the Section master instead.
      const bySection = sectionIndex.get(normalize(rawGrade));
      if (bySection) {
        newGrade = bySection.gradeName;
        newSection = bySection.sectionName;
      }
    }

    if (!newSection) {
      // Still try resolving the section on its own even if the grade
      // didn't change, in case only the section string has drifted.
      const direct = sectionIndex.get(normalize(rawSection));
      if (direct && (!newGrade || direct.gradeName === newGrade)) {
        newGrade = newGrade || direct.gradeName;
        newSection = direct.sectionName;
      }
    }

    const gradeChanged = !!newGrade && newGrade !== rawGrade;
    const sectionChanged = !!newSection && newSection !== rawSection;

    if (gradeChanged || sectionChanged) {
      fixes.push({
        studentId: s.id, studentName: s.name,
        oldGrade: rawGrade, oldSection: rawSection,
        newGrade: gradeChanged ? newGrade : undefined,
        newSection: sectionChanged ? newSection : undefined,
      });
    } else if (!newGrade) {
      unresolved.push({ studentId: s.id, studentName: s.name, currentGrade: rawGrade, currentSection: rawSection });
    }
  }

  return { totalStudents: students.length, fixes, unresolved };
}
