import { Types } from 'mongoose';

export interface GuardianNotice {
  schoolSlug: string;
  type: 'circular' | 'consent' | 'leave_decision' | 'fee_due' | 'homework' | 'result' | 'behaviour' | 'message' | 'ptm' | 'diary' | 'other';
  title: string;
  body: string;
  relatedEntityId?: string;
}

/**
 * Writes one in-app notification per guardian login linked to any of the
 * given students (the same `notifications` rows the parent app lists).
 * Takes a mongoose connection (any model's `.db`) so staff-side services
 * can call it without importing the parent-portal module. Best-effort by
 * design: a notification problem must never fail the staff action that
 * triggered it, so it never throws. Returns how many were written.
 */
export async function notifyGuardiansOfStudents(
  db: any, studentIds: Array<string | Types.ObjectId>, notice: GuardianNotice,
): Promise<number> {
  try {
    const ids = studentIds.filter((id) => Types.ObjectId.isValid(String(id))).map((id) => new Types.ObjectId(String(id)));
    if (!ids.length || !notice.schoolSlug) return 0;
    const parents = await db.collection('users')
      .find({ primaryRole: 'parent', isActive: { $ne: false }, guardianOfStudentIds: { $in: ids } })
      .project({ _id: 1 }).toArray();
    if (!parents.length) return 0;
    const now = new Date();
    await db.collection('notifications').insertMany(parents.map((p: any) => ({
      recipientUserId: p._id, schoolSlug: notice.schoolSlug, type: notice.type,
      title: notice.title, body: notice.body, relatedEntityId: notice.relatedEntityId,
      isRead: false, createdAt: now, updatedAt: now,
    })));
    return parents.length;
  } catch {
    return 0;
  }
}

/** Resolves a tenant's school slug from the raw `tenants` collection; null on any failure. */
export async function schoolSlugForTenant(db: any, tenantId: any): Promise<string | null> {
  try {
    if (!Types.ObjectId.isValid(String(tenantId))) return null;
    const t = await db.collection('tenants').findOne({ _id: new Types.ObjectId(String(tenantId)) }, { projection: { slug: 1 } });
    return t?.slug || null;
  } catch {
    return null;
  }
}
