/**
 * Whether a published circular is addressed to a STAFF caller (the teacher role). Mirrors how
 * SchoolCalendarService.resolveAudience picks staff recipients, so "can see it" == "is a recipient":
 *  - individual scope: only the staff ids / user ids that are listed (roles are ignored for individual scope);
 *  - school / campus / grade scope: audience.roles must include 'staff'; campus scope also needs the
 *    circular's campus to be the caller's campus (unknown caller campus -> not a recipient). Grade scope
 *    has no effect on staff recipients (resolveAudience only filters students by grade).
 */
export interface CircularViewer { userId?: string; staffId?: string; campusId?: string | null }

export function isCircularForStaffViewer(circular: any, viewer: CircularViewer): boolean {
  if (!circular || circular.status !== 'published') return false;
  // Owner decision: fee-category circulars (fee reminders / amounts) are never shown to the teacher role.
  if (circular.category === 'fee') return false;
  const aud = circular.audience || {};
  const eq = (a: any, b: any) => a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);
  if (aud.scope === 'individual') {
    const staffIds: any[] = aud.individualStaffIds || [];
    const userIds: any[] = aud.userIds || [];
    return staffIds.some((s) => eq(s, viewer.staffId)) || userIds.some((u) => eq(u, viewer.userId));
  }
  if (!(aud.roles || []).includes('staff')) return false;
  if (aud.scope === 'campus' && aud.campusId) return eq(aud.campusId, viewer.campusId);
  return true;
}
