import { SetMetadata } from '@nestjs/common';

export const MODULE_ACCESS_KEY = 'moduleAccessRequirement';

export interface ModuleAccessRequirement {
  moduleKey: string;
  subModuleKey?: string;
  level: 'view' | 'manage';
}

/**
 * Apply to a handler (or controller) to gate it by the custom Role system's
 * moduleAccess, on top of whatever @Roles()/@RequirePermission() already
 * guards it with. Enforced by CustomRoleGuard, which only ever ADDS a
 * restriction for users who have a Role.customRoleId assigned - users still
 * on the standard UserRole enum are completely unaffected by this decorator.
 *
 * @param moduleKey    one of ASSIGNABLE_MODULES's keys (role.schema.ts)
 * @param subModuleKey one of SUB_MODULES[moduleKey]'s keys, or omit to gate
 *                      the whole module
 * @param level        'view' for read routes, 'manage' for anything that
 *                      creates/updates/deletes
 */
export const RequireModuleAccess = (
  moduleKey: string,
  subModuleKey: string | undefined,
  level: 'view' | 'manage',
) => SetMetadata(MODULE_ACCESS_KEY, { moduleKey, subModuleKey, level } as ModuleAccessRequirement);
