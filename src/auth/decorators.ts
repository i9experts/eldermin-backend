import { SetMetadata } from '@nestjs/common';
import { UserRole } from './roles.enum';
import { Permission } from './permissions.matrix';

export const ROLES_KEY = 'roles';
export const PERMISSION_KEY = 'permission';
export const IS_PUBLIC_KEY = 'isPublic';

/** Apply to a handler or controller to restrict access to specific roles */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Apply to a handler or controller to restrict access by permission */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

/** Mark a handler or controller as publicly accessible (no JWT required) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
