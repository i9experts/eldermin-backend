import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../schemas/role.schema';
import { User, UserDocument } from '../../modules/organization/schemas/user.schema';
import { IS_PUBLIC_KEY } from '../../auth/decorators';
import { UserRole } from '../../auth/roles.enum';
import { decide, matchRule, normalisePath } from '../custom-role-policy.rules';

export type CustomRoleGuardMode = 'log' | 'enforce';
/** CUSTOM_ROLE_GUARD_MODE=enforce makes a would-deny a 403; anything else (default) only writes the structured log line. Read per request. */
export function customRoleGuardMode(): CustomRoleGuardMode {
  return String(process.env.CUSTOM_ROLE_GUARD_MODE || '').trim().toLowerCase() === 'enforce' ? 'enforce' : 'log';
}

const TTL_MS = 15_000;
const MAX_ENTRIES = 5_000;
interface CacheEntry { customRoleId: string | null; access: any[] | null; roleMissing: boolean; expires: number }
const cache = new Map<string, CacheEntry>();
/** Test hook and the escape hatch after a role change (changes are otherwise picked up within TTL_MS). */
export function clearCustomRolePolicyCache() { cache.clear(); }

/**
 * Generic custom-role enforcement (R1). The CustomRoleGuard only reads @RequireModuleAccess, which exists on the Teaching and Finance
 * controllers; every other module let a base teacher through whatever the custom role said. This guard applies the Role.moduleAccess
 * of a user WITH a customRoleId to the routes listed in custom-role-policy.rules.ts (students, attendance, assessments, syllabus,
 * behaviour, curriculum, library, school calendar, events): read needs 'view', write needs 'manage', module removed = no access.
 *
 *  - No customRoleId (base-role staff, parents, students, platform roles): complete no-op, nothing is queried beyond the cached lookup.
 *  - Route not in the rules, @Public route: no-op.
 *  - Role document deleted while assigned: no grants (fail closed), same as CustomRoleGuard.
 *  - CUSTOM_ROLE_GUARD_MODE=log (default): a would-deny is logged as one JSON line `custom_role_guard` and the request proceeds;
 *    enforce: 403.
 * It is ADDITIVE: RolesGuard, CustomRoleGuard, RolesOrModuleManageGuard and BehaviourAccessGuard still run unchanged.
 */
@Injectable()
export class CustomRolePolicyGuard implements CanActivate {
  private readonly logger = new Logger('CustomRoleGuard');

  constructor(
    private reflector: Reflector,
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  private async lookup(userId: string): Promise<CacheEntry> {
    const now = Date.now();
    const hit = cache.get(userId);
    if (hit && hit.expires > now) return hit;
    const u: any = await this.userModel.findById(userId).select('customRoleId').lean();
    let entry: CacheEntry;
    if (!u?.customRoleId) entry = { customRoleId: null, access: null, roleMissing: false, expires: now + TTL_MS };
    else {
      const r: any = await this.roleModel.findById(u.customRoleId).select('moduleAccess').lean();
      entry = { customRoleId: String(u.customRoleId), access: r && Array.isArray(r.moduleAccess) ? r.moduleAccess : null, roleMissing: !r, expires: now + TTL_MS };
    }
    if (cache.size >= MAX_ENTRIES) for (const k of Array.from(cache.keys()).slice(0, MAX_ENTRIES / 10)) cache.delete(k);
    cache.set(userId, entry);
    return entry;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    const userId: string | undefined = user?.userId;
    if (!userId) return true;                                  // unauthenticated: JwtAuthGuard's job
    const role = String(user.role || user.primaryRole || '');
    if (role === UserRole.SUPER_ADMIN) return true;           // platform role: no school permissions to restrict

    const method = String(req.method || '').toUpperCase();
    const path = normalisePath(req.originalUrl || req.url || '');
    const rule = matchRule(path);
    if (!rule) return true;

    let entry: CacheEntry;
    try { entry = await this.lookup(userId); }
    catch (err) {
      // never turn a lookup failure into an access decision in log mode; in enforce fail closed
      this.logger.error(`Custom role lookup failed: ${(err as Error)?.message}`);
      if (customRoleGuardMode() === 'enforce') throw new ForbiddenException('Access denied. Your role could not be verified.');
      return true;
    }
    if (!entry.customRoleId) return true;                     // base-role staff: exactly as before

    const d = decide(rule, method, entry.roleMissing ? [] : entry.access);
    if (d.allowed) return true;
    const mode = customRoleGuardMode();
    this.logger.warn(JSON.stringify({
      event: 'custom_role_guard', mode, decision: mode === 'enforce' ? 'denied' : 'would_deny',
      reason: entry.roleMissing ? 'role_missing' : 'grant_insufficient', rule: d.rule, required: d.required, needs: d.label,
      role, customRoleId: entry.customRoleId, method, route: path, user: { userId, tenantId: user.tenantId, schoolSlug: user.schoolSlug },
    }));
    if (mode === 'enforce') throw new ForbiddenException(`Access denied. Your role does not have ${d.required} access to ${d.label}.`);
    return true;
  }
}
