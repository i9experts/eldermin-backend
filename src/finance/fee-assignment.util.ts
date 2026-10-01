// Pure, framework-free helpers for FinanceService's student fee-structure
// assignment logic (see FEE-01/FEE-02) - kept dependency-free so the actual
// date-overlap arithmetic (the part most likely to have an off-by-one bug)
// is directly unit-testable without mocking Mongoose models.

/**
 * Whether two date ranges [aFrom, aTo] and [bFrom, bTo] overlap at all. A
 * null end date means "open-ended / still in force". Ranges that merely
 * touch at a single day (one starts exactly when the other ends) DO count
 * as overlapping - a fee structure assignment effective "until March 31"
 * and another effective "from March 31" would otherwise both try to bill
 * the same day.
 */
export function dateRangesOverlap(
  aFrom: Date, aTo: Date | null | undefined,
  bFrom: Date, bTo: Date | null | undefined,
): boolean {
  const FAR_FUTURE = new Date('9999-12-31');
  const aEnd = aTo ?? FAR_FUTURE;
  const bEnd = bTo ?? FAR_FUTURE;
  return aFrom <= bEnd && bFrom <= aEnd;
}

/**
 * Given a student's currently-active assignments and a proposed new one,
 * returns the subset that would conflict (overlap in time) with it. An
 * empty result means the new assignment can be created outright; a
 * non-empty result is what the caller uses to either block (ask the user
 * to confirm replacing them) or, once confirmed, deactivate before
 * creating the new one.
 */
export function findConflictingAssignments<T extends { effectiveFrom: Date | string; effectiveTo?: Date | string | null }>(
  existing: T[],
  proposedFrom: Date,
  proposedTo: Date | null,
): T[] {
  return existing.filter(a => dateRangesOverlap(
    proposedFrom, proposedTo,
    new Date(a.effectiveFrom), a.effectiveTo ? new Date(a.effectiveTo) : null,
  ));
}

/**
 * Case/whitespace-insensitive comparison of two fee structures' fee-head
 * names. A date-overlapping assignment is only a genuine double-billing
 * risk if it would actually bill the same fee head twice - many schools
 * deliberately stack several structures on one student (e.g. a "Monthly
 * Tuition Fee" structure plus a separate "August & Annual Fee" structure
 * covering completely different heads), and that's a legitimate, additive
 * assignment, not a conflict. Returns the shared head names (empty = no
 * overlap, safe to assign alongside each other).
 */
export function feeHeadsOverlap(headsA: string[], headsB: string[]): string[] {
  const normalize = (h: string) => h.trim().toLowerCase();
  const setA = new Set(headsA.map(normalize));
  const shared = new Set<string>();
  for (const h of headsB) {
    const key = normalize(h);
    if (setA.has(key) && key) shared.add(key);
  }
  // Return original-cased labels (from headsB) for display, not the
  // lowercased comparison keys.
  return headsB.filter(h => shared.has(normalize(h)));
}
