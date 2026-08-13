import { ForbiddenException } from '@nestjs/common';
import { UserRole } from './roles.enum';

// ============================================================
// CAMPUS / DEPARTMENT ACCESS MODEL
// ============================================================
// Agreed with Atiq (Aug 2026):
//  - super_admin        -> platform-wide, not tenant-scoped at all
//  - institution_owner  -> whole tenant: every campus, every department
//  - teacher             -> own campus AND own department only (strictest)
//  - everyone else       -> own campus only, all departments on that campus
//
// Single-campus only for now - no multi-campus override flag (e.g. a
// "Group Principal" over 2 campuses) yet. isBoardLevel/supervisedClusterIds
// remain a separate, existing mechanism for Cluster/region oversight and
// are NOT reused here for campus scoping.
//
// Enforcement is a HARD BLOCK: if a request explicitly asks for a
// campus/department outside the caller's own scope, it gets a 403 -
// it does not silently get filtered down. If the request doesn't specify
// a campus/department at all, the caller's own scope is applied as the
// effective filter (so "no filter" never means "everything").
// ============================================================

export enum ScopeLevel {
  PLATFORM = 'platform',
  INSTITUTION = 'institution',
  CAMPUS = 'campus',
  DEPARTMENT = 'department',
}

export function getScopeLevel(role?: string): ScopeLevel {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return ScopeLevel.PLATFORM;
    case UserRole.INSTITUTION_OWNER:
      return ScopeLevel.INSTITUTION;
    case UserRole.TEACHER:
      return ScopeLevel.DEPARTMENT;
    default:
      // principal, vice_principal, admin, academic_coordinator,
      // finance_manager, hr_manager, librarian, support_staff, and any
      // role not explicitly listed above default to campus-level - the
      // safer default for a role we don't have an explicit rule for yet.
      return ScopeLevel.CAMPUS;
  }
}

export interface ScopedUser {
  role?: string;
  primaryRole?: string;
  campusId?: string;
  department?: string;
  guardianOfStudentIds?: string[];
  linkedStudentId?: string;
}

/**
 * Resolves the campusId a query should actually filter by, given who's
 * asking. Throws 403 if the caller explicitly requested a campus outside
 * their own scope. Returns undefined for platform/institution-level
 * callers with no requested campusId (meaning: no filter, see everything).
 */
export function resolveCampusScope(user: ScopedUser, requestedCampusId?: string): string | undefined {
  const role = user.role || user.primaryRole;
  const scope = getScopeLevel(role);

  if (scope === ScopeLevel.PLATFORM || scope === ScopeLevel.INSTITUTION) {
    // No forced scoping - an explicitly requested campusId is honored
    // as a normal optional filter, not a restriction.
    return requestedCampusId || undefined;
  }

  // Campus- or department-level caller: they have no legitimate view of
  // any campus other than their own.
  if (!user.campusId) {
    // No campus assigned on their Staff record at all - fail closed
    // (see nothing) rather than fail open (see everything), since we
    // can't scope what we don't know.
    throw new ForbiddenException('Your account has no campus assigned. Contact your administrator.');
  }

  if (requestedCampusId && String(requestedCampusId) !== String(user.campusId)) {
    throw new ForbiddenException('Access denied. You are scoped to your own campus only.');
  }

  return user.campusId;
}

/**
 * For record types where an unassigned/null campus genuinely means
 * "applies to everyone" (e.g. a school-wide policy document, a circular
 * for all campuses) rather than "ownership unclear, hide it" (the
 * Expense/Budget/PurchaseRequest convention). Campus-/department-scoped
 * callers see their own campus's records PLUS anything with no campus
 * set at all. Institution/platform-level callers are unrestricted.
 * Still hard-blocks (403) an explicitly requested campus outside scope.
 */
export function buildInclusiveCampusFilter(user: ScopedUser, requestedCampusId?: string): Record<string, any> | null {
  const role = user.role || user.primaryRole;
  const scope = getScopeLevel(role);

  if (scope === ScopeLevel.PLATFORM || scope === ScopeLevel.INSTITUTION) {
    return requestedCampusId ? { campusId: requestedCampusId } : null;
  }

  if (!user.campusId) {
    throw new ForbiddenException('Your account has no campus assigned. Contact your administrator.');
  }

  if (requestedCampusId && String(requestedCampusId) !== String(user.campusId)) {
    throw new ForbiddenException('Access denied. You are scoped to your own campus only.');
  }

  return { $or: [{ campusId: user.campusId }, { campusId: null }, { campusId: { $exists: false } }] };
}

/**
 * Same idea as resolveCampusScope, but for department - only meaningful
 * for department-scoped roles (Teacher today). Non-department-scoped
 * callers get an explicitly requested department honored as a normal
 * optional filter (no restriction), since they're allowed to see every
 * department on their campus.
 */
export function resolveDepartmentScope(user: ScopedUser, requestedDepartment?: string): string | undefined {
  const role = user.role || user.primaryRole;
  const scope = getScopeLevel(role);

  if (scope !== ScopeLevel.DEPARTMENT) {
    return requestedDepartment || undefined;
  }

  if (!user.department) {
    throw new ForbiddenException('Your account has no department assigned. Contact your administrator.');
  }

  if (requestedDepartment && String(requestedDepartment) !== String(user.department)) {
    throw new ForbiddenException('Access denied. You are scoped to your own department only.');
  }

  return user.department;
}

/**
 * Hard-blocks a 'parent' or 'student' role account from ever touching a
 * student record they're not actually linked to. Unlike campus/
 * department scoping (which narrows a view), this is closer to an
 * ownership check - a parent has no legitimate reason to see ANY
 * student outside their own guardianOfStudentIds, ever, regardless of
 * campus/department. Non-parent/student roles are unrestricted here
 * (their access is governed by the normal role/campus/department
 * rules elsewhere, not this check).
 */
export function assertStudentAccess(user: ScopedUser, studentId: string): void {
  const role = user.role || user.primaryRole;
  if (role === UserRole.PARENT) {
    const allowed = (user.guardianOfStudentIds || []).map(String);
    if (!allowed.includes(String(studentId))) {
      throw new ForbiddenException('Access denied. You are not a registered guardian for this student.');
    }
    return;
  }
  if (role === UserRole.STUDENT) {
    if (String(user.linkedStudentId) !== String(studentId)) {
      throw new ForbiddenException('Access denied. This is not your own student record.');
    }
    return;
  }
  // Every other role's access is governed elsewhere (campus/department
  // scoping, or unrestricted for institution_owner/super_admin) - this
  // check only exists to protect parent/student accounts specifically.
}

/** The list of student ids a parent account is allowed to see anything about at all - used to build "my children" pickers and to scope list endpoints. */
export function getGuardianStudentIds(user: ScopedUser): string[] {
  return (user.guardianOfStudentIds || []).map(String);
}
