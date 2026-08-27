import { buildAdjustmentLine, recomputeInvoiceTotals } from './invoice-adjustment.util';

describe('buildAdjustmentLine', () => {
  it('builds an additive, feeStructureId-null adjustment line for a correction (positive amount)', () => {
    const line = buildAdjustmentLine({ description: 'Late fee correction', amount: 500 });
    expect(line).toEqual({
      description: 'Late fee correction',
      amount: 500,
      discount: 0,
      netAmount: 500,
      feeStructureId: null,
      feeHead: 'adjustment',
    });
  });

  it('builds a negative-amount line for a waiver, folding the reason into the description', () => {
    const line = buildAdjustmentLine({ description: 'Late fee waiver', amount: -300, reason: 'hardship case' });
    expect(line.description).toBe('Late fee waiver (hardship case)');
    expect(line.amount).toBe(-300);
    expect(line.netAmount).toBe(-300);
  });

  it('rejects a missing description', () => {
    expect(() => buildAdjustmentLine({ description: '', amount: 100 })).toThrow(/description/);
  });

  it('rejects a zero or NaN amount', () => {
    expect(() => buildAdjustmentLine({ description: 'x', amount: 0 })).toThrow(/amount/);
    expect(() => buildAdjustmentLine({ description: 'x', amount: NaN })).toThrow(/amount/);
  });
});

describe('recomputeInvoiceTotals', () => {
  it('recomputes totals after appending a positive (correction) adjustment', () => {
    const items = [{ amount: 5000, discount: 0 }, { amount: 200, discount: 0 }];
    const totals = recomputeInvoiceTotals(items, 0, 0);
    expect(totals.subtotal).toBe(5200);
    expect(totals.totalAmount).toBe(5200);
    expect(totals.balanceDue).toBe(5200);
    expect(totals.status).toBeNull();
  });

  it('a negative (waiver) adjustment reduces the total and can fully zero out the balance', () => {
    const items = [{ amount: 5000, discount: 0 }, { amount: -5000, discount: 0 }];
    const totals = recomputeInvoiceTotals(items, 0, 0);
    expect(totals.totalAmount).toBe(0);
    expect(totals.balanceDue).toBe(0);
    expect(totals.status).toBe('paid');
  });

  it('marks status partial when some payment already exists and balance remains positive', () => {
    const items = [{ amount: 5000, discount: 0 }, { amount: 500, discount: 0 }];
    const totals = recomputeInvoiceTotals(items, 0, 2000);
    expect(totals.totalAmount).toBe(5500);
    expect(totals.balanceDue).toBe(3500);
    expect(totals.status).toBe('partial');
  });

  it('never returns a negative balanceDue even when paidAmount exceeds the new total', () => {
    const items = [{ amount: 1000, discount: 0 }];
    const totals = recomputeInvoiceTotals(items, 0, 5000);
    expect(totals.balanceDue).toBe(0);
    expect(totals.status).toBe('paid');
  });

  it('includes tax in the recomputed total', () => {
    const items = [{ amount: 1000, discount: 100 }];
    const totals = recomputeInvoiceTotals(items, 90, 0);
    expect(totals.totalDiscount).toBe(100);
    expect(totals.totalAmount).toBe(990);
  });
});
