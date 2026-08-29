import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument, ASSIGNABLE_MODULES, SUB_MODULES } from './schemas/role.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

// A handful of sensible starting points so a school isn't looking at a
// completely blank slate — these seed on first request per school and are
// marked read-only (isSystemDefault), but can be duplicated and customized.
const SYSTEM_DEFAULT_ROLES: { name: string; description: string; color: string; moduleAccess: { moduleKey: string; level: 'view' | 'manage' }[] }[] = [
  {
    name: 'Teacher', description: 'Classroom-facing access: teaching, students, assessments, behaviour.',
    color: '#0C447C',
    moduleAccess: [
      { moduleKey: 'teaching', level: 'manage' }, { moduleKey: 'students', level: 'view' },
      { moduleKey: 'assessments', level: 'manage' }, { moduleKey: 'behaviour', level: 'manage' },
      { moduleKey: 'academics', level: 'view' },
    ],
  },
  {
    name: 'Finance Officer', description: 'Fee collection, invoicing, and financial reporting.',
    color: '#10b981',
    moduleAccess: [{ moduleKey: 'finance', level: 'manage' }, { moduleKey: 'students', level: 'view' }],
  },
  {
    name: 'Admissions Officer', description: 'Manages the admission pipeline end-to-end.',
    color: '#EF9F27',
    moduleAccess: [{ moduleKey: 'admissions', level: 'manage' }, { moduleKey: 'students', level: 'view' }],
  },
  {
    name: 'Front Desk / Support Staff', description: 'Documents, campus operations, read-only visibility elsewhere.',
    color: '#64748b',
    moduleAccess: [
      { moduleKey: 'documents', level: 'manage' }, { moduleKey: 'campus', level: 'view' },
      { moduleKey: 'students', level: 'view' },
    ],
  },
];

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // Nests each module's real sub-modules under it, from the single shared
  // SUB_MODULES registry (role.schema.ts) — the frontend's Edit Role tree
  // and this guard's own resolution logic both read from that same source,
  // so they can never drift out of sync with each other.
  getAssignableModules() {
    return ASSIGNABLE_MODULES.map(m => ({
      ...m,
      subModules: SUB_MODULES[m.key] || [],
    }));
  }

  private async ensureSystemDefaults(schoolSlug: string) {
    const existingCount = await this.roleModel.countDocuments({ schoolSlug, isSystemDefault: true });
    if (existingCount > 0) return;
    await this.roleModel.insertMany(
      SYSTEM_DEFAULT_ROLES.map(r => ({ ...r, schoolSlug, isSystemDefault: true })),
    );
  }

  async getRoles(schoolSlug: string) {
    await this.ensureSystemDefaults(schoolSlug);
    const roles = await this.roleModel.find({ schoolSlug }).sort({ isSystemDefault: -1, name: 1 }).lean();
    // Attach a live count of how many staff currently have each role —
    // important context before someone edits or deletes a role.
    const counts = await this.userModel.aggregate([
      { $match: { customRoleId: { $ne: null } } },
      { $group: { _id: '$customRoleId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c: any) => [String(c._id), c.count]));
    return roles.map((r: any) => ({ ...r, assignedCount: countMap.get(String(r._id)) || 0 }));
  }

  async createRole(schoolSlug: string, dto: CreateRoleDto, createdBy: string) {
    const existing = await this.roleModel.findOne({ schoolSlug, name: dto.name });
    if (existing) throw new BadRequestException(`A role named "${dto.name}" already exists`);
    const role = new this.roleModel({ ...dto, schoolSlug, createdBy, isSystemDefault: false });
    return role.save();
  }

  async updateRole(id: string, schoolSlug: string, dto: UpdateRoleDto) {
    const role = await this.roleModel.findOne({ _id: id, schoolSlug });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystemDefault) {
      throw new BadRequestException('Built-in roles cannot be edited directly — duplicate it to create a customizable copy');
    }
    Object.assign(role, dto);
    return role.save();
  }

  async duplicateRole(id: string, schoolSlug: string, createdBy: string) {
    const role = await this.roleModel.findOne({ _id: id, schoolSlug }).lean();
    if (!role) throw new NotFoundException('Role not found');
    let newName = `${role.name} (Copy)`;
    let counter = 2;
    while (await this.roleModel.findOne({ schoolSlug, name: newName })) {
      newName = `${role.name} (Copy ${counter++})`;
    }
    const copy = new this.roleModel({
      schoolSlug, name: newName, description: role.description, color: role.color,
      moduleAccess: role.moduleAccess, isSystemDefault: false, createdBy,
    });
    return copy.save();
  }

  async deleteRole(id: string, schoolSlug: string) {
    const role = await this.roleModel.findOne({ _id: id, schoolSlug });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystemDefault) throw new BadRequestException('Built-in roles cannot be deleted');
    const assignedCount = await this.userModel.countDocuments({ customRoleId: role._id });
    if (assignedCount > 0) {
      throw new BadRequestException(`${assignedCount} staff member(s) currently have this role — reassign them first`);
    }
    await this.roleModel.deleteOne({ _id: id });
    return { message: 'Role deleted' };
  }

  async assignRole(schoolSlug: string, userId: string, roleId: string | null) {
    if (roleId) {
      const role = await this.roleModel.findOne({ _id: roleId, schoolSlug });
      if (!role) throw new NotFoundException('Role not found');
    }
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { customRoleId: roleId ? new Types.ObjectId(roleId) : null } },
      { new: true },
    ).select('-passwordHash');
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // Converts a role's moduleAccess into the flat Permission[] shape the
  // frontend's canAccess() already understands ('hr:view', 'hr:manage', ...)
  // — 'manage' implies 'view' too, matching the existing hardcoded matrix's
  // convention for standard enum roles.
  //
  // An entry WITH a subModuleKey emits the granular 3-part form
  // ('finance:payable:view' / 'finance:payable:manage') ONLY — it does
  // NOT also grant the bare module-wide form, so a sub-module-specific
  // grant never widens into "the whole module". canAccess() on the
  // frontend checks the 3-part form first and falls back to the 2-part
  // module-wide form, mirroring resolveAccessLevel() on the backend.
  static toPermissions(moduleAccess: { moduleKey: string; level: string; subModuleKey?: string | null }[]): string[] {
    const perms: string[] = [];
    for (const m of moduleAccess || []) {
      const prefix = m.subModuleKey ? `${m.moduleKey}:${m.subModuleKey}` : m.moduleKey;
      perms.push(`${prefix}:view`);
      if (m.level === 'manage') perms.push(`${prefix}:manage`);
    }
    return perms;
  }

  async getPermissionsForUser(userId: string): Promise<string[] | null> {
    const user = await this.userModel.findById(userId).select('customRoleId').lean();
    if (!user?.customRoleId) return null; // no custom role — frontend falls back to the standard matrix
    const role = await this.roleModel.findById(user.customRoleId).lean();
    if (!role) return null;
    return RolesService.toPermissions(role.moduleAccess);
  }

  // Real login accounts at this school — separate from the HR Staff
  // directory, which is just records and doesn't necessarily have a
  // corresponding account able to log in at all. Role assignment only
  // makes sense against something that can actually authenticate.
  async getUsersForSchool(tenantId: string) {
    const users = await this.userModel.find({ tenantId, isActive: true })
      .select('email profile primaryRole customRoleId').lean();
    return users.map((u: any) => ({
      id: u._id,
      name: `${u.profile?.firstName || ''} ${u.profile?.lastName || ''}`.trim() || u.email,
      email: u.email,
      standardRole: u.primaryRole,
      customRoleId: u.customRoleId || null,
    }));
  }
}
