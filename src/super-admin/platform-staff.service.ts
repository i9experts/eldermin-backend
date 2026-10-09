import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { PlatformRole, PlatformRoleDocument, ASSIGNABLE_PLATFORM_TABS, SUB_TABS } from './schemas/platform-role.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { Tenant, TenantDocument } from '../modules/organization/schemas/tenant.schema';
import { CreatePlatformRoleDto, UpdatePlatformRoleDto, CreatePlatformStaffDto } from './dto/platform-role.dto';

// Same fake platform-wide tenant the one existing super_admin account was
// bootstrapped onto (src/scripts/create-super-admin.ts) - every new
// platform staff account joins it too, so getMe/other tenantId-scoped
// lookups keep working exactly the way they already do for that account,
// rather than leaving new accounts with no tenantId at all and silently
// breaking anything that expects one to resolve.
const PLATFORM_TENANT_SLUG = 'eldermin-platform';

// Mirrors the 4 roles named in the Team & Access placeholder copy exactly
// ("Sales, Support, Onboarding, Finance") - sensible starting points for
// i9experts' own internal team, read-only (isSystemDefault) but
// duplicate-and-customize, just like the institution-level system's own
// Teacher/Finance Officer/etc. defaults.
const SYSTEM_DEFAULT_PLATFORM_ROLES: { name: string; description: string; color: string; moduleAccess: { tabKey: string; level: 'view' | 'manage' }[] }[] = [
  {
    name: 'Sales', description: 'Pipeline, leads, and institution onboarding conversations.',
    color: '#0C447C',
    moduleAccess: [
      { tabKey: 'crm', level: 'manage' }, { tabKey: 'institutions', level: 'view' },
      { tabKey: 'subscriptions', level: 'view' },
    ],
  },
  {
    name: 'Support', description: 'Handles support tickets and institution health checks.',
    color: '#10b981',
    moduleAccess: [
      { tabKey: 'tickets', level: 'manage' }, { tabKey: 'institutions', level: 'view' },
      { tabKey: 'alerts', level: 'view' },
    ],
  },
  {
    name: 'Onboarding', description: 'Activates new institutions and manages their initial setup.',
    color: '#EF9F27',
    moduleAccess: [
      { tabKey: 'institutions', level: 'manage' }, { tabKey: 'crm', level: 'view' },
    ],
  },
  {
    name: 'Finance', description: 'Billing, subscriptions, and platform revenue reporting.',
    color: '#8b5cf6',
    moduleAccess: [
      { tabKey: 'subscriptions', level: 'manage' }, { tabKey: 'analytics', level: 'view' },
    ],
  },
];

@Injectable()
export class PlatformStaffService {
  constructor(
    @InjectModel(PlatformRole.name) private platformRoleModel: Model<PlatformRoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel('OrgInstitution') private orgInstitutionModel: Model<any>,
  ) {}

  private async resolvePlatformTenant() {
    let tenant = await this.tenantModel.findOne({ slug: PLATFORM_TENANT_SLUG });
    if (!tenant) {
      tenant = await this.tenantModel.create({
        slug: PLATFORM_TENANT_SLUG, displayName: 'Eldermin Platform (Internal)',
        status: 'active', plan: 'enterprise', activeModules: [], isSetupComplete: true,
      });
    }
    let institution = await this.orgInstitutionModel.findOne({ tenantId: tenant._id });
    if (!institution) {
      institution = await this.orgInstitutionModel.create({
        tenantId: tenant._id, name: 'Eldermin Platform', currency: 'PKR', isActive: true,
      });
    }
    return { tenantId: tenant._id, institutionId: institution._id };
  }

  // ── Roles ──────────────────────────────────────────────────────────────

  getAssignableTabs() {
    return ASSIGNABLE_PLATFORM_TABS.map(t => ({ ...t, subTabs: SUB_TABS[t.key] || [] }));
  }

  private async ensureSystemDefaults() {
    const existingCount = await this.platformRoleModel.countDocuments({ isSystemDefault: true });
    if (existingCount > 0) return;
    await this.platformRoleModel.insertMany(
      SYSTEM_DEFAULT_PLATFORM_ROLES.map(r => ({ ...r, isSystemDefault: true })),
    );
  }

  async getRoles() {
    await this.ensureSystemDefaults();
    const roles = await this.platformRoleModel.find().sort({ isSystemDefault: -1, name: 1 }).lean();
    const counts = await this.userModel.aggregate([
      { $match: { customPlatformRoleId: { $ne: null } } },
      { $group: { _id: '$customPlatformRoleId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c: any) => [String(c._id), c.count]));
    return roles.map((r: any) => ({ ...r, assignedCount: countMap.get(String(r._id)) || 0 }));
  }

  async createRole(dto: CreatePlatformRoleDto, createdBy: string) {
    const existing = await this.platformRoleModel.findOne({ name: dto.name });
    if (existing) throw new BadRequestException(`A role named "${dto.name}" already exists`);
    const role = new this.platformRoleModel({ ...dto, createdBy, isSystemDefault: false });
    return role.save();
  }

  async updateRole(id: string, dto: UpdatePlatformRoleDto) {
    const role = await this.platformRoleModel.findById(id);
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystemDefault) {
      throw new BadRequestException('Built-in roles cannot be edited directly — duplicate it to create a customizable copy');
    }
    Object.assign(role, dto);
    return role.save();
  }

  async duplicateRole(id: string, createdBy: string) {
    const role = await this.platformRoleModel.findById(id).lean();
    if (!role) throw new NotFoundException('Role not found');
    let newName = `${role.name} (Copy)`;
    let counter = 2;
    while (await this.platformRoleModel.findOne({ name: newName })) {
      newName = `${role.name} (Copy ${counter++})`;
    }
    const copy = new this.platformRoleModel({
      name: newName, description: role.description, color: role.color,
      moduleAccess: role.moduleAccess, isSystemDefault: false, createdBy,
    });
    return copy.save();
  }

  async deleteRole(id: string) {
    const role = await this.platformRoleModel.findById(id);
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystemDefault) throw new BadRequestException('Built-in roles cannot be deleted');
    const assignedCount = await this.userModel.countDocuments({ customPlatformRoleId: role._id });
    if (assignedCount > 0) {
      throw new BadRequestException(`${assignedCount} staff member(s) currently have this role — reassign them first`);
    }
    await this.platformRoleModel.deleteOne({ _id: id });
    return { message: 'Role deleted' };
  }

  async assignRole(userId: string, roleId: string | null) {
    if (roleId) {
      const role = await this.platformRoleModel.findById(roleId);
      if (!role) throw new NotFoundException('Role not found');
    }
    const user = await this.userModel.findOneAndUpdate(
      { _id: userId, primaryRole: 'super_admin' },
      { $set: { customPlatformRoleId: roleId ? new Types.ObjectId(roleId) : null } },
      { new: true },
    ).select('-passwordHash');
    if (!user) throw new NotFoundException('Platform staff account not found');
    return user;
  }

  // ── Staff ──────────────────────────────────────────────────────────────

  async getStaff() {
    const staff = await this.userModel.find({ primaryRole: 'super_admin' })
      .select('-passwordHash').sort({ createdAt: -1 }).lean();
    const roleIds = [...new Set(staff.map((s: any) => s.customPlatformRoleId).filter(Boolean).map(String))];
    const roles = roleIds.length
      ? await this.platformRoleModel.find({ _id: { $in: roleIds } }).select('name color').lean()
      : [];
    const roleMap = new Map(roles.map((r: any) => [String(r._id), r]));
    return staff.map((s: any) => ({
      id: s._id,
      name: `${s.profile?.firstName || ''} ${s.profile?.lastName || ''}`.trim() || s.email,
      email: s.email,
      isActive: s.isActive,
      lastLoginAt: s.lastLoginAt || null,
      createdAt: s.createdAt,
      customPlatformRoleId: s.customPlatformRoleId || null,
      role: s.customPlatformRoleId ? roleMap.get(String(s.customPlatformRoleId)) || null : null,
    }));
  }

  private generateTempPassword(): string {
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `Eldermin${digits}!`;
  }

  async createStaff(dto: CreatePlatformStaffDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.userModel.findOne({ email });
    if (existing) throw new BadRequestException('An account with this email already exists');
    if (dto.roleId) {
      const role = await this.platformRoleModel.findById(dto.roleId);
      if (!role) throw new NotFoundException('Role not found');
    }

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const { tenantId, institutionId } = await this.resolvePlatformTenant();
    const user = await this.userModel.create({
      tenantId, institutionId,
      email,
      passwordHash,
      profile: { firstName: dto.firstName, lastName: dto.lastName },
      primaryRole: 'super_admin',
      customPlatformRoleId: dto.roleId ? new Types.ObjectId(dto.roleId) : null,
      isActive: true,
    });

    return {
      id: user._id,
      email: user.email,
      tempPassword, // returned once, at creation - never retrievable again
    };
  }

  async setStaffActive(userId: string, isActive: boolean) {
    const user = await this.userModel.findOneAndUpdate(
      { _id: userId, primaryRole: 'super_admin' },
      { $set: { isActive } },
      { new: true },
    ).select('-passwordHash');
    if (!user) throw new NotFoundException('Platform staff account not found');
    return user;
  }

  async resetStaffPassword(userId: string) {
    const user = await this.userModel.findOne({ _id: userId, primaryRole: 'super_admin' });
    if (!user) throw new NotFoundException('Platform staff account not found');
    const tempPassword = this.generateTempPassword();
    user.passwordHash = await bcrypt.hash(tempPassword, 12);
    await user.save();
    return { tempPassword };
  }

  // Converts a role's moduleAccess into the flat 'tab:level' permission
  // shape the frontend can use to hide/disable Super Admin tabs it
  // doesn't have access to - same convention as RolesService.toPermissions.
  static toPermissions(moduleAccess: { tabKey: string; level: string; subTabKey?: string | null }[]): string[] {
    const perms: string[] = [];
    for (const m of moduleAccess || []) {
      const prefix = m.subTabKey ? `${m.tabKey}:${m.subTabKey}` : m.tabKey;
      perms.push(`${prefix}:view`);
      if (m.level === 'manage') perms.push(`${prefix}:manage`);
    }
    return perms;
  }

  async getPermissionsForUser(userId: string): Promise<string[] | null> {
    const user = await this.userModel.findById(userId).select('customPlatformRoleId').lean();
    if (!user?.customPlatformRoleId) return null;
    const role = await this.platformRoleModel.findById(user.customPlatformRoleId).lean();
    if (!role) return null;
    return PlatformStaffService.toPermissions(role.moduleAccess);
  }
}
