import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from './roles.enum';
import { NON_STAFF_ROLES } from './admin-role-sets';
import { ALLOW_NON_STAFF_KEY, IS_PUBLIC_KEY } from './decorators';

export type NonStaffGuardMode = 'log' | 'enforce';

/** NON_STAFF_GUARD_MODE=enforce turns would-be denials into 403; anything else (default) = log only. Read per request. */
export function nonStaffGuardMode(): NonStaffGuardMode {
  return String(process.env.NON_STAFF_GUARD_MODE || '').trim().toLowerCase() === 'enforce' ? 'enforce' : 'log';
}

const NON_STAFF = new Set<string>(NON_STAFF_ROLES);
const STAFF = new Set<string>(Object.values(UserRole).filter((r) => !NON_STAFF.has(r)));

/**
 * Global deny-by-default for non-staff principals. Parent tokens share the staff JwtStrategy
 * and secret, and RolesGuard lets any authenticated user through a route that has no @Roles,
 * so without this a parent can reach most of the API.
 *
 * Order of checks: @Public -> no user -> staff -> non-staff on an @AllowNonStaff route
 * -> everything else (other non-staff, parent_lead, unrecognised or missing role) is denied.
 * In log mode (default) a denial is only logged; in enforce mode it is a 403.
 *
 * Adds a requirement on top of the other global guards and never grants access. Must run after
 * JwtAuthGuard so req.user is set (see AppModule.providers).
 */
@Injectable()
export class NonStaffGuard implements CanActivate {
  private readonly logger = new Logger('NonStaffGuard');

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (!user) return true;

    const role = String(user.role || user.primaryRole || '');
    if (STAFF.has(role)) return true;
    if (NON_STAFF.has(role) && this.reflector.getAllAndOverride<boolean>(ALLOW_NON_STAFF_KEY, targets)) return true;

    const mode = nonStaffGuardMode();
    // Structured and PII-free: role, route pattern, method and ids only.
    this.logger.warn(JSON.stringify({
      event: 'non_staff_guard',
      mode,
      decision: mode === 'enforce' ? 'denied' : 'would_deny',
      role,
      method: req.method,
      route: `${req.baseUrl || ''}${req.route?.path || ''}` || '(unknown)',
      userId: String(user.userId || ''),
      tenantId: String(user.tenantId || ''),
      hasGuardianIds: Array.isArray(user.guardianOfStudentIds) && user.guardianOfStudentIds.length > 0,
    }));
    if (mode === 'enforce') throw new ForbiddenException('Access denied. This area is for school staff only.');
    return true;
  }
}
