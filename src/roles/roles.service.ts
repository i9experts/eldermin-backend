import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument, ASSIGNABLE_MODULES, SUB_MODULES } from './schemas/role.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { UserRole } from '../auth/roles.enum';
import { ROLE_RANK, UNRESTRICTED_GRANTOR_ROLES } from '../auth/admin-role-sets';
import { CriticalAuditService } from '../common/critical-audit.service';
import { Ceiling, describeEntry, entriesAboveCeiling, entriesWithUnknownKeys } from './role-grant.util';

/** Who is calling (from the JWT). */
export interface RoleActor {
  userId: string;
  role: string;
  tenantId: string;
  schoolSlug: string;
  userName: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Base roles a custom role can never be attached to. */
const NOT_ASSIGNABLE_TARGETS = new Set<string>([
  UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT,
]);

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
    private audit: CriticalAuditService,
  ) {}

  // Role changes are FAIL-CLOSED audited with before/after (see CriticalAuditService).
  private audited<T>(actor: RoleActor, meta: any, loadBefore: () => Promise<any>, mutate: () => Promise<T>): Promise<T> {
    return this.audit.run(
      { schoolSlug: actor.schoolSlug, userId: actor.userId, name: actor.userName, ipAddress: actor.ipAddress, userAgent: actor.userAgent },
      { module: 'Roles', resourceType: 'Role', ...meta }, loadBefore, mutate,
    );
  }

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

  async getRoles(schoolSlug: string, tenantId?: string) {
    await this.ensureSystemDefaults(schoolSlug);
    const roles = await this.roleModel.find({ schoolSlug }).sort({ isSystemDefault: -1, name: 1 }).lean();
    // Attach a live count of how many staff currently have each role —
    // important context before someone edits or deletes a role.
    const counts = await this.userModel.aggregate([
      // Scoped to the caller's own school: counting across every tenant
      // leaked how many users of other schools hold a role id.
      { $match: { customRoleId: { $ne: null }, ...(tenantId ? { tenantId: RolesService.tenantMatch(tenantId) } : {}) } },
      { $group: { _id: '$customRoleId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c: any) => [String(c._id), c.count]));
    return roles.map((r: any) => ({ ...r, assignedCount: countMap.get(String(r._id)) || 0 }));
  }

  // The most this caller may grant: owner/admin = everything (the web gives
  // admin the owner's permission list); anyone holding a custom role = that
  // role's own moduleAccess (the web treats a custom role as fully
  // overriding the standard matrix); a custom-role holder whose role cannot be
  // read gets an empty ceiling (fail closed).
  private async grantCeiling(actor: RoleActor): Promise<Ceiling> {
    const u: any = await this.userModel.findById(actor.userId).select('customRoleId').lean();
    if (u?.customRoleId) {
      if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.INSTITUTION_OWNER) return 'unrestricted';
      const r: any = await this.roleModel.findById(u.customRoleId).select('moduleAccess').lean();
      return Array.isArray(r?.moduleAccess) ? r.moduleAccess : [];
    }
    if (UNRESTRICTED_GRANTOR_ROLES.includes(actor.role as UserRole)) return 'unrestricted';
    return [];
  }

  private async assertWithinCeiling(actor: RoleActor, moduleAccess: any[] | undefined | null) {
    const unknown = entriesWithUnknownKeys(moduleAccess);
    if (unknown.length) {
      throw new BadRequestException(`Unknown module or sub-module: ${unknown.map(describeEntry).join(', ')}`);
    }
    const above = entriesAboveCeiling(await this.grantCeiling(actor), moduleAccess);
    if (above.length) {
      throw new ForbiddenException(
        `You cannot grant access higher than your own: ${above.map(describeEntry).join(', ')}`,
      );
    }
  }

  async createRole(actor: RoleActor, dto: CreateRoleDto) {
    const { schoolSlug, userName: createdBy } = actor;
    await this.assertWithinCeiling(actor, dto.moduleAccess);
    const existing = await this.roleModel.findOne({ schoolSlug, name: dto.name });
    if (existing) throw new BadRequestException(`A role named "${dto.name}" already exists`);
    return this.audited(actor, { action: 'Create role', type: 'create', requested: dto }, async () => null, () => {
      const role = new this.roleModel({ ...dto, schoolSlug, createdBy, isSystemDefault: false });
      return role.save();
    });
  }

  async updateRole(actor: RoleActor, id: string, dto: UpdateRoleDto) {
    const { schoolSlug } = actor;
    const role = await this.roleModel.findOne({ _id: id, schoolSlug });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystemDefault) {
      throw new BadRequestException('Built-in roles cannot be edited directly — duplicate it to create a customizable copy');
    }
    const self: any = await this.userModel.findById(actor.userId).select('customRoleId').lean();
    if (self?.customRoleId && String(self.customRoleId) === String(role._id)) {
      throw new ForbiddenException('You cannot edit the role you currently hold.');
    }
    if (dto.moduleAccess) await this.assertWithinCeiling(actor, dto.moduleAccess);
    return this.audited(
      actor,
      { action: 'Update role', type: 'update', resourceId: String(role._id), resourceTitle: role.name, requested: dto },
      async () => (typeof (role as any).toObject === 'function' ? (role as any).toObject() : role),
      () => { Object.assign(role, dto); return role.save(); },
    );
  }

  async duplicateRole(actor: RoleActor, id: string) {
    const { schoolSlug, userName: createdBy } = actor;
    const role = await this.roleModel.findOne({ _id: id, schoolSlug }).lean();
    if (!role) throw new NotFoundException('Role not found');
    await this.assertWithinCeiling(actor, role.moduleAccess as any);
    let newName = `${role.name} (Copy)`;
    let counter = 2;
    while (await this.roleModel.findOne({ schoolSlug, name: newName })) {
      newName = `${role.name} (Copy ${counter++})`;
    }
    return this.audited(actor, { action: 'Duplicate role', type: 'create', resourceId: String(role._id), resourceTitle: role.name, requested: { name: newName, moduleAccess: role.moduleAccess } }, async () => null, () => {
      const copy = new this.roleModel({
        schoolSlug, name: newName, description: role.description, color: role.color,
        moduleAccess: role.moduleAccess, isSystemDefault: false, createdBy,
      });
      return copy.save();
    });
  }

  async deleteRole(actor: RoleActor, id: string) {
    const { schoolSlug } = actor;
    const role = await this.roleModel.findOne({ _id: id, schoolSlug });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystemDefault) throw new BadRequestException('Built-in roles cannot be deleted');
    const assignedCount = await this.userModel.countDocuments({ customRoleId: role._id, tenantId: this.tenantMatchFor(actor.tenantId) });
    if (assignedCount > 0) {
      throw new BadRequestException(`${assignedCount} staff member(s) currently have this role — reassign them first`);
    }
    return this.audited(
      actor,
      { action: 'Delete role', type: 'delete', resourceId: String(role._id), resourceTitle: role.name, requested: { id } },
      async () => (typeof (role as any).toObject === 'function' ? (role as any).toObject() : role),
      async () => { await this.roleModel.deleteOne({ _id: id }); return { message: 'Role deleted' }; },
    );
  }

  /**
   * tenantId is stored as a STRING on users created by this codebase (the
   * paths are untyped and newTid() returns the raw string) and as an ObjectId
   * on others (onboarding / seeds). Match either form so tenant scoping
   * neither leaks nor 404s. Found by the real boot test: an ObjectId-only
   * filter made every assign 404 for string-tenant users.
   */
  static tenantMatch(tenantId: string) {
    const asString = String(tenantId);
    // `new Types.ObjectId(...)` throws a BSONError for anything that isn't
    // a valid 24-char hex string - GET /roles started 500ing outright
    // whenever the caller's tenantId happened to be one of those (an
    // empty/placeholder value, a non-ObjectId legacy id, etc.), for every
    // role in the school, not just for that one caller. A tenantId that
    // isn't a real ObjectId can't equal any user's ObjectId-typed tenantId
    // anyway, so falling back to a string-only match is still correct - it
    // just can't also match the ObjectId-typed form, which is fine since
    // there's no valid ObjectId to build from it in the first place.
    return Types.ObjectId.isValid(asString)
      ? { $in: [asString, new Types.ObjectId(asString)] }
      : asString;
  }

  private tenantMatchFor(tenantId: string) {
    if (!tenantId || !Types.ObjectId.isValid(tenantId)) throw new ForbiddenException('No school context on this account.');
    return RolesService.tenantMatch(tenantId);
  }

  async assignRole(actor: RoleActor, userId: string, roleId: string | null) {
    const { schoolSlug } = actor;
    const tenantId = this.tenantMatchFor(actor.tenantId);
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid user id');
    // Nobody changes their own role: that is the self-escalation path.
    if (String(userId) === String(actor.userId)) {
      throw new ForbiddenException('You cannot change your own role.');
    }
    // Target must be a user of the caller's OWN school (this used to be an
    // unscoped findByIdAndUpdate, i.e. cross-tenant).
    const target: any = await this.userModel.findOne({ _id: userId, tenantId }).select('primaryRole').lean();
    if (!target) throw new NotFoundException('User not found');
    const targetRank = ROLE_RANK[target.primaryRole] || 0;
    const actorRank = ROLE_RANK[actor.role] || 0;
    if (targetRank > actorRank) {
      throw new ForbiddenException('You cannot change the role of a more senior account.');
    }
    if (roleId) {
      if (NOT_ASSIGNABLE_TARGETS.has(target.primaryRole)) {
        throw new BadRequestException('Custom roles can only be assigned to staff accounts.');
      }
      const role = await this.roleModel.findOne({ _id: roleId, schoolSlug });
      if (!role) throw new NotFoundException('Role not found');
      await this.assertWithinCeiling(actor, role.moduleAccess as any);
    }
    const user = await this.audited(
      actor,
      { action: roleId ? 'Assign role' : 'Unassign role', type: 'update', resourceType: 'User', resourceId: String(userId), requested: { userId, roleId } },
      async () => ({ userId, previousCustomRoleId: (await this.userModel.findOne({ _id: userId, tenantId }).select('customRoleId').lean() as any)?.customRoleId ?? null }),
      () => this.userModel.findOneAndUpdate(
        { _id: userId, tenantId },
        { $set: { customRoleId: roleId ? new Types.ObjectId(roleId) : null } },
        { new: true },
      ).select('-passwordHash -resetPasswordTokenHash -resetPasswordExpires'),
    );
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
    const users = await this.userModel.find({ tenantId: tenantId && Types.ObjectId.isValid(tenantId) ? RolesService.tenantMatch(tenantId) : tenantId, isActive: true })
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
