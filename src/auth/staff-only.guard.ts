import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from './roles.enum';
import { NEVER_CUSTOM_ROLE } from '../roles/guards/roles-or-module-manage.guard';

/** Not a UserRole: ParentLeadAuthGuard tokens, which JwtStrategy already rejects. Listed as defence in depth. */
const PARENT_LEAD_ROLE = 'parent_lead';

const STAFF_ROLES = new Set<string>(
  Object.values(UserRole).filter((r) => !NEVER_CUSTOM_ROLE.has(r)),
);

/**
 * Staff-only gate for routes that carry no @Roles of their own. Parent-portal
 * tokens are signed with the same secret and accepted by the same JwtStrategy
 * as staff tokens, and RolesGuard lets any authenticated user through a route
 * without metadata, so a parent could otherwise reach it.
 *
 * Denies (403): parent, student and reseller roles (NEVER_CUSTOM_ROLE), parent_lead,
 * any token without a recognised staff role, and any token carrying
 * guardianOfStudentIds without one. Adds a requirement on top of the global
 * guards; it never grants access.
 */
@Injectable()
export class StaffOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest()?.user;
    const role = String(user?.role || user?.primaryRole || '');
    if (!user || role === PARENT_LEAD_ROLE || NEVER_CUSTOM_ROLE.has(role) || !STAFF_ROLES.has(role)) {
      throw new ForbiddenException('Access denied. This area is for school staff only.');
    }
    return true;
  }
}
