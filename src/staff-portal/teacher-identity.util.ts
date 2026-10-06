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
 * Classes a TEACHER may act on: their class-teacher class plus every
 * TeacherProfile.currentAssignments entry (same rule as the staff portal:
 * grade must match, section is only compared when the assignment has one).
 */
export function teacherClassesOf(profile: any): TeacherClassRef[] {
  const out: TeacherClassRef[] = [];
  if (profile?.isClassTeacher && profile.classTeacherOfGradeName) {
    out.push({ grade: profile.classTeacherOfGradeName, section: profile.classTeacherOfSectionName || undefined });
  }
  for (const a of profile?.currentAssignments || []) {
    if (a?.gradeLevel) out.push({ grade: a.gradeLevel, section: a.sectionName || undefined });
  }
  return out;
}
