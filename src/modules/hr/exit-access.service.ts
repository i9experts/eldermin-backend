import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExitRecord, ExitRecordDocument } from './schemas/exit-record.schema';
import { Staff, StaffDocument } from './schemas/staff.schema';
import { Tenant, TenantDocument } from '../organization/schemas/tenant.schema';
import { School, SchoolDocument } from '../../organization/schemas/organization.schema';
import { AccountAccessService } from '../auth/account-access.service';
import { idForms } from '../../common/utils/id-forms.util';
import { DEFAULT_TIMEZONE, lastWorkingDayEndsAt, validTimezone } from '../../common/utils/zoned-day.util';

/** Exit type -> the Staff.status it ends in (both revoke the login). */
export const EXIT_TYPE_TO_STATUS: Record<string, 'resigned' | 'terminated'> = {
  resignation: 'resigned', retirement: 'resigned', contract_end: 'resigned', mutual_agreement: 'resigned',
  termination: 'terminated', abandonment: 'terminated', death: 'terminated',
};

export interface ExitActor { userId?: string; name?: string; schoolSlug?: string }

/**
 * Offboarding (S1). An ExitRecord used to change nothing on Staff or User. Now:
 *  - AUTOMATIC: an hourly job revokes access when the record's lastWorkingDay
 *    has ENDED in the tenant's time zone (School.timezone for the tenant's
 *    slug, organization settings, default Asia/Karachi; an invalid value falls
 *    back to the default). lastWorkingDay is a date-only value stored at UTC
 *    midnight; its calendar date is used.
 *  - MANUAL: POST /hr/exit/:id/complete does the same immediately.
 * Scheduling follows the codebase's existing pattern (@Cron on a service +
 * an in-process re-entrancy flag, e.g. school-calendar.service.ts). Multi
 * instance / pm2 safety does not depend on that flag: each record is CLAIMED
 * with an atomic findOneAndUpdate on ExitRecord.accessRevokedAt, so two
 * concurrent runs (or the manual action racing the job) process a record once;
 * the claim is released if applying it fails, so the next run retries. The
 * deactivation itself is idempotent too. A processed record is never revisited,
 * so reactivating someone later is not undone by the job.
 */
@Injectable()
export class ExitAccessService {
  private readonly logger = new Logger(ExitAccessService.name);
  private inFlight = false;

  constructor(
    @InjectModel(ExitRecord.name) private exitModel: Model<ExitRecordDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    private accountAccess: AccountAccessService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runDueExits() {
    if (this.inFlight) { this.logger.warn('runDueExits: previous run still in progress, skipping this tick'); return; }
    this.inFlight = true;
    try {
      const r = await this.processDueExits(new Date());
      if (r.processed || r.failed) this.logger.log(`Exit access run: ${JSON.stringify(r)}`);
    } catch (err) {
      this.logger.error(`Exit access run failed: ${(err as Error)?.message}`);
    } finally {
      this.inFlight = false;
    }
  }

  private async timezoneForTenant(tenantId: any, cache: Map<string, string>): Promise<string> {
    const key = String(tenantId);
    if (cache.has(key)) return cache.get(key)!;
    let tz = DEFAULT_TIMEZONE;
    try {
      const t: any = await this.tenantModel.findOne({ _id: idForms(tenantId) }).select('slug').lean();
      if (t?.slug) {
        const s: any = await this.schoolModel.findOne({ slug: t.slug }).select('timezone').lean();
        tz = validTimezone(s?.timezone);
      }
    } catch (err) {
      this.logger.warn(`timezone lookup failed for tenant ${key}, using ${DEFAULT_TIMEZONE}: ${(err as Error)?.message}`);
    }
    cache.set(key, tz);
    return tz;
  }

  /** Revokes access for every unprocessed exit whose last working day has ended (in its tenant's zone) at `now`. */
  async processDueExits(now: Date): Promise<{ processed: number; skipped: number; failed: number }> {
    // Cheap pre-filter (any zone is within +-14h of UTC); the exact check is per tenant zone below.
    const candidates: any[] = await this.exitModel
      .find({ accessRevokedAt: { $exists: false }, lastWorkingDay: { $lt: new Date(now.getTime() + 2 * 86400000) } })
      .limit(1000).lean();
    const tzCache = new Map<string, string>();
    let processed = 0, skipped = 0, failed = 0;
    for (const rec of candidates) {
      const tz = await this.timezoneForTenant(rec.tenantId, tzCache);
      if (now.getTime() < lastWorkingDayEndsAt(rec.lastWorkingDay, tz)) { skipped++; continue; }
      try {
        const done = await this.applyExit(rec, { name: 'system: exit cron' }, now);
        done ? processed++ : skipped++;
      } catch (err) {
        failed++;
        this.logger.error(`Exit ${rec._id}: applying access revocation failed (will retry next run): ${(err as Error)?.message}`);
      }
    }
    return { processed, skipped, failed };
  }

  /** Claim the record atomically, then end the staff member's employment record + login. Returns false when someone else already did. */
  private async applyExit(rec: any, actor: ExitActor, now: Date): Promise<boolean> {
    const claimed = await this.exitModel.findOneAndUpdate(
      { _id: rec._id, accessRevokedAt: { $exists: false } },
      { $set: { accessRevokedAt: now, accessRevokedBy: actor.userId || actor.name || 'system' } },
      { new: true },
    ).lean();
    if (!claimed) return false;
    try {
      const staff: any = await this.staffModel.findOne({ _id: idForms(rec.staffId), tenantId: idForms(rec.tenantId) }).lean();
      if (staff) {
        const status = EXIT_TYPE_TO_STATUS[rec.exitType] || 'terminated';
        // 'suspended' / already-terminated staff keep their status; anyone else moves to the exit status.
        const keep = staff.isActive === false && ['resigned', 'terminated', 'suspended'].includes(staff.status);
        if (!keep) await this.staffModel.updateOne({ _id: staff._id }, { $set: { status, isActive: false } });
        if (staff.userId) await this.accountAccess.deactivateStaffLogin(staff.userId, `exit_${rec.exitType}_last_working_day`, actor.userId, actor);
      }
      return true;
    } catch (err) {
      // release the claim so the next run (or another instance) retries
      await this.exitModel.updateOne({ _id: rec._id }, { $unset: { accessRevokedAt: '', accessRevokedBy: '' } });
      throw err;
    }
  }

  /** Manual 'Complete exit now' (HR admin set): same effect as the job, immediately, regardless of date. */
  async completeExit(tenantId: string, exitId: string, actor: ExitActor) {
    const rec: any = await this.exitModel.findOne({ _id: exitId, tenantId: idForms(tenantId) }).lean();
    if (!rec) throw new NotFoundException('Exit record not found');
    if (rec.staffId && actor.userId) {
      const staff: any = await this.staffModel.findOne({ _id: idForms(rec.staffId), tenantId: idForms(tenantId) }).select('userId').lean();
      if (staff?.userId && String(staff.userId) === String(actor.userId)) {
        throw new BadRequestException('You cannot complete your own exit.');
      }
    }
    const done = await this.applyExit(rec, actor, new Date());
    return { exitId: String(rec._id), accessRevoked: done, alreadyProcessed: !done };
  }
}
