import { canResyncInvoiceDiscount, discountActuallyChanged } from './discount-resync.util';

describe('canResyncInvoiceDiscount', () => {
  it('allows resync for an untouched, unpaid invoice', () => {
    expect(canResyncInvoiceDiscount({ paidAmount: 0, status: 'sent' })).toBe(true);
  });

  it('allows resync for an overdue invoice with nothing collected', () => {
    expect(canResyncInvoiceDiscount({ paidAmount: 0, status: 'overdue' })).toBe(true);
  });

  it('refuses a fully paid invoice', () => {
    expect(canResyncInvoiceDiscount({ paidAmount: 5000, status: 'paid' })).toBe(false);
  });

  it('refuses a partially paid invoice even if status lags behind', () => {
    expect(canResyncInvoiceDiscount({ paidAmount: 1000, status: 'sent' })).toBe(false);
  });

  it('refuses when status says partial even if paidAmount is somehow 0', () => {
    expect(canResyncInvoiceDiscount({ paidAmount: 0, status: 'partial' })).toBe(false);
  });

  it('refuses when status says paid even if paidAmount is somehow 0', () => {
    expect(canResyncInvoiceDiscount({ paidAmount: 0, status: 'paid' })).toBe(false);
  });

  it('is false for a missing invoice', () => {
    expect(canResyncInvoiceDiscount(undefined as any)).toBe(false);
  });
});

describe('discountActuallyChanged', () => {
  it('is false when the amounts match exactly', () => {
    expect(discountActuallyChanged(500, 500)).toBe(false);
  });

  it('is false for floating-point noise under a paisa', () => {
    expect(discountActuallyChanged(500.001, 500)).toBe(false);
  });

  it('is true when a new discount was actually assigned', () => {
    expect(discountActuallyChanged(750, 500)).toBe(true);
  });

  it('treats undefined/missing existing discount as 0', () => {
    expect(discountActuallyChanged(300, undefined as any)).toBe(true);
    expect(discountActuallyChanged(0, undefined as any)).toBe(false);
  });
});
