import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * Server-side identity of a TEACHER caller. Always resolved from the DB via
 * Staff.userId (the JWT's staffId/teacherProfileId claims are never trusted;
 * a stale token must not act for a removed/changed staff member).
 */
export interface TeacherIdentity {
  userId: string;
  /** Staff._id: the id every teacherId field in the schemas references. */
  staffId: string;
  /** TeacherProfile._id (the web sends this for some tabs), or null. */
  teacherProfileId: string | null;
  name: string;
}

export const SPOOF_TEACHER_MESSAGE = 'You can only create assignments for yourself';

/** True when the caller is a plain teacher (same role lookup as RolesGuard). Other roles keep their existing behaviour. */
export function isTeacherCaller(user: { role?: string; primaryRole?: string } | undefined | null): boolean {
  return (user?.role || user?.primaryRole) === 'teacher';
}

/** 403 text (exact, shown to the teacher by the app) when a campus-scoped endpoint is called by a teacher with no campus. */
export const NO_CAMPUS_MESSAGE = 'No campus assigned \u2014 contact your administrator';

/** Teacher role + campus-scoped endpoint: a missing campus is a clear 403, never a silently empty / widened list. */
export function assertTeacherHasCampus(campusId: any): string {
  if (!campusId) throw new ForbiddenException(NO_CAMPUS_MESSAGE);
  return String(campusId);
}

/**
 * Resolves {staffId, teacherProfileId, name} for the authenticated user from
 * the DB. 403 when the account has no (active) Staff record.
 */
export async function resolveTeacherIdentity(
  staffModel: any,
  teacherProfileModel: any,
  user: { userId?: string; name?: string },
): Promise<TeacherIdentity> {
  let uid: Types.ObjectId | null = null;
  try { uid = user?.userId ? new Types.ObjectId(user.userId) : null; } catch { uid = null; }
  const staff: any = uid ? await staffModel.findOne({ userId: uid, isActive: { $ne: false } }).lean() : null;
  if (!staff) throw new ForbiddenException('No staff profile is linked to this account.');
  const profile: any = teacherProfileModel
    ? await teacherProfileModel.findOne({ staffId: staff._id }).select('_id').lean()
    : null;
  const staffName = `${staff.firstName || ''} ${staff.lastName || ''}`.trim();
  return {
    userId: String(user.userId),
    staffId: String(staff._id),
    teacherProfileId: profile?._id ? String(profile._id) : null,
    name: user.name || staffName || 'Teacher',
  };
}

/** True when `id` is my Staff._id or my TeacherProfile._id. */
export function isOwnTeacherRef(me: TeacherIdentity, id: any): boolean {
  if (id === undefined || id === null || id === '') return false;
  const s = String(id);
  return s === me.staffId || (!!me.teacherProfileId && s === me.teacherProfileId);
}

/**
 * List filter matching BOTH of my ids (BB2). Teacher-keyed documents hold a Staff._id when a teacher created them (normaliseTeacherIdForWrite)
 * but a TeacherProfile._id when an admin/coordinator created them through the web (the web's TeacherDropdown lists TeacherProfile rows:
 * HomeworkTab.tsx:117-123, LessonPlansTab.tsx:528,654, ClassDiaryTab.tsx:70, SyllabusTab.tsx:67). A list filtered on the Staff id alone hid those
 * rows from the teacher they belong to. Both ids come from the DB (resolveTeacherIdentity), never from the request, and are matched in both
 * stored forms (ObjectId and string, B0_ID_TYPING.md) so the filter is also correct inside aggregations that bypass the id-match plugin.
 */
export function teacherIdsMatch(me: TeacherIdentity): { $in: Array<Types.ObjectId | string> } {
  const out: Array<Types.ObjectId | string> = [];
  for (const id of [me.staffId, me.teacherProfileId]) {
    if (id && Types.ObjectId.isValid(String(id))) out.push(new Types.ObjectId(String(id)), String(id));
  }
  return { $in: out };
}

/**
 * Create rule: absent -> my Staff._id; mine (either id) -> normalised to my
 * Staff._id; anything else -> 403.
 */
export function normaliseTeacherIdForWrite(me: TeacherIdentity, bodyTeacherId: any, message = SPOOF_TEACHER_MESSAGE): string {
  if (bodyTeacherId === undefined || bodyTeacherId === null || bodyTeacherId === '') return me.staffId;
  if (isOwnTeacherRef(me, bodyTeacherId)) return me.staffId;
  throw new ForbiddenException(message);
}

/** Ownership rule for an existing document keyed by teacherId (Staff or TeacherProfile id accepted for legacy rows). */
export function assertOwnsTeacherDoc(me: TeacherIdentity, docTeacherId: any, message = 'You can only modify your own records'): void {
  if (!isOwnTeacherRef(me, docTeacherId)) throw new ForbiddenException(message);
}

/**
 * Behaviour records (BehaviourRecord.reportedBy = display name, reportedById
 * = ref User). Mutates `body` for a TEACHER caller: name always overridden
 * from the token (a display field), id must be my userId or absent (403
 * otherwise) and is always stored server-side as my userId.
 */
export function applyTeacherAuthorship(body: any, user: { userId?: string; name?: string }, fallbackName: string): void {
  const me = user?.userId ? String(user.userId) : '';
  if (!me) throw new ForbiddenException('Cannot determine the reporting user.');
  const sent = body.reportedById;
  if (sent !== undefined && sent !== null && sent !== '' && String(sent) !== me) {
    throw new ForbiddenException('You can only log behaviour records as yourself');
  }
  body.reportedBy = user?.name || fallbackName;
  body.reportedById = me;
}

export interface TeacherClassRef { grade: string; section?: string }

/**
 * Classes a TEACHER may act on: every class-teacher section (a teacher
 * can legitimately be class teacher of more than one section - common in
 * Early Years, where one lead teacher often covers 2-3 small sections)
 * plus every TeacherProfile.currentAssignments entry (same rule as the
 * staff portal: grade must match, section is only compared when the
 * assignment has one).
 *
 * Prefers the classTeacherAssignments array (the real source of truth,
 * rebuilt from Section.classTeacherId on every assignment change) and
 * falls back to the legacy singular classTeacherOf* fields only for a
 * profile that predates that array and hasn't been touched since (it
 * self-heals the next time any class-teacher assignment changes in the
 * school - see OrganizationService.recomputeClassTeacherAssignments).
 */
export function teacherClassesOf(profile: any): TeacherClassRef[] {
  const out: TeacherClassRef[] = [];
  if (profile?.classTeacherAssignments?.length) {
    for (const a of profile.classTeacherAssignments) {
      if (a?.gradeName) out.push({ grade: a.gradeName, section: a.sectionName || undefined });
    }
  } else if (profile?.isClassTeacher && profile.classTeacherOfGradeName) {
    out.push({ grade: profile.classTeacherOfGradeName, section: profile.classTeacherOfSectionName || undefined });
  }
  for (const a of profile?.currentAssignments || []) {
    if (a?.gradeLevel) out.push({ grade: a.gradeLevel, section: a.sectionName || undefined });
  }
  return out;
}

export interface TeacherSubjectClassRef extends TeacherClassRef { subject: string }

/** TeacherProfile.currentAssignments entries that carry a subject (the SUBJECT-teacher scope): {grade, section?, subject}. */
export function teacherSubjectAssignmentsOf(profile: any): TeacherSubjectClassRef[] {
  const out: TeacherSubjectClassRef[] = [];
  for (const a of profile?.currentAssignments || []) {
    if (a?.gradeLevel && a?.subjectName) out.push({ grade: a.gradeLevel, section: a.sectionName || undefined, subject: a.subjectName });
  }
  return out;
}

/** Tolerant subject comparison: trim, case-insensitive, internal whitespace collapsed ("Islamic  Studies" = "islamic studies"). */
export function sameSubject(a: any, b: any): boolean {
  const n = (v: any) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const x = n(a);
  return x !== '' && x === n(b);
}
