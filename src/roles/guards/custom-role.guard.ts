import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../schemas/role.schema';
import { User, UserDocument } from '../../modules/organization/schemas/user.schema';
import { MODULE_ACCESS_KEY, ModuleAccessRequirement } from '../decorators/require-module-access.decorator';
import { IS_PUBLIC_KEY } from '../../auth/decorators';
import { resolveAccessLevel, satisfiesRequiredLevel } from '../module-access.util';

/**
 * Real server-side enforcement for the custom Role & Permission system.
 *
 * This guard is the ONLY thing that ever consults User.customRoleId /
 * Role.moduleAccess to make an authorization decision - previously that
 * data only ever reached the frontend (for hide/show UI), never the
 * backend. It is deliberately additive:
 *
 *  - A route with no @RequireModuleAccess() metadata: this guard is a
 *    complete no-op (returns true immediately), regardless of the user.
 *  - A user with no customRoleId (i.e. still on the standard UserRole
 *    enum): this guard is a complete no-op for them, on every route -
 *    they keep being governed entirely by the existing RolesGuard /
 *    PERMISSIONS_MATRIX, exactly as before this guard existed.
 *  - A user WITH a customRoleId hitting a decorated route: this guard
 *    resolves their Role.moduleAccess for the route's module/sub-module
 *    and denies with 403 if the required level isn't met. This runs IN
 *    ADDITION to RolesGuard, which still runs too - this guard never
 *    removes or replaces that check.
 */
@Injectable()
export class CustomRoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requirement = this.reflector.getAllAndOverride<ModuleAccessRequirement>(MODULE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No decorator on this route - this guard has nothing to check.
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request?.user?.userId;
    if (!userId) return true; // no authenticated user context - JwtAuthGuard already handles that

    const user = await this.userModel.findById(userId).select('customRoleId').lean();
    // No custom role assigned - this user is governed entirely by the
    // standard UserRole/PERMISSIONS_MATRIX system; do not touch them.
    if (!user?.customRoleId) return true;

    const role = await this.roleModel.findById(user.customRoleId).select('moduleAccess').lean();
    // Assigned role was deleted/missing - fail closed rather than silently
    // granting access, since this user was explicitly moved onto the
    // custom-role system.
    if (!role) {
      throw new ForbiddenException('Your assigned role could not be found — contact an administrator.');
    }

    const granted = resolveAccessLevel(role.moduleAccess as any, requirement.moduleKey, requirement.subModuleKey);
    if (!satisfiesRequiredLevel(granted, requirement.level)) {
      const target = requirement.subModuleKey
        ? `${requirement.moduleKey}:${requirement.subModuleKey}`
        : requirement.moduleKey;
      throw new ForbiddenException(
        `Access denied. Your role does not have ${requirement.level} access to ${target}.`,
      );
    }

    return true;
  }
}
