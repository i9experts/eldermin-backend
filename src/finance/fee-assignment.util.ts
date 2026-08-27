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
