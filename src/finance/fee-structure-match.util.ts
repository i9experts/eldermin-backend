// Pure, framework-free helper for FinanceService.generateInvoices' auto-match
// fallback (when a student has no explicit StudentFeeAssignment) - kept
// dependency-free (like fee-assignment.util.ts / invoice-adjustment.util.ts)
// so the matching logic is directly unit-testable without mocking Mongoose
// models.

export interface FeeStructureLike {
  _id: unknown;
  grade?: string | null;
  section?: string | null;
  campus?: string | null;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
  createdAt?: Date | string | null;
}

/**
 * Whether a fee structure's effective window covers the given billing
 * month anchor. No effectiveFrom set is treated as "always been in force"
 * (matches structures created before this field existed); no effectiveTo
 * means "still in force".
 */
export function feeStructureCoversMonth(fs: FeeStructureLike, billingMonthAnchor: Date): boolean {
  const from = fs.effectiveFrom ? new Date(fs.effectiveFrom) : null;
  const to = fs.effectiveTo ? new Date(fs.effectiveTo) : null;
  if (from && from > billingMonthAnchor) return false;
  if (to && to < billingMonthAnchor) return false;
  return true;
}

/**
 * A class's fee structure is a single current-state catalog, not
 * something that bills additively across every structure a school ever
 * created for that grade/section - so when more than one active structure
 * matches the same grade/section/campus for a given billing month (a data
 * hygiene issue: an old or superseded structure never got its effectiveTo
 * set, or several "special discount" variants were each saved as a new
 * structure instead of edits to one), the single MOST SPECIFIC one wins,
 * same "most specific match wins" principle already used for tuition-fee
 * lookup in students.service.ts. Ties broken by the most recently
 * effective (or most recently created) structure, since a newer
 * assignment is the one the school most likely intended to be current.
 *
 * Returns every remaining tie so the caller can decide how loudly to warn
 * (a genuine unresolved tie - two structures with identical specificity
 * and no effectiveFrom to break it - is itself worth surfacing).
 */
export function pickApplicableFeeStructures<T extends FeeStructureLike>(
  candidates: T[],
  billingMonthAnchor: Date,
): T[] {
  const inWindow = candidates.filter(fs => feeStructureCoversMonth(fs, billingMonthAnchor));
  if (inWindow.length <= 1) return inWindow;

  const specificity = (fs: FeeStructureLike) => (fs.section ? 1 : 0) + (fs.campus ? 1 : 0);
  const maxSpecificity = Math.max(...inWindow.map(specificity));
  const mostSpecific = inWindow.filter(fs => specificity(fs) === maxSpecificity);
  if (mostSpecific.length <= 1) return mostSpecific;

  const recency = (fs: FeeStructureLike) => {
    const d = fs.effectiveFrom ?? fs.createdAt;
    return d ? new Date(d).getTime() : 0;
  };
  const maxRecency = Math.max(...mostSpecific.map(recency));
  return mostSpecific.filter(fs => recency(fs) === maxRecency);
}
