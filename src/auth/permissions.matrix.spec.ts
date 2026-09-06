import { UserRole } from './roles.enum';
import { hasPermission } from './permissions.matrix';

// Locks in the safeguarding access boundary: full case visibility/management
// (safeguarding:read/write) is restricted to designated-safeguarding-lead
// roles, while filing a new concern (safeguarding:report) stays broadly
// available to any staff role, matching the statutory "all staff can raise
// a concern" requirement.
describe('safeguarding permissions', () => {
  const designatedLeadRoles = [UserRole.INSTITUTION_OWNER, UserRole.PRINCIPAL, UserRole.VICE_PRINCIPAL];
  const reportOnlyStaffRoles = [
    UserRole.ADMIN, UserRole.ACADEMIC_COORDINATOR, UserRole.FINANCE_MANAGER,
    UserRole.HR_MANAGER, UserRole.TEACHER, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF,
  ];
  const noAccessRoles = [UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT];

  it('grants designated leads full read/write/report access', () => {
    for (const role of designatedLeadRoles) {
      expect(hasPermission(role, 'safeguarding:read')).toBe(true);
      expect(hasPermission(role, 'safeguarding:write')).toBe(true);
      expect(hasPermission(role, 'safeguarding:report')).toBe(true);
    }
  });

  it('lets any staff role report a concern without granting case visibility', () => {
    for (const role of reportOnlyStaffRoles) {
      expect(hasPermission(role, 'safeguarding:report')).toBe(true);
      expect(hasPermission(role, 'safeguarding:read')).toBe(false);
      expect(hasPermission(role, 'safeguarding:write')).toBe(false);
    }
  });

  it('denies safeguarding access entirely to parent/student/reseller roles', () => {
    for (const role of noAccessRoles) {
      expect(hasPermission(role, 'safeguarding:read')).toBe(false);
      expect(hasPermission(role, 'safeguarding:write')).toBe(false);
      expect(hasPermission(role, 'safeguarding:report')).toBe(false);
    }
  });

  it('super admin bypasses via the super_admin:all wildcard', () => {
    expect(hasPermission(UserRole.SUPER_ADMIN, 'safeguarding:read')).toBe(true);
    expect(hasPermission(UserRole.SUPER_ADMIN, 'safeguarding:write')).toBe(true);
    expect(hasPermission(UserRole.SUPER_ADMIN, 'safeguarding:report')).toBe(true);
  });
});
