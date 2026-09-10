// Pure, framework-free fine-calculation formula shared by
// AcademicsService.returnBook and the library defaulters report, so both
// compute the exact same number and can never drift out of sync with each
// other. Previously this was inlined in returnBook with a
// client-suppliable `finePerDay` (a trust/authority smell) and no grace
// period or cap - now it's server-side-only, driven entirely by the
// school's own LibrarySettings. Kept dependency-free for direct unit
// testing, same rationale as subject-reference.util.ts.

export interface LibraryFinePolicy {
  finePerDay: number;
  gracePeriodDays: number;
  // 0 is a sentinel meaning "no cap" - see LibrarySettings.maxFineCap.
  maxFineCap: number;
}

export interface LibraryFineResult {
  overdueDays: number;
  fineAmount: number;
}

/**
 * `asOf` is the day the fine is being computed as of (return day, or
 * "now" for a still-outstanding overdue issue in a report). Days overdue
 * before the grace period are never fined; the grace period is subtracted
 * from raw days-late, never from the fine amount itself.
 */
export function computeLibraryFine(dueDate: Date, asOf: Date, policy: LibraryFinePolicy): LibraryFineResult {
  const rawOverdueDays = asOf > dueDate
    ? Math.ceil((asOf.getTime() - dueDate.getTime()) / 86_400_000)
    : 0;
  const overdueDays = Math.max(0, rawOverdueDays - (policy.gracePeriodDays || 0));
  let fineAmount = overdueDays * (policy.finePerDay || 0);
  if (policy.maxFineCap > 0) {
    fineAmount = Math.min(fineAmount, policy.maxFineCap);
  }
  return { overdueDays, fineAmount };
}
