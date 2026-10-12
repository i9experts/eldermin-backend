import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../auth/roles.enum';
import { RolesOrModuleManage } from '../../../roles/decorators/roles-or-module-manage.decorator';
import { HR_ADMIN_ROLES } from '../../../auth/admin-role-sets';

export const HR_READ_KEY = 'hrReadPolicy';

export interface HrReadPolicy {
  roles: UserRole[];
  /** true: any staff-type role may call it (staff dropdown / timetable); output is projected for non-HR roles. */
  directory: boolean;
  /** true: sensitive read, 403 for everyone outside `roles` / custom hr view regardless of HR_READ_GUARD_MODE. */
  enforce?: boolean;
}

/** HR/payroll WRITE: enforced (403) immediately by the global RolesOrModuleManageGuard. */
export const HrWrite = (roles: UserRole[] = HR_ADMIN_ROLES) =>
  RolesOrModuleManage('hr', roles, { level: 'manage', allowModuleWide: true });

/** HR READ for HR roles (+ custom role with hr view). Non-HR staff roles: log-only or enforce per HR_READ_GUARD_MODE. */
export const HrRead = (roles: UserRole[] = HR_ADMIN_ROLES) =>
  SetMetadata(HR_READ_KEY, { roles, directory: false, enforce: false } as HrReadPolicy);

/**
 * Sensitive HR READ (payslips, payroll, salary config, advances/loans, ID
 * documents, contracts/letters, full staff document incl. bank details):
 * ENFORCED (403) for non-HR staff roles immediately, independent of
 * HR_READ_GUARD_MODE.
 */
export const HrReadSensitive = (roles: UserRole[] = HR_ADMIN_ROLES) =>
  SetMetadata(HR_READ_KEY, { roles, directory: false, enforce: true } as HrReadPolicy);

/** Read used as a dropdown by non-HR pages: every staff-type role allowed, non-HR roles get a projection. */
export const HrStaffDirectory = () =>
  SetMetadata(HR_READ_KEY, { roles: HR_ADMIN_ROLES, directory: true, enforce: false } as HrReadPolicy);

export const HR_STAFF_UPDATE_KEY = 'hrStaffUpdatePolicy';

/**
 * PATCH /hr/staff/:id only. HR roles (and custom role with hr manage) may
 * change any field. Institution managers (owner/admin/super_admin or a custom
 * role with FULL institution manage) may change ONLY supervisedClusterIds
 * (Institution > Campuses); a body with any other field is rejected (403) as a
 * whole, never partially applied.
 */
export const HrStaffUpdate = () => SetMetadata(HR_STAFF_UPDATE_KEY, true);
