import { classIncludes } from '../behaviour/behaviour-teacher-scope';
import { sameSubject, teacherSubjectAssignmentsOf, TeacherClassRef, TeacherSubjectClassRef } from './teacher-identity.util';

/** The classes a teacher is CLASS TEACHER of (all subjects) and the (class, subject) pairs they teach, from their TeacherProfile. */
export interface TeacherClassAccess { classTeacherClasses: TeacherClassRef[]; subjectClasses: TeacherSubjectClassRef[] }

export function teacherClassAccessOf(profile: any): TeacherClassAccess {
  // A teacher can be class teacher of more than one section (classTeacherAssignments); the legacy singular fields are the fallback.
  const classTeacherClasses: TeacherClassRef[] = profile?.classTeacherAssignments?.length
    ? profile.classTeacherAssignments.filter((a: any) => a?.gradeName).map((a: any) => ({ grade: a.gradeName, section: a.sectionName || undefined }))
    : (profile?.isClassTeacher && profile.classTeacherOfGradeName
      ? [{ grade: profile.classTeacherOfGradeName, section: profile.classTeacherOfSectionName || undefined }] : []);
  return { classTeacherClasses, subjectClasses: teacherSubjectAssignmentsOf(profile) };
}

/**
 * Same rule as the quiz-attempt scope (assessment.service canTeacherAccessAttempt, owner decision 2026-10-07): a CLASS teacher covers ALL
 * subjects of their own class; a SUBJECT teacher only a (class, subject) pair of their currentAssignments; both roles = the union.
 * Grade/section/subject tolerant (class-match.util); a section-less target matches by class only; no classes -> nothing.
 */
export function mayTeacherAccessClassSubject(t: TeacherClassAccess, target: { grade?: any; section?: any; subject?: any }): boolean {
  if (classIncludes(t.classTeacherClasses, target.grade, target.section)) return true;
  return t.subjectClasses.some((c) => classIncludes([c], target.grade, target.section) && sameSubject(c.subject, target.subject));
}
