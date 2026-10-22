import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { UsageLogDocument } from '../../super-admin/schemas/super-admin.schema';

const logger = new Logger('UsageLog');

/**
 * Records one login event against today's per-institution UsageLog
 * snapshot (upsert + $inc, so N logins in a day accumulate into
 * dailyLogins:N rather than overwriting each other or creating N
 * documents - the unique (institutionSlug, date) index already on this
 * schema is what makes the upsert safe).
 *
 * Deliberately never allowed to fail a login: awaited so the increment
 * is deterministic (useful for tests and for not losing an event to an
 * in-flight process exit), but any error is logged and swallowed here
 * rather than propagated into the caller's auth response path.
 */
export async function recordLoginUsage(
  usageLogModel: Model<UsageLogDocument>,
  institutionSlug: string | null | undefined,
): Promise<void> {
  if (!institutionSlug) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  try {
    await usageLogModel.findOneAndUpdate(
      { institutionSlug, date: today },
      { $inc: { dailyLogins: 1 }, $setOnInsert: { institutionSlug, date: today } },
      { upsert: true },
    );
  } catch (err: any) {
    logger.warn(`Failed to record login usage for ${institutionSlug}: ${err?.message}`);
  }
}
