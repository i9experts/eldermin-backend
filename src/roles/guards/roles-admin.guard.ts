import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../schemas/role.schema';
import { User, UserDocument } from '../../modules/organization/schemas/user.schema';
import { UserRole } from '../../auth/roles.enum';
import { ROLES_ADMIN_ROLES, NON_STAFF_ROLES } from '../../auth/admin-role-sets';
import { hasFullModuleManage } from '../full-module-access.util';

/**
 * Guards every /roles route: owner/admin/super_admin, or a custom role with
 * FULL (module-wide) institution manage - the web gate is the module-wide
 * permission `institution:manage` (Sidebar.tsx:36). Sub-module-only grants
 * and view-only grants are rejected. Custom role is read live; any lookup
 * failure fails closed. parent/student/reseller never pass.
 */
@Injectable()
export class RolesAdminGuard implements CanActivate {
  private readonly logger = new Logger(RolesAdminGuard.name);

  constructor(
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest()?.user;
    if (!user) throw new ForbiddenException('Access denied. Authentication required.');
    const role = String(user.role || user.primaryRole || '');
    if (ROLES_ADMIN_ROLES.includes(role as UserRole)) return true;
    const denied = () => new ForbiddenException('Access denied. Requires owner/admin or a custom role with full Institution Setup manage access.');
    if (!role || NON_STAFF_ROLES.includes(role as UserRole) || !user.userId) throw denied();
    try {
      const u: any = await this.userModel.findById(user.userId).select('customRoleId').lean();
      if (!u?.customRoleId) throw denied();
      const r: any = await this.roleModel.findById(u.customRoleId).select('moduleAccess').lean();
      if (r && hasFullModuleManage(r.moduleAccess, 'institution')) return true;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.error(`Custom role lookup failed: ${(err as Error)?.message}`);
      throw new ForbiddenException('Access denied. Your role could not be verified.');
    }
    throw denied();
  }
}
