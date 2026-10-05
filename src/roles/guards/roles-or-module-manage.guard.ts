import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../schemas/role.schema';
import { User, UserDocument } from '../../modules/organization/schemas/user.schema';
import { IS_PUBLIC_KEY } from '../../auth/decorators';
import { UserRole } from '../../auth/roles.enum';
import { ROLES_OR_MODULE_KEY, RolesOrModuleManageRequirement } from '../decorators/roles-or-module-manage.decorator';
import { customRoleGrants } from '../module-access.util';

/** Base roles that can never pass via a custom role. */
const NEVER_CUSTOM_ROLE = new Set<string>([
  UserRole.PARENT,
  UserRole.STUDENT,
  UserRole.RESELLER_ADMIN,
  UserRole.RESELLER_SUPPORT,
]);

/**
 * Global guard for @RolesOrModuleManage. Pass when the JWT base role is in the
 * allowed list (no DB access), otherwise consult the user's custom role LIVE
 * (User.customRoleId -> Role.moduleAccess). Fails closed on any lookup
 * failure. No metadata (or @Public) = no-op.
 */
@Injectable()
export class RolesOrModuleManageGuard implements CanActivate {
  private readonly logger = new Logger(RolesOrModuleManageGuard.name);

  constructor(
    private reflector: Reflector,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = this.reflector.getAllAndOverride<RolesOrModuleManageRequirement>(ROLES_OR_MODULE_KEY, targets);
    if (!req) return true;

    const user = context.switchToHttp().getRequest()?.user;
    // Authenticated routes always have a user; fail closed if the guard ever
    // runs without one rather than leaving a guarded route open.
    if (!user) throw new ForbiddenException('Access denied. Authentication required.');

    const role = String(user.role || user.primaryRole || '');
    const denied = () =>
      new ForbiddenException(
        `Access denied. Requires one of: ${req.roles.join(', ')} or a custom role with ${req.level} access to ${req.moduleKey}.`,
      );

    if (req.roles.includes(role as UserRole)) return true;
    if (!role || NEVER_CUSTOM_ROLE.has(role)) throw denied();

    const userId: string | undefined = user.userId;
    if (!userId) throw denied();

    try {
      const u = await this.userModel.findById(userId).select('customRoleId').lean();
      if (!u?.customRoleId) throw denied();
      const r = await this.roleModel.findById(u.customRoleId).select('moduleAccess').lean();
      if (!r) throw denied();
      if (customRoleGrants(r.moduleAccess as any, req.moduleKey, req.level, req.allowModuleWide)) return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.error(`Custom role lookup failed: ${(err as Error)?.message}`);
      throw new ForbiddenException('Access denied. Your role could not be verified — try again or contact an administrator.');
    }
    throw denied();
  }
}
