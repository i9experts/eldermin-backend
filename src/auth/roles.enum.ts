export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  INSTITUTION_OWNER = 'institution_owner',
  PRINCIPAL = 'principal',
  VICE_PRINCIPAL = 'vice_principal',
  ADMIN = 'admin',
  ACADEMIC_COORDINATOR = 'academic_coordinator',
  FINANCE_MANAGER = 'finance_manager',
  HR_MANAGER = 'hr_manager',
  TEACHER = 'teacher',
  LIBRARIAN = 'librarian',
  PARENT = 'parent',
  STUDENT = 'student',
  SUPPORT_STAFF = 'support_staff',
  // Eldermin Partner Network — Reseller Portal v1. Platform-level roles
  // (no tenantId/institutionId, same as SUPER_ADMIN) scoped instead to a
  // single resellerId, mirroring how campus-level roles are scoped to a
  // single campusId. See auth/scope.util.ts resolveResellerScope.
  RESELLER_ADMIN = 'reseller_admin',
  RESELLER_SUPPORT = 'reseller_support',
}
