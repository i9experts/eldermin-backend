// Pure helpers for Data Privacy (GDPR) records - split out so the actual
// computation logic (date math, pluralization) has a small unit-testable
// surface, same rationale as pr-number.util.ts/asset-tag.util.ts.

// The standard GDPR statutory response window for a Data Subject Access
// Request (Article 12(3)): one calendar month, treated here as a fixed
// 30 days for simple, predictable due-date math.
export const DSAR_RESPONSE_WINDOW_DAYS = 30;

/** Computes a DSAR's due date as dateReceived + 30 days. */
export function computeDsarDueDate(dateReceived: Date): Date {
  const due = new Date(dateReceived.getTime());
  due.setDate(due.getDate() + DSAR_RESPONSE_WINDOW_DAYS);
  return due;
}

/** Whether a DSAR is overdue: past its due date and not yet in a final state. */
export function isDsarOverdue(dueDate: Date, status: string, now: Date = new Date()): boolean {
  if (status === 'completed' || status === 'rejected') return false;
  return now.getTime() > dueDate.getTime();
}

/** Human label for a retention period, e.g. (7, 'years') -> "7 years". */
export function formatRetentionPeriod(value: number, unit: 'days' | 'months' | 'years'): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`formatRetentionPeriod: value must be a positive number, got ${value}`);
  }
  const label = value === 1 ? unit.slice(0, -1) : unit;
  return `${value} ${label}`;
}
