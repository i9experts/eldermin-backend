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
