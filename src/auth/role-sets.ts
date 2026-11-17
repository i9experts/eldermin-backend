import { UserRole } from './roles.enum';

/** Teaching/academic administration writes (timetable, rooms, teachers, approvals...). Excludes TEACHER. */
export const TEACHING_ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.VICE_PRINCIPAL, UserRole.ADMIN, UserRole.ACADEMIC_COORDINATOR,
];

/** HR leave administration (approve/reject, create for any staff, balances, policies). */
export const HR_LEAVE_ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.ADMIN, UserRole.HR_MANAGER,
];

/** Module marketplace activation. PRINCIPAL kept for zero regression with current behaviour. */
export const MODULES_ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.PRINCIPAL,
];

/** Staff who legitimately write classroom data (attendance, marks, plans...). Blocks parent/student/non-teaching tokens. */
export const STAFF_WRITE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL,
  UserRole.VICE_PRINCIPAL, UserRole.ADMIN, UserRole.ACADEMIC_COORDINATOR,
  UserRole.TEACHER,
];

/**
 * Roles that are never allowed on routes meant for school staff only: the parent / student portals and the
 * reseller (partner) roles. Used as a deny-list so every other (staff) role keeps today's access.
 */
export const NON_STAFF_ROLES: UserRole[] = [
  UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT,
];

/** Every school-staff role (all roles except NON_STAFF_ROLES). Library writes/settings (D8) and upload / Early Years (D9). */
export const SCHOOL_STAFF_ROLES: UserRole[] = (Object.values(UserRole) as UserRole[]).filter((r) => !NON_STAFF_ROLES.includes(r));

/**
 * Institution approval requests (budget, hiring, procurement, hr, academic, policy): who may decide a stage. Same people the web's Institution >
 * Approvals tab is meant for: the admin set plus the HR and finance managers (hiring/hr and budget/procurement requests). Teachers, librarians,
 * support staff, parents, students, resellers: no. A custom role needs a grant on the institution -> approvals sub-module.
 */
export const APPROVAL_DECIDER_ROLES: UserRole[] = [...TEACHING_ADMIN_ROLES, UserRole.HR_MANAGER, UserRole.FINANCE_MANAGER];

/** May act on a workflow / approval that is not assigned to them, and may approve their own (nobody else may). */
export const APPROVAL_OVERRIDE_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER];

/**
 * Who sees the Complaints tab in the web, and therefore may use every complaint action: the enum roles holding `governance:view`
 * (Eldermin-Frontend src/types/roles.ts:92 super_admin, :126 institution_owner, :148 admin, :170 principal), through
 * `<ProtectedRoute permission="governance:view">` (src/App.tsx:132-134) and the tab gate `canAccess("governance:view", "complaints")`
 * (src/pages/governance/index.tsx:50-56). Custom roles pass through a governance grant (module-wide, or the `complaints` sub-module). Teachers and the
 * other staff roles (vice principal, coordinator, hr, finance, librarian, support) do not have the tab.
 */
export const COMPLAINTS_STAFF_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.PRINCIPAL,
];
