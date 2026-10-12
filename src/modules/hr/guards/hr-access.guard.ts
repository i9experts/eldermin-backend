import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../../../roles/schemas/role.schema';
import { User, UserDocument } from '../../organization/schemas/user.schema';
import { PERMISSION_KEY } from '../../../auth/decorators';
import { UserRole } from '../../../auth/roles.enum';
import { NON_STAFF_ROLES } from '../../../auth/admin-role-sets';
import { ROLES_OR_MODULE_KEY } from '../../../roles/decorators/roles-or-module-manage.decorator';
import { customRoleGrants } from '../../../roles/module-access.util';
import { HR_READ_KEY, HrReadPolicy } from './hr-access.decorator';

export type HrReadGuardMode = 'log' | 'enforce';

/** HR_READ_GUARD_MODE=enforce flips reads to 403; anything else (default) = log-only. Read per request. */
export function hrReadGuardMode(): HrReadGuardMode {
  return String(process.env.HR_READ_GUARD_MODE || '').trim().toLowerCase() === 'enforce' ? 'enforce' : 'log';
}

/**
 * Controller-level guard for /hr:
 *  1. parent / student / reseller tokens: 403 on EVERY /hr route, always.
 *  2. handlers carrying @HrWrite (RolesOrModuleManage) or leave:self: decided
 *     by their own guard, nothing more here.
 *  3. any other non-GET handler: 403 (fail closed - an unguarded write).
 *  4. @HrRead / @HrStaffDirectory GETs: HR roles (or custom role with hr
 *     view) pass; directory GETs pass for every staff role (req.hrFullAccess
 *     tells the controller whether to return full documents); other staff
 *     roles are LOGGED (mode=log, default) or 403 (mode=enforce). Sensitive
 *     reads (@HrReadSensitive) are ALWAYS 403 for them.
 */
@Injectable()
export class HrAccessGuard implements CanActivate {
  private readonly logger = new Logger('HrReadGuard');

  constructor(
    private reflector: Reflector,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private async customRoleHasHrView(userId?: string): Promise<boolean> {
    if (!userId) return false;
    try {
      const u: any = await this.userModel.findById(userId).select('customRoleId').lean();
      if (!u?.customRoleId) return false;
      const r: any = await this.roleModel.findById(u.customRoleId).select('moduleAccess').lean();
      return !!r && customRoleGrants(r.moduleAccess, 'hr', 'view', true);
    } catch (err) {
      this.logger.error(`Custom role lookup failed: ${(err as Error)?.message}`);
      return false; // fail closed
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (!user) throw new ForbiddenException('Access denied. Authentication required.');
    const role = String(user.role || user.primaryRole || '');

    if (!role || NON_STAFF_ROLES.includes(role as UserRole)) {
      throw new ForbiddenException('Access denied. HR data is not available to this account.');
    }

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride(ROLES_OR_MODULE_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride(PERMISSION_KEY, targets)) return true;

    const method = String(req.method || '').toUpperCase();
    const policy = this.reflector.getAllAndOverride<HrReadPolicy>(HR_READ_KEY, targets);
    if (!policy || (method !== 'GET' && method !== 'HEAD')) {
      throw new ForbiddenException('Access denied. This HR route has no access policy.');
    }

    const inList = policy.roles.includes(role as UserRole);
    const hrAllowed = inList || (await this.customRoleHasHrView(user.userId));
    req.hrFullAccess = hrAllowed;
    if (hrAllowed || policy.directory) return true;

    // Sensitive reads are always enforced; the flag only governs the non-sensitive rest.
    const mode: HrReadGuardMode = policy.enforce ? 'enforce' : hrReadGuardMode();
    // Structured, PII-free: role, route pattern, method, ids only.
    this.logger.warn(JSON.stringify({
      event: 'hr_read_guard',
      bucket: policy.enforce ? 'sensitive' : 'non_sensitive',
      mode,
      decision: mode === 'enforce' ? 'denied' : 'would_deny',
      role,
      method,
      route: `${req.baseUrl || ''}${req.route?.path || ''}` || '(unknown)',
      userId: String(user.userId || ''),
      tenantId: String(user.tenantId || ''),
    }));
    if (mode === 'enforce') throw new ForbiddenException('Access denied. Your role cannot view this HR data.');
    return true;
  }
}
