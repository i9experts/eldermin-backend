import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlatformRole, PlatformRoleDocument } from '../schemas/platform-role.schema';
import { User, UserDocument } from '../../modules/organization/schemas/user.schema';
import { PLATFORM_ACCESS_KEY, PlatformAccessRequirement } from '../decorators/require-platform-access.decorator';
import { IS_PUBLIC_KEY } from '../../auth/decorators';
import { resolvePlatformAccessLevel, satisfiesRequiredPlatformLevel } from '../platform-access.util';

/**
 * Platform-level mirror of CustomRoleGuard (src/roles/guards) - the only
 * thing that ever consults User.customPlatformRoleId / PlatformRole.moduleAccess
 * to make an authorization decision. Deliberately additive, exactly like
 * its institution-level counterpart:
 *
 *  - A route with no @RequirePlatformAccess() metadata: no-op.
 *  - A super_admin with no customPlatformRoleId (today's single account,
 *    and any account created without a restricted role): no-op - they
 *    keep full, unrestricted access, governed entirely by the existing
 *    blanket @Roles(SUPER_ADMIN) on SuperAdminController.
 *  - A super_admin WITH a customPlatformRoleId hitting a decorated route:
 *    resolved against their PlatformRole.moduleAccess, 403 if the
 *    required level isn't met.
 */
@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel(PlatformRole.name) private platformRoleModel: Model<PlatformRoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requirement = this.reflector.getAllAndOverride<PlatformAccessRequirement>(PLATFORM_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request?.user?.userId;
    if (!userId) return true;

    const user = await this.userModel.findById(userId).select('customPlatformRoleId').lean();
    if (!user?.customPlatformRoleId) return true;

    const role = await this.platformRoleModel.findById(user.customPlatformRoleId).select('moduleAccess').lean();
    if (!role) {
      throw new ForbiddenException('Your assigned role could not be found — contact a platform administrator.');
    }

    const granted = resolvePlatformAccessLevel(role.moduleAccess as any, requirement.tabKey, requirement.subTabKey);
    if (!satisfiesRequiredPlatformLevel(granted, requirement.level)) {
      const target = requirement.subTabKey ? `${requirement.tabKey}:${requirement.subTabKey}` : requirement.tabKey;
      throw new ForbiddenException(`Access denied. Your role does not have ${requirement.level} access to ${target}.`);
    }

    return true;
  }
}
