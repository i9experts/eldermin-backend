import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../organization/schemas/user.schema';
import { Tenant, TenantDocument } from '../organization/schemas/tenant.schema';
import { AuditLog, AuditLogDocument } from '../../compliance/schemas/compliance.schema';
import { CriticalAuditService } from '../../common/critical-audit.service';
import { idForms } from '../../common/utils/id-forms.util';
import { UserRole } from '../../auth/roles.enum';

export type DeactivationOutcome = 'deactivated' | 'demoted' | 'already' | 'no_user' | 'protected' | 'not_staff';
export type ReactivationOutcome = 'reactivated' | 'noop' | 'no_user';

export interface AccessActor { userId?: string; name?: string; schoolSlug?: string }

/** Staff statuses that revoke a login (S1 decision 5). on_leave / probation do not. */
export const REVOKING_STAFF_STATUSES = ['resigned', 'terminated', 'suspended'];
export function staffRevokesAccess(status?: string | null, isActive?: boolean | null): boolean {
  return (!!status && REVOKING_STAFF_STATUSES.includes(status)) || isActive === false;
}

/** Roles that are never touched by a staff-removal path (would lock a school out or are not staff logins). */
const PROTECTED_ROLES = new Set<string>([UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER]);
const NOT_STAFF_ROLES = new Set<string>([UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT]);

/**
 * ONE place that removes (or restores) a staff member's login. Every removal
 * path calls deactivateStaffLogin; reactivation goes through
 * reactivateStaffLogin. Existing JWTs stay valid until S3 (token versioning).
 *
 * deactivateStaffLogin (idempotent, atomic: the update is conditional, so two
 * concurrent callers - e.g. two app instances running the exit cron - change
 * the document once; the second reports 'already'):
 *  - NOT shared: User.isActive=false, deactivatedAt/By/Reason set, pending
 *    reset token cleared.
 *  - SHARED staff+guardian/student account (guardianOfStudentIds non-empty or
 *    linkedStudentId set): the account stays ACTIVE and keeps guardian access.
 *    Removed: primaryRole -> 'parent' (old value kept in previousPrimaryRole),
 *    customRoleId -> null (old value in previousCustomRoleId), pending reset
 *    token cleared; staffAccessRevokedAt/deactivatedBy/deactivationReason set.
 *    Kept: guardianOfStudentIds, linkedStudentId, phone, email, tenant links,
 *    Staff.userId pointer (needed to restore). Staff-derived token scope
 *    (campus, department, class-teacher, clusters) disappears because login
 *    ignores Staff rows with isActive=false (auth.service resolveScopeFieldsForUser).
 *  - owner / super_admin accounts are never touched ('protected').
 * Audit: best-effort (a removal must never be blocked by the audit store).
 *
 * reactivateStaffLogin restores access and is FAIL-CLOSED audited
 * (CriticalAuditService): isActive=true, deactivation fields cleared and, for a
 * demoted account, primaryRole/customRoleId restored from the saved values.
 */
@Injectable()
export class AccountAccessService {
  private readonly logger = new Logger(AccountAccessService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
    private criticalAudit: CriticalAuditService,
  ) {}

  private async schoolSlugFor(user: any, actor?: AccessActor): Promise<string | undefined> {
    if (actor?.schoolSlug) return actor.schoolSlug;
    if (!user?.tenantId) return undefined;
    try {
      const t: any = await this.tenantModel.findOne({ _id: idForms(user.tenantId) }).select('slug').lean();
      return t?.slug;
    } catch { return undefined; }
  }

  private async auditBestEffort(user: any, actor: AccessActor | undefined, entry: { action: string; reason: string; before: any; after: any }) {
    try {
      const schoolSlug = await this.schoolSlugFor(user, actor);
      if (!schoolSlug) { this.logger.warn(`Account access audit skipped: no school for user ${user?._id}`); return; }
      await this.auditModel.create({
        schoolSlug, action: entry.action, module: 'Account Access', resourceType: 'User', resourceId: String(user._id),
        performedBy: actor?.name || actor?.userId || 'system', performedById: actor?.userId,
        oldValue: JSON.stringify(entry.before), newValue: JSON.stringify({ ...entry.after, reason: entry.reason }),
        type: 'update', outcome: 'applied',
      });
    } catch (err) {
      this.logger.error(`Account access audit write failed (change already applied): ${(err as Error)?.message}`);
    }
  }

  async deactivateStaffLogin(userId: any, reason: string, actorId?: string, actor?: AccessActor): Promise<{ outcome: DeactivationOutcome }> {
    if (!userId) return { outcome: 'no_user' };
    const user: any = await this.userModel.findOne({ _id: userId }).select('primaryRole isActive tenantId guardianOfStudentIds linkedStudentId staffAccessRevokedAt customRoleId').lean();
    if (!user) return { outcome: 'no_user' };
    if (PROTECTED_ROLES.has(user.primaryRole)) return { outcome: 'protected' };
    if (NOT_STAFF_ROLES.has(user.primaryRole)) return { outcome: 'not_staff' };

    const now = new Date();
    const act = { ...(actor || {}), userId: actor?.userId ?? actorId };
    const shared = (user.guardianOfStudentIds?.length || 0) > 0 || !!user.linkedStudentId;
    const unsetReset = { $unset: ['resetPasswordTokenHash', 'resetPasswordExpires'] };
    const byFields = actorId ? { deactivatedBy: { $literal: actorId } } : {};

    if (shared) {
      const r = await this.userModel.updateOne(
        { _id: user._id, staffAccessRevokedAt: { $exists: false }, primaryRole: { $nin: ['parent', 'student'] } },
        [
          { $set: { previousPrimaryRole: '$primaryRole', previousCustomRoleId: { $ifNull: ['$customRoleId', null] }, primaryRole: 'parent', customRoleId: null, staffAccessRevokedAt: now, deactivationReason: { $literal: reason }, ...byFields } },
          unsetReset as any,
        ],
      );
      if (!r.modifiedCount) return { outcome: 'already' };
      await this.auditBestEffort(user, act, { action: 'Demote shared login to parent', reason, before: { primaryRole: user.primaryRole, customRoleId: user.customRoleId ?? null }, after: { primaryRole: 'parent', customRoleId: null, isActive: true } });
      return { outcome: 'demoted' };
    }

    const r = await this.userModel.updateOne(
      { _id: user._id, isActive: { $ne: false } },
      [{ $set: { isActive: false, deactivatedAt: now, deactivationReason: { $literal: reason }, ...byFields } }, unsetReset as any],
    );
    if (!r.modifiedCount) return { outcome: 'already' };
    await this.auditBestEffort(user, act, { action: 'Deactivate login', reason, before: { isActive: true }, after: { isActive: false } });
    return { outcome: 'deactivated' };
  }

  async reactivateStaffLogin(userId: any, reason: string, actorId: string, actor?: AccessActor): Promise<{ outcome: ReactivationOutcome }> {
    if (!userId) return { outcome: 'no_user' };
    const user: any = await this.userModel.findOne({ _id: userId }).select('primaryRole isActive tenantId staffAccessRevokedAt previousPrimaryRole previousCustomRoleId deactivatedAt deactivationReason customRoleId').lean();
    if (!user) return { outcome: 'no_user' };
    if (user.isActive !== false && !user.staffAccessRevokedAt) return { outcome: 'noop' };

    const schoolSlug = await this.schoolSlugFor(user, actor);
    const before = { isActive: user.isActive, primaryRole: user.primaryRole, customRoleId: user.customRoleId ?? null, deactivatedAt: user.deactivatedAt, deactivationReason: user.deactivationReason, staffAccessRevokedAt: user.staffAccessRevokedAt };
    let outcome: ReactivationOutcome = 'noop';
    await this.criticalAudit.run(
      { schoolSlug: schoolSlug as string, userId: actorId, name: actor?.name },
      { module: 'Account Access', action: 'Reactivate login', type: 'update', resourceType: 'User', resourceId: String(user._id), requested: { reason, restoresRole: user.previousPrimaryRole ?? null } },
      async () => before,
      async () => {
        const demoted = !!user.staffAccessRevokedAt;
        const r = await this.userModel.updateOne(
          { _id: user._id, $or: [{ isActive: false }, { staffAccessRevokedAt: { $exists: true } }] },
          [
            { $set: {
              isActive: true,
              ...(demoted ? { primaryRole: { $ifNull: ['$previousPrimaryRole', '$primaryRole'] }, customRoleId: { $ifNull: ['$previousCustomRoleId', null] } } : {}),
            } },
            { $unset: ['deactivatedAt', 'deactivatedBy', 'deactivationReason', 'staffAccessRevokedAt', 'previousPrimaryRole', 'previousCustomRoleId'] } as any,
          ],
        );
        outcome = r.modifiedCount ? 'reactivated' : 'noop';
        return { outcome, reason };
      },
    );
    return { outcome };
  }
}
