import { UserRole } from './roles.enum';

export type Permission =
  // Organization
  | 'org:read' | 'org:write' | 'org:delete'
  // HR
  | 'hr:read' | 'hr:write' | 'hr:delete'
  // Finance
  | 'finance:read' | 'finance:write' | 'finance:delete'
  // Students
  | 'students:read' | 'students:write' | 'students:delete'
  // Academics
  | 'academics:read' | 'academics:write' | 'academics:delete'
  // Teaching
  | 'teaching:read' | 'teaching:write' | 'teaching:delete'
  // Admissions
  | 'admissions:read' | 'admissions:write' | 'admissions:delete'
  // Assessment
  | 'assessment:read' | 'assessment:write' | 'assessment:delete'
  // Documents
  | 'documents:read' | 'documents:write' | 'documents:delete'
  // Procurement
  | 'procurement:read' | 'procurement:write' | 'procurement:delete'
  // Compliance
  | 'compliance:read' | 'compliance:write' | 'compliance:delete'
  // Behaviour
  | 'behaviour:read' | 'behaviour:write' | 'behaviour:delete'
  // Campus
  | 'campus:read' | 'campus:write' | 'campus:delete'
  // Eldermin Partner Network — Reseller Portal v1
  | 'reseller:read' | 'reseller:write'
  // Super admin
  | 'super_admin:all';

export const PERMISSIONS_MATRIX: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: ['super_admin:all', 'org:read', 'org:write', 'org:delete'],

  [UserRole.INSTITUTION_OWNER]: [
    'org:read', 'org:write', 'org:delete',
    'hr:read', 'hr:write', 'hr:delete',
    'finance:read', 'finance:write', 'finance:delete',
    'students:read', 'students:write', 'students:delete',
    'academics:read', 'academics:write', 'academics:delete',
    'teaching:read', 'teaching:write', 'teaching:delete',
    'admissions:read', 'admissions:write', 'admissions:delete',
    'assessment:read', 'assessment:write', 'assessment:delete',
    'documents:read', 'documents:write', 'documents:delete',
    'procurement:read', 'procurement:write', 'procurement:delete',
    'compliance:read', 'compliance:write', 'compliance:delete',
    'behaviour:read', 'behaviour:write', 'behaviour:delete',
    'campus:read', 'campus:write', 'campus:delete',
  ],

  [UserRole.PRINCIPAL]: [
    'org:read', 'org:write',
    'hr:read', 'hr:write',
    'finance:read',
    'students:read', 'students:write',
    'academics:read', 'academics:write',
    'teaching:read', 'teaching:write',
    'admissions:read', 'admissions:write',
    'assessment:read', 'assessment:write',
    'documents:read', 'documents:write',
    'compliance:read', 'compliance:write',
    'behaviour:read', 'behaviour:write',
    'campus:read', 'campus:write',
  ],

  [UserRole.VICE_PRINCIPAL]: [
    'org:read',
    'students:read', 'students:write',
    'academics:read', 'academics:write',
    'teaching:read', 'teaching:write',
    'assessment:read', 'assessment:write',
    'behaviour:read', 'behaviour:write',
    'documents:read',
    'campus:read',
  ],

  [UserRole.ADMIN]: [
    'org:read', 'org:write',
    'hr:read', 'hr:write',
    'students:read', 'students:write',
    'academics:read', 'academics:write',
    'admissions:read', 'admissions:write',
    'documents:read', 'documents:write',
    'campus:read', 'campus:write',
  ],

  [UserRole.ACADEMIC_COORDINATOR]: [
    'academics:read', 'academics:write',
    'teaching:read', 'teaching:write',
    'assessment:read', 'assessment:write',
    'students:read',
    'documents:read',
  ],

  [UserRole.FINANCE_MANAGER]: [
    'finance:read', 'finance:write', 'finance:delete',
    'procurement:read', 'procurement:write',
    'documents:read',
  ],

  [UserRole.HR_MANAGER]: [
    'hr:read', 'hr:write', 'hr:delete',
    'documents:read', 'documents:write',
    'compliance:read',
  ],

  [UserRole.TEACHER]: [
    'teaching:read', 'teaching:write',
    'assessment:read', 'assessment:write',
    'students:read',
    'academics:read',
    'behaviour:read', 'behaviour:write',
  ],

  [UserRole.LIBRARIAN]: [
    'documents:read', 'documents:write',
    'students:read',
  ],

  [UserRole.PARENT]: [
    'students:read',
    'assessment:read',
    'academics:read',
  ],

  [UserRole.STUDENT]: [
    'academics:read',
    'assessment:read',
    'teaching:read',
  ],

  [UserRole.SUPPORT_STAFF]: [
    'org:read',
    'campus:read',
  ],

  // Eldermin Partner Network — Reseller Portal v1. Platform-level roles
  // scoped to a single resellerId (see scope.util.ts resolveResellerScope),
  // not a tenant/institution — they never touch org/hr/finance/etc.
  [UserRole.RESELLER_ADMIN]: ['reseller:read', 'reseller:write'],
  [UserRole.RESELLER_SUPPORT]: ['reseller:read'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const perms = PERMISSIONS_MATRIX[role] || [];
  return perms.includes('super_admin:all') || perms.includes(permission);
}
