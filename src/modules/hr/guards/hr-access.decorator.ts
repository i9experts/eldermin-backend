import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../auth/roles.enum';
import { RolesOrModuleManage } from '../../../roles/decorators/roles-or-module-manage.decorator';
import { HR_ADMIN_ROLES } from '../../../auth/admin-role-sets';

export const HR_READ_KEY = 'hrReadPolicy';

export interface HrReadPolicy {
  roles: UserRole[];
  /** true: any staff-type role may call it (staff dropdown / timetable); output is projected for non-HR roles. */
  directory: boolean;
}

/** HR/payroll WRITE: enforced (403) immediately by the global RolesOrModuleManageGuard. */
export const HrWrite = (roles: UserRole[] = HR_ADMIN_ROLES) =>
  RolesOrModuleManage('hr', roles, { level: 'manage', allowModuleWide: true });

/** HR READ for HR roles (+ custom role with hr view). Non-HR staff roles: log-only or enforce per HR_READ_GUARD_MODE. */
export const HrRead = (roles: UserRole[] = HR_ADMIN_ROLES) =>
  SetMetadata(HR_READ_KEY, { roles, directory: false } as HrReadPolicy);

/** Read used as a dropdown by non-HR pages: every staff-type role allowed, non-HR roles get a projection. */
export const HrStaffDirectory = () =>
  SetMetadata(HR_READ_KEY, { roles: HR_ADMIN_ROLES, directory: true } as HrReadPolicy);
