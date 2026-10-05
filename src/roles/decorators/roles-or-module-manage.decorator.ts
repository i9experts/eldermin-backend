import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../auth/roles.enum';

export const ROLES_OR_MODULE_KEY = 'rolesOrModuleManage';

export interface RolesOrModuleManageRequirement {
  moduleKey: string;
  roles: UserRole[];
  level: 'view' | 'manage';
  allowModuleWide: boolean;
}

export interface RolesOrModuleManageOptions {
  /** Required custom-role level. Default 'manage'. */
  level?: 'view' | 'manage';
  /**
   * false (default, admin-set routes): a custom role passes only via a
   * sub-module-specific grant, so the stock module-wide Teacher grant does
   * not open admin actions. true (staff-write routes): module-wide or
   * sub-module grants both count.
   */
  allowModuleWide?: boolean;
}

/**
 * Pass if the JWT base role is in `roles`, OR the user's assigned custom role
 * (looked up live in the DB) grants access to `moduleKey`. Enforced by
 * RolesOrModuleManageGuard. Use INSTEAD of @Roles on the same handler (the
 * global RolesGuard would otherwise also require the base role).
 */
export const RolesOrModuleManage = (
  moduleKey: string,
  roles: UserRole[],
  opts: RolesOrModuleManageOptions = {},
) =>
  SetMetadata(ROLES_OR_MODULE_KEY, {
    moduleKey,
    roles,
    level: opts.level ?? 'manage',
    allowModuleWide: opts.allowModuleWide ?? false,
  } as RolesOrModuleManageRequirement);
