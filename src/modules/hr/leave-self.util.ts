// Pure scoping logic for the Teacher/staff self-service "My Leave" feature
// (leave:self permission). Kept separate and pure so the server-side
// ownership check that prevents one staff member from reading/writing
// another's leave data can be unit-tested without a database.

/** Minimal shape of a leave application / leave balance record needed to check ownership. */
export interface OwnableLeaveRecord {
  staffId: any;
}

/**
 * True only when `record` belongs to the given staff record. Used to make sure
 * a self-service request (scoped server-side to req.user's own Staff._id)
 * never returns or mutates another staff member's leave data, even if a
 * client-supplied id sneaks into a query.
 */
export function belongsToStaff(record: OwnableLeaveRecord | null | undefined, staffId: any): boolean {
  if (!record || staffId === null || staffId === undefined) return false;
  return String(record.staffId) === String(staffId);
}

/**
 * Builds a Mongo filter for "my own leave records only" — always forces
 * staffId (and tenantId, when given) from the trusted, server-resolved
 * values, ignoring/overwriting anything a caller might have supplied in
 * `extra` under those same keys.
 */
export function buildOwnLeaveFilter(staffId: any, tenantId?: any, extra: Record<string, any> = {}): Record<string, any> {
  const { staffId: _ignoredStaffId, tenantId: _ignoredTenantId, ...rest } = extra;
  return {
    ...rest,
    ...(tenantId !== undefined ? { tenantId } : {}),
    staffId,
  };
}

/**
 * Strips any client-supplied identity/ownership fields from a leave
 * application submission before it's persisted, so a self-service POST
 * can never spoof staffId, staffName, tenantId, institutionId, status, or
 * approval fields — those are always set server-side from req.user and
 * the resolved Staff record.
 */
export function sanitizeSelfLeaveInput(body: Record<string, any>): Record<string, any> {
  const {
    staffId, staffName, staffEmployeeId, department, tenantId, institutionId,
    status, approvedBy, approverName, approvedAt, approverNote, rejectionReason,
    leaveNo, workflowInstanceId,
    ...safe
  } = body || {};
  return safe;
}
