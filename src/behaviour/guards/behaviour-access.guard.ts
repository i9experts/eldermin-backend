import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../../roles/schemas/role.schema';
import { User, UserDocument } from '../../modules/organization/schemas/user.schema';
import { UserRole } from '../../auth/roles.enum';
import {
  BEHAVIOUR_ADMIN_ROLES, BEHAVIOUR_POLICY_KEY, BehaviourAccessContext, BehaviourPolicy,
  behaviourGuardMode, customRoleIsElevated, customRoleSatisfies, isNonStaffRole, logBehaviourGuard,
} from '../behaviour-access';

/**
 * Controller-level guard for /behaviour (B0 security fix).
 *  1. parent / student / reseller tokens: 403 on every /behaviour route, in
 *     BOTH BEHAVIOUR_GUARD_MODE modes (parents use /parent-portal only).
 *  2. every other caller is checked against the handler's @BehaviourAccess
 *     policy (base roles, or a custom role's live moduleAccess). A caller
 *     outside the policy is LOGGED (mode=log, the default) or 403 (enforce).
 *  3. a handler with no policy is treated as a would-deny (fail closed in
 *     enforce) so a new route cannot ship unguarded.
 * Attaches `req.behaviourAccess` (BehaviourAccessContext) for the controller
 * and service (teacher class scoping, author-or-admin).
 */
@Injectable()
export class BehaviourAccessGuard implements CanActivate {
  private readonly logger = new Logger('BehaviourAccessGuard');

  constructor(
    private reflector: Reflector,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /** Live custom-role moduleAccess, or null (no custom role / lookup failure -> fail closed). */
  private async customRoleAccess(userId?: string): Promise<any[] | null> {
    if (!userId) return null;
    try {
      const u: any = await this.userModel.findById(userId).select('customRoleId').lean();
      if (!u?.customRoleId) return null;
      const r: any = await this.roleModel.findById(u.customRoleId).select('moduleAccess').lean();
      return Array.isArray(r?.moduleAccess) ? r.moduleAccess : null;
    } catch (err) {
      this.logger.error(`Custom role lookup failed: ${(err as Error)?.message}`);
      return null;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (!user) throw new ForbiddenException('Access denied. Authentication required.');
    const role = String(user.role || user.primaryRole || '');
    const method = String(req.method || '').toUpperCase();
    const route = `${req.baseUrl || ''}${req.route?.path || ''}`;

    if (isNonStaffRole(role)) {
      logBehaviourGuard({ mode: behaviourGuardMode(), decision: 'denied', reason: 'non_staff_token', role, method, route, user });
      throw new ForbiddenException('Access denied. Behaviour data is not available to this account.');
    }

    const mode = behaviourGuardMode();
    const policy = this.reflector.getAllAndOverride<BehaviourPolicy>(BEHAVIOUR_POLICY_KEY, [context.getHandler(), context.getClass()]);

    let allowed = false;
    let reason = 'no_policy';
    let access: any[] | null = null;
    if (policy) {
      allowed = policy.roles.includes(role as UserRole);
      reason = `role_not_permitted:${policy.kind}`;
      if (!allowed && policy.customRoles) {
        access = await this.customRoleAccess(user.userId);
        allowed = customRoleSatisfies(access, policy);
      }
    }

    if (!allowed) {
      logBehaviourGuard({ mode, decision: mode === 'enforce' ? 'denied' : 'would_deny', reason, role, method, route, user });
      if (mode === 'enforce') throw new ForbiddenException('Access denied. Your role cannot use this behaviour feature.');
    }

    let elevated = BEHAVIOUR_ADMIN_ROLES.includes(role as UserRole);
    // A custom role whose BASE role is teacher is never elevated (author-only, resolve within own classes), whatever behaviour grant it holds,
    // the stock Teacher role included. Only a non-teacher base role (e.g. a "Discipline Head") holding the behaviour MANAGE grant is.
    if (!elevated && policy?.customRoles && role !== UserRole.TEACHER) {
      access = access ?? await this.customRoleAccess(user.userId);
      elevated = customRoleIsElevated(access, policy.subModule);
    }

    const ctx: BehaviourAccessContext = {
      mode, enforce: mode === 'enforce', role, isTeacher: role === UserRole.TEACHER, elevated, route, method,
    };
    req.behaviourAccess = ctx;
    return true;
  }
}
