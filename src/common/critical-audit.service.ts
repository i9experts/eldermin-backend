import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from '../compliance/schemas/compliance.schema';
import { toAuditString } from './audit-mask.util';

export interface AuditActor {
  schoolSlug: string;
  userId?: string;
  name?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditMeta {
  module: string;            // e.g. 'HR: Payroll', 'Roles'
  action: string;            // e.g. 'Update payslip'
  type: 'create' | 'update' | 'delete' | 'other';
  resourceType?: string;
  resourceId?: string;
  resourceTitle?: string;
  /** What the caller asked for (masked). Stored as newValue until the real result is known. */
  requested?: any;
}

/**
 * FAIL-CLOSED audit for payroll and role writes.
 *
 * Mongo transactions need a replica set and the deployment is not known to
 * have one, so this does NOT rely on them. Sequence:
 *   1. read the "before" state (failure aborts: nothing changed)
 *   2. write the audit entry FIRST with outcome 'pending' (before + requested
 *      change). If this write fails the change is NOT attempted and the caller
 *      gets 503. => no payroll/role change can exist without a durable record.
 *   3. run the change. If it throws, the entry is marked 'failed' (best
 *      effort) and the error is rethrown.
 *   4. on success mark 'applied' and store the real "after" (best effort,
 *      error logged; the pending record with before + requested change
 *      already exists).
 * TODO(replica set): if production is confirmed to be a MongoDB replica set,
 * move steps 2-4 (audit entry + change) into ONE session.withTransaction so
 * the guarantee becomes atomic (no 'pending' limbo). Until the deployment is
 * known, keep this pending-entry design.
 * Residual risk: a crash between 2 and 4 leaves a 'pending' entry for a change
 * that may or may not have applied; reviewers should treat 'pending' as
 * "unknown, check the record".
 */
@Injectable()
export class CriticalAuditService {
  private readonly logger = new Logger(CriticalAuditService.name);

  constructor(@InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>) {}

  async run<T>(actor: AuditActor, meta: AuditMeta, loadBefore: () => Promise<any>, mutate: () => Promise<T>): Promise<T> {
    if (!actor?.schoolSlug) {
      // Cannot attribute the change to a school: refuse rather than apply it unaudited.
      throw new ServiceUnavailableException('Change not applied: no school context for the audit trail.');
    }
    let before: any = null;
    try {
      before = await loadBefore();
    } catch (err) {
      this.logger.error(`Audit pre-read failed for ${meta.module}/${meta.action}: ${(err as Error)?.message}`);
      throw new ServiceUnavailableException('Change not applied: could not read the current state for the audit trail.');
    }

    let entry: any;
    try {
      entry = await this.auditModel.create({
        schoolSlug: actor.schoolSlug,
        action: meta.action,
        module: meta.module,
        resourceType: meta.resourceType,
        resourceId: meta.resourceId,
        resourceTitle: meta.resourceTitle,
        performedBy: actor.name || actor.userId || 'Unknown',
        performedById: actor.userId,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        oldValue: toAuditString(before),
        newValue: toAuditString(meta.requested),
        type: meta.type,
        outcome: 'pending',
      });
    } catch (err) {
      this.logger.error(`Audit write failed, change NOT applied (${meta.module}/${meta.action}): ${(err as Error)?.message}`);
      throw new ServiceUnavailableException('Change not applied: the audit log is unavailable. Please try again.');
    }

    let result: T;
    try {
      result = await mutate();
    } catch (err) {
      await this.finish(entry, { outcome: 'failed', newValue: toAuditString({ error: (err as Error)?.message }) });
      throw err;
    }
    const after: any = result as any;
    await this.finish(entry, {
      outcome: 'applied',
      newValue: toAuditString(after === undefined ? meta.requested : after),
      ...(meta.resourceId ? {} : after?._id ? { resourceId: String(after._id) } : {}),
    });
    return result;
  }

  private async finish(entry: any, patch: Record<string, any>) {
    try {
      await this.auditModel.updateOne({ _id: entry._id }, { $set: patch });
    } catch (err) {
      this.logger.error(`Audit entry ${entry?._id} could not be finalised (${patch.outcome}): ${(err as Error)?.message}`);
    }
  }
}
