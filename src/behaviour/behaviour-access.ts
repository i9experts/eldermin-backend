// ============================================================
// BEHAVIOUR ACCESS POLICY (B0 security fix)
// Pure, framework-light definitions shared by BehaviourAccessGuard,
// BehaviourService and the specs. Mirrors the HR_READ_GUARD_MODE pattern
// (modules/hr/guards): a log|enforce flag, default log, structured events.
//
// Role sets are derived from who reaches the Behaviour screens on the web
// today (Eldermin-Frontend src/types/roles.ts: behaviour:view/manage for
// super_admin, institution_owner, admin, principal, teacher), the backend
// PERMISSIONS_MATRIX (behaviour:read/write also on vice_principal) and the
// existing STAFF_WRITE_ROLES write guard (adds academic_coordinator).
// ============================================================

import { ForbiddenException, Logger, SetMetadata } from '@nestjs/common';
import { UserRole } from '../auth/roles.enum';
import { NON_STAFF_ROLES } from '../auth/admin-role-sets';
import { STAFF_WRITE_ROLES } from '../auth/role-sets';
import { resolveAccessLevel, satisfiesRequiredLevel, ModuleAccessEntry } from '../roles/module-access.util';

export type BehaviourGuardMode = 'log' | 'enforce';

/** BEHAVIOUR_GUARD_MODE=enforce flips would-deny decisions to 403; anything else (default) = log-only. Read per request. */
export function behaviourGuardMode(): BehaviourGuardMode {
  return String(process.env.BEHAVIOUR_GUARD_MODE || '').trim().toLowerCase() === 'enforce' ? 'enforce' : 'log';
}

/** Whole-school behaviour managers (settings, confidential files, every record). */
export const BEHAVIOUR_ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN,
  UserRole.PRINCIPAL, UserRole.VICE_PRINCIPAL,
];

/** Character-programme settings: the four roles the web gives the Settings gear to. */
export const BEHAVIOUR_SETTINGS_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.PRINCIPAL,
];

/** Staff who read/write records and Tarbiyah (teacher is class-scoped in the service). */
export const BEHAVIOUR_STAFF_ROLES: UserRole[] = STAFF_WRITE_ROLES;

/** School-wide aggregates (dashboard, reports, analytics): no teachers (their web tabs are per-class work). */
export const BEHAVIOUR_AGGREGATE_ROLES: UserRole[] = [...BEHAVIOUR_ADMIN_ROLES, UserRole.ACADEMIC_COORDINATOR];

export type BehaviourPolicyKind =
  | 'staff_read'          // records / tarbiyah / profile reads; teacher narrowed to their classes
  | 'meta_read'           // trait list + character settings: any behaviour staff role
  | 'aggregate_read'      // dashboard, reports, analytics, tarbiyah report
  | 'record_write'        // records + tarbiyah writes (teacher class-scoped, own-record edits)
  | 'confidential_read'   // counselling / interventions / contracts
  | 'confidential_write'
  | 'settings_write';     // character-programme settings

export interface BehaviourPolicy {
  kind: BehaviourPolicyKind;
  /** Web tab key (dashboard | records | tarbiyah | counselling | interventions | reports) for custom-role sub-module grants. */
  subModule: string;
  roles: UserRole[];
  level: 'view' | 'manage';
  /** true: a custom role passes only through a sub-module-SPECIFIC grant (a module-wide behaviour grant, e.g. the stock Teacher role, does not). */
  strictSubModule: boolean;
  /** false: base roles only. */
  customRoles: boolean;
}

const POLICY_DEFS: Record<BehaviourPolicyKind, Omit<BehaviourPolicy, 'kind' | 'subModule'>> = {
  staff_read: { roles: BEHAVIOUR_STAFF_ROLES, level: 'view', strictSubModule: false, customRoles: true },
  meta_read: { roles: BEHAVIOUR_STAFF_ROLES, level: 'view', strictSubModule: false, customRoles: true },
  aggregate_read: { roles: BEHAVIOUR_AGGREGATE_ROLES, level: 'view', strictSubModule: false, customRoles: true },
  record_write: { roles: BEHAVIOUR_STAFF_ROLES, level: 'manage', strictSubModule: false, customRoles: true },
  confidential_read: { roles: BEHAVIOUR_ADMIN_ROLES, level: 'view', strictSubModule: true, customRoles: true },
  confidential_write: { roles: BEHAVIOUR_ADMIN_ROLES, level: 'manage', strictSubModule: true, customRoles: true },
  settings_write: { roles: BEHAVIOUR_SETTINGS_ROLES, level: 'manage', strictSubModule: true, customRoles: false },
};

export const BEHAVIOUR_POLICY_KEY = 'behaviourAccessPolicy';

/** One access policy per /behaviour handler (a spec asserts none is missing). */
export const BehaviourAccess = (kind: BehaviourPolicyKind, subModule: string) =>
  SetMetadata(BEHAVIOUR_POLICY_KEY, { kind, subModule, ...POLICY_DEFS[kind] } as BehaviourPolicy);

/** What the guard attaches to the request for the controller/service (teacher scoping, author-or-admin). */
export interface BehaviourAccessContext {
  mode: BehaviourGuardMode;
  /** mode === 'enforce' */
  enforce: boolean;
  role: string;
  isTeacher: boolean;
  /** Base admin role, or a custom role holding a sub-module-specific manage grant: may act on any record. */
  elevated: boolean;
  route: string;
  method: string;
}

export function isNonStaffRole(role: string): boolean {
  return !role || NON_STAFF_ROLES.includes(role as UserRole);
}

/** Parent / student / reseller tokens: 403 in BOTH modes. Reused by the legacy /students behaviour routes and the tarbiyah PDFs. */
export function assertStaffAccount(user: { role?: string; primaryRole?: string } | undefined | null): void {
  const role = String(user?.role || user?.primaryRole || '');
  if (isNonStaffRole(role)) {
    throw new ForbiddenException('Access denied. Behaviour data is not available to this account.');
  }
}

/** Does a custom role's moduleAccess satisfy the policy? (strict = sub-module-specific entry required) */
export function customRoleSatisfies(access: ModuleAccessEntry[] | null | undefined, policy: BehaviourPolicy): boolean {
  if (!policy.customRoles || !Array.isArray(access)) return false;
  if (policy.strictSubModule) {
    return access.some(m => m && m.moduleKey === 'behaviour' && m.subModuleKey === policy.subModule
      && satisfiesRequiredLevel(m.level, policy.level));
  }
  return satisfiesRequiredLevel(resolveAccessLevel(access, 'behaviour', policy.subModule), policy.level);
}

/**
 * A custom role that holds the behaviour MANAGE grant for this sub-module (a sub-module-specific entry, or a module-wide
 * behaviour entry which covers every sub-module, per resolveAccessLevel) is treated like an admin for that tab: it may act on
 * any record. Without that grant the holder stays author-only. (R1 decision 3; the stock Teacher custom role carries
 * behaviour:manage module-wide and therefore qualifies.)
 */
export function customRoleIsElevated(access: ModuleAccessEntry[] | null | undefined, subModule: string): boolean {
  return Array.isArray(access) && satisfiesRequiredLevel(resolveAccessLevel(access, 'behaviour', subModule), 'manage');
}

const guardLogger = new Logger('BehaviourGuard');

export interface BehaviourGuardEvent {
  mode: BehaviourGuardMode;
  decision: 'denied' | 'would_deny';
  reason: string;
  role: string;
  method: string;
  route: string;
  user: { userId?: string; tenantId?: any; schoolSlug?: string } | undefined;
}

/** Structured, PII-free: role, route pattern, ids only. One JSON line per would-deny / denied decision. */
export function logBehaviourGuard(e: BehaviourGuardEvent): void {
  guardLogger.warn(JSON.stringify({
    event: 'behaviour_guard',
    mode: e.mode,
    decision: e.decision,
    reason: e.reason,
    role: e.role,
    method: e.method,
    route: e.route || '(unknown)',
    userId: String(e.user?.userId || ''),
    schoolId: String(e.user?.tenantId || ''),
    schoolSlug: String(e.user?.schoolSlug || ''),
  }));
}

/**
 * One decision point used by the guard and the service: in enforce mode throw
 * 403, in log mode log "would deny" and let the request through.
 */
export function denyOrLog(
  access: BehaviourAccessContext | undefined,
  user: { userId?: string; tenantId?: any; schoolSlug?: string } | undefined,
  reason: string,
  message: string,
): void {
  const mode = access?.mode ?? behaviourGuardMode();
  logBehaviourGuard({
    mode, decision: mode === 'enforce' ? 'denied' : 'would_deny', reason,
    role: access?.role || '', method: access?.method || '', route: access?.route || '', user,
  });
  if (mode === 'enforce') throw new ForbiddenException(message);
}
