// Pure, framework-free helper for FinanceService.updateInvoice's manual
// adjustment-line arithmetic - kept dependency-free (like
// fee-assignment.util.ts) so the totals math is directly unit-testable
// without mocking Mongoose models/documents.

export interface InvoiceLineLike {
  amount: number;
  discount?: number;
}

export interface AdjustmentInput {
  description: string;
  amount: number;
  reason?: string;
}

/**
 * Builds the InvoiceLineItem-shaped object for a manual adjustment
 * (late-fee waiver, correction, etc). Always additive - never mutates or
 * removes an existing line - and tagged with feeStructureId: null /
 * feeHead: 'adjustment' so it's distinguishable from a fee-matched line.
 */
export function buildAdjustmentLine(adjustment: AdjustmentInput): {
  description: string; amount: number; discount: number; netAmount: number;
  feeStructureId: null; feeHead: string;
} {
  const amount = Number(adjustment.amount);
  if (!adjustment.description) throw new Error('adjustment.description is required');
  if (!amount || Number.isNaN(amount)) throw new Error('adjustment.amount must be a non-zero number');

  return {
    description: adjustment.reason ? `${adjustment.description} (${adjustment.reason})` : adjustment.description,
    amount,
    discount: 0,
    netAmount: amount,
    feeStructureId: null,
    feeHead: 'adjustment',
  };
}

/**
 * Recomputes an invoice's subtotal/totalDiscount/totalAmount/balanceDue/
 * status from its (already-updated) items array, exactly the same
 * arithmetic createInvoice uses. A negative adjustment (a waiver) nets out
 * of the total; a positive one (a correction) adds to it. paidAmount is
 * never touched here - only re-derived against.
 */
export function recomputeInvoiceTotals(
  items: InvoiceLineLike[],
  totalTax: number,
  paidAmount: number,
): { subtotal: number; totalDiscount: number; totalAmount: number; balanceDue: number; status: 'paid' | 'partial' | null } {
  const subtotal = items.reduce((a, i) => a + i.amount, 0);
  const totalDiscount = items.reduce((a, i) => a + (i.discount || 0), 0);
  const totalAmount = Math.round((subtotal - totalDiscount + (totalTax || 0)) * 100) / 100;
  const rawBalance = totalAmount - (paidAmount || 0);
  const balanceDue = Math.max(0, rawBalance);
  const status = rawBalance <= 0 ? 'paid' : (paidAmount > 0 ? 'partial' : null);
  return { subtotal, totalDiscount, totalAmount, balanceDue, status };
}
