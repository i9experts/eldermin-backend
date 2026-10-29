// Teacher class scoping for /behaviour (B0). Pure helpers; the DB lookup of the
// teacher's classes lives in BehaviourService (same source as the assessments
// module: Staff.userId -> TeacherProfile class-teacher + currentAssignments).

import { gradeMatcher, normalizeSectionName, sameGrade, sectionMatcher, sameSection } from '../common/utils/class-match.util';
import { Types } from 'mongoose';
import { resolveTeacherIdentity, teacherClassesOf, TeacherClassRef } from '../staff-portal/teacher-identity.util';

/**
 * True when (grade, section) is one of the teacher's classes. A class without a
 * section covers every section of that grade. A RECORD without a section (blank
 * or missing) matches by class only: the teacher is assigned to that grade in
 * some section, and the record cannot say which, so it is not hidden from them.
 */
export function classIncludes(classes: TeacherClassRef[], grade: unknown, section: unknown): boolean {
  const recordHasSection = normalizeSectionName(section) !== '';
  return classes.some(c => sameGrade(c.grade, grade) && (!c.section || !recordHasSection || sameSection(c.section, section)));
}

/** Mongo equivalent of "record has no section": missing, null, '' or whitespace only. */
const NO_SECTION = [null, '', /^\s*$/];

/** Mongo filter matching records whose grade/section fall in the teacher's classes; no classes -> matches nothing. */
export function classScopeFilter(classes: TeacherClassRef[]): any {
  if (!classes.length) return { _id: { $in: [] } };
  return {
    $or: classes.map(c => (c.section
      ? { grade: gradeMatcher(c.grade), $or: [{ section: sectionMatcher(c.section) }, { section: { $in: NO_SECTION } }] }
      : { grade: gradeMatcher(c.grade) })),
  };
}

/**
 * Was this record written by the caller? By user id when the record carries
 * one; legacy rows (web-created, name only) fall back to a trimmed,
 * case-insensitive display-name match.
 */
export function isOwnByAuthor(
  user: { userId?: string; name?: string },
  rec: { [k: string]: any } | null | undefined,
  idField: string,
  nameField: string,
): boolean {
  if (!rec) return false;
  const me = user?.userId ? String(user.userId) : '';
  if (rec[idField]) return !!me && String(rec[idField]) === me;
  const a = String(rec[nameField] ?? '').trim().toLowerCase();
  const b = String(user?.name ?? '').trim().toLowerCase();
  return a !== '' && a === b;
}

/**
 * Fields no behaviour PUT may ever change (a raw $set of these could move a record to another school or
 * re-attribute it). They are silently STRIPPED, never rejected with 400, so a web edit form that sends the
 * whole object back keeps working (the value just does not change).
 */
export const PROTECTED_UPDATE_FIELDS = ['_id', '__v', 'schoolSlug', 'campusId', 'createdAt', 'updatedAt'];

export function stripProtectedFields<T extends Record<string, any>>(data: T, extra: string[] = []): T {
  const out: any = { ...(data || {}) };
  for (const f of [...PROTECTED_UPDATE_FIELDS, ...extra]) delete out[f];
  return out;
}

/** The classes a TEACHER teaches (class-teacher sections + currentAssignments), from the DB, never the JWT. 403 when no Staff record. */
export async function loadTeacherClasses(
  staffModel: any, teacherProfileModel: any, user: { userId?: string; name?: string },
): Promise<TeacherClassRef[]> {
  const me = await resolveTeacherIdentity(staffModel, teacherProfileModel, user);
  const profile: any = await teacherProfileModel.findOne({ staffId: new Types.ObjectId(me.staffId) })
    .select('isClassTeacher classTeacherOfGradeName classTeacherOfSectionName classTeacherAssignments currentAssignments').lean();
  return teacherClassesOf(profile);
}
