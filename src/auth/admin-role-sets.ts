import { UserRole } from './roles.enum';

/**
 * Role sets for the S2a security hardening (HR / payroll / roles / guardian
 * links). Kept in their own file so src/auth/role-sets.ts stays byte-identical
 * to feat/staff-portal and the later merge of that branch is conflict-free.
 *
 * Derived from who actually reaches each screen on the web today
 * (see eldermin-teacher-app-docs/security/S0_AUDIT.md B.2), plus hr_manager /
 * finance_manager per owner decision 4.
 */

/** /roles (create/update/duplicate/delete/assign + reads). Web gate: institution:manage. */
export const ROLES_ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN,
];

/**
 * Base roles whose own permission ceiling is "everything" when granting
 * custom roles (the web gives admin the same permission list as the owner).
 * Anyone else is capped by their own custom-role moduleAccess.
 */
export const UNRESTRICTED_GRANTOR_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN,
];

/** Rank used so nobody can manage the role of a more senior account. */
export const ROLE_RANK: Record<string, number> = {
  [UserRole.SUPER_ADMIN]: 4,
  [UserRole.INSTITUTION_OWNER]: 3,
  [UserRole.ADMIN]: 2,
};

/**
 * Staff who may link/unlink a guardian login to students: base roles holding
 * students:write in PERMISSIONS_MATRIX (src/auth/permissions.matrix.ts), plus
 * super_admin (super_admin:all). Custom roles pass with module `students`
 * manage. A spec asserts this list matches the matrix.
 */
export const STUDENTS_WRITE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.VICE_PRINCIPAL, UserRole.ADMIN,
];

/**
 * HR page + HR/payroll writes. Web today: super_admin, institution_owner,
 * admin, principal (hr:view; the page shows principal every write button, so
 * writes keep EXACT web parity - owner decision 3, flagged as a product
 * decision) + hr_manager (owner decision 4).
 */
export const HR_ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN,
  UserRole.PRINCIPAL, UserRole.HR_MANAGER,
];

/** Payroll/salary reads: HR admins + finance_manager (owner decision 4). */
export const PAYROLL_READ_ROLES: UserRole[] = [...HR_ADMIN_ROLES, UserRole.FINANCE_MANAGER];

/** Money-moving payroll writes (status/paid, process-batch, pay payslip). */
export const PAYROLL_PAY_ROLES: UserRole[] = [...HR_ADMIN_ROLES, UserRole.FINANCE_MANAGER];

/** Principals that must never reach /hr at all (not staff). */
export const NON_STAFF_ROLES: UserRole[] = [
  UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT,
];
