// Pure, framework-free helper for item 36 — "discount not appearing on
// voucher/challan" turned out to have a real root cause: a discount/
// scholarship (DiscountProgram/FeeAssignment) assigned to a student AFTER
// their challan for the month was already generated never got applied,
// because generateInvoices' idempotency check ("this student already has an
// invoice this month") skipped them outright with no explanation. The admin
// would assign the discount, click "Generate Challan" again expecting it to
// pick it up, and silently get the same old undiscounted invoice back.
//
// The fix (see FinanceService.generateInvoices) is to allow ONE narrow
// exception to that idempotency skip: resync an existing invoice's
// discount/items when nothing has been collected against it yet. This file
// isolates the pure "is this invoice eligible to be resynced?" decision so
// it's directly unit-testable without a Mongoose model.

export interface ResyncCandidateInvoice {
  paidAmount?: number;
  status?: string;
}

/**
 * An invoice may have its discount resynced (see generateInvoices) only
 * when NOTHING has been collected against it yet - never an invoice with
 * any payment history, matching the repo-wide convention of reversing
 * instead of mutating anything already posted/paid. `partial` and `paid`
 * are excluded explicitly (not just via paidAmount) because a payment
 * could in principle be recorded with a $0 amount by a future caller -
 * status is the authoritative signal, paidAmount is the belt-and-braces
 * second check.
 */
export function canResyncInvoiceDiscount(invoice: ResyncCandidateInvoice): boolean {
  if (!invoice) return false;
  if ((invoice.paidAmount || 0) !== 0) return false;
  if (invoice.status === 'paid' || invoice.status === 'partial') return false;
  return true;
}

/**
 * Whether a freshly-computed total discount actually differs from what's
 * already stored on the invoice - resync should be a genuine no-op when
 * nothing changed, not a needless ledger reversal+repost on every
 * "Generate Challan" click. Compares to the nearest paisa/cent to avoid
 * floating-point noise flagging a "change" that isn't one.
 */
export function discountActuallyChanged(freshTotalDiscount: number, existingTotalDiscount: number): boolean {
  const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
  return round2(freshTotalDiscount) !== round2(existingTotalDiscount);
}
