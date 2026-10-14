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
