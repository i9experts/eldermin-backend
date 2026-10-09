import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ACCESS_KEY = 'platformAccessRequirement';

export interface PlatformAccessRequirement {
  tabKey: string;
  subTabKey?: string;
  level: 'view' | 'manage';
}

/**
 * Platform-level mirror of RequireModuleAccess (src/roles/decorators) -
 * apply to a SuperAdminController handler to gate it by the Team & Access
 * system's moduleAccess, on top of the existing blanket @Roles(SUPER_ADMIN)
 * on the controller. Enforced by PlatformRoleGuard, which only ever ADDS a
 * restriction for a user who has a customPlatformRoleId assigned - a
 * super_admin with no platform role (today's single account, and anyone
 * created without one) is completely unaffected and keeps full access.
 *
 * @param tabKey     one of ASSIGNABLE_PLATFORM_TABS's keys (platform-role.schema.ts)
 * @param subTabKey  one of SUB_TABS[tabKey]'s keys, or omit to gate the whole tab
 * @param level      'view' for read routes, 'manage' for anything that creates/updates/deletes
 */
export const RequirePlatformAccess = (
  tabKey: string,
  subTabKey: string | undefined,
  level: 'view' | 'manage',
) => SetMetadata(PLATFORM_ACCESS_KEY, { tabKey, subTabKey, level } as PlatformAccessRequirement);
