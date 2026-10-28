import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { behaviourGuardMode, isNonStaffRole, logBehaviourGuard } from '../behaviour-access';

/**
 * Qaida / Nazra (B0.2): parent, student and reseller tokens get 403 on EVERY route, in BOTH
 * BEHAVIOUR_GUARD_MODE modes (same rule as /behaviour/*). Deliberately nothing else: staff roles keep
 * exactly today's access (no per-route policy, no teacher scoping yet; see hardening-backlog.md).
 */
@Injectable()
export class BehaviourStaffOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (!user) throw new ForbiddenException('Access denied. Authentication required.');
    const role = String(user.role || user.primaryRole || '');
    if (isNonStaffRole(role)) {
      logBehaviourGuard({
        mode: behaviourGuardMode(), decision: 'denied', reason: 'non_staff_token', role,
        method: String(req.method || '').toUpperCase(), route: `${req.baseUrl || ''}${req.route?.path || ''}`, user,
      });
      throw new ForbiddenException('Access denied. Behaviour data is not available to this account.');
    }
    return true;
  }
}
