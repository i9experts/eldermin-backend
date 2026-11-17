import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceService } from './finance.service';

// Regression coverage for the Finance → Payables "Add Invoice" three-way-match
// upgrade: invoiceNumber/paymentTerms now actually persist (previously
// silently dropped by the frontend AND unsupported by the schema), vendor
// master linkage, duplicate-invoice-number rejection, and Due Date
// auto-calculation from the selected Payment Term.

function makeService(overrides: Record<number, any>) {
  const params: any[] = new Array(38).fill({});
  for (const [idx, val] of Object.entries(overrides)) params[Number(idx)] = val;
  return new (FinanceService as any)(...params);
}

const EXPENSE_IDX = 4;
const BANK_IDX = 6;
const COST_CENTER_IDX = 12;
const PAYMENT_TERM_IDX = 13;
const VENDOR_IDX = 15;
const WITHHOLDING_IDX = 21;

function makeExpenseModel(existing: any[] = []) {
  function Model(this: any, data: any) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  }
  (Model as any).findOne = jest.fn((query: any) => {
    const match = existing.find(e =>
      e.schoolSlug === query.schoolSlug && String(e.vendorId) === String(query.vendorId) && e.invoiceNumber === query.invoiceNumber,
    );
    return Promise.resolve(match || null);
  });
  return Model as any;
}

describe('FinanceService.createExpense — three-way-match upgrade', () => {
  const VENDOR_ID = 'vendor-1';
  const vendor = { _id: VENDOR_ID, name: 'Acme Supplies', paymentTermId: 'term-net30', withholdingCategoryId: null };

  it('rejects a duplicate invoice number for the same vendor', async () => {
    const existing = [{ schoolSlug: 'demo-school', vendorId: VENDOR_ID, invoiceNumber: 'INV-2025-0050', expenseNo: 'EXP-202511-1234' }];
    const svc = makeService({
      [EXPENSE_IDX]: makeExpenseModel(existing),
      [VENDOR_IDX]: { findOne: jest.fn().mockResolvedValue(vendor) },
      [PAYMENT_TERM_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [WITHHOLDING_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [COST_CENTER_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [BANK_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      (svc as any).createExpense({
        schoolSlug: 'demo-school', vendorId: VENDOR_ID, invoiceNumber: 'INV-2025-0050',
        amount: 5000, title: 'Stationery', category: 'Stationery',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows the same invoice number for two different vendors', async () => {
    const existing = [{ schoolSlug: 'demo-school', vendorId: 'other-vendor', invoiceNumber: 'INV-2025-0050' }];
    const svc = makeService({
      [EXPENSE_IDX]: makeExpenseModel(existing),
      [VENDOR_IDX]: { findOne: jest.fn().mockResolvedValue(vendor) },
      [PAYMENT_TERM_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [WITHHOLDING_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [COST_CENTER_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [BANK_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
    });

    const exp = await (svc as any).createExpense({
      schoolSlug: 'demo-school', vendorId: VENDOR_ID, invoiceNumber: 'INV-2025-0050',
      amount: 5000, title: 'Stationery', category: 'Stationery',
    });
    expect(exp.invoiceNumber).toBe('INV-2025-0050');
  });

  it('throws if the selected vendor does not exist', async () => {
    const svc = makeService({
      [EXPENSE_IDX]: makeExpenseModel(),
      [VENDOR_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      (svc as any).createExpense({ schoolSlug: 'demo-school', vendorId: 'missing-vendor', amount: 100, title: 'x', category: 'Other' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('auto-calculates Due Date from the Invoice Date + the selected Payment Term when no dueDate is given', async () => {
    const svc = makeService({
      [EXPENSE_IDX]: makeExpenseModel(),
      [VENDOR_IDX]: { findOne: jest.fn().mockResolvedValue(vendor) },
      [PAYMENT_TERM_IDX]: { findOne: jest.fn().mockResolvedValue({ _id: 'term-net30', name: 'Net 30', dueDays: 30 }) },
      [WITHHOLDING_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [COST_CENTER_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [BANK_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
    });

    const exp = await (svc as any).createExpense({
      schoolSlug: 'demo-school', vendorId: VENDOR_ID, paymentTermId: 'term-net30',
      date: '2026-01-01', amount: 1000, title: 'Services', category: 'Services',
    });
    expect(exp.paymentTermName).toBe('Net 30');
    expect(new Date(exp.dueDate).toISOString().slice(0, 10)).toBe('2026-01-31');
  });

  it('falls back to the vendor default Payment Term when the invoice did not pick one', async () => {
    const paymentTermFindOne = jest.fn().mockResolvedValue({ _id: 'term-net30', name: 'Net 30', dueDays: 30 });
    const svc = makeService({
      [EXPENSE_IDX]: makeExpenseModel(),
      [VENDOR_IDX]: { findOne: jest.fn().mockResolvedValue(vendor) }, // vendor.paymentTermId = 'term-net30'
      [PAYMENT_TERM_IDX]: { findOne: paymentTermFindOne },
      [WITHHOLDING_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [COST_CENTER_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [BANK_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
    });

    await (svc as any).createExpense({
      schoolSlug: 'demo-school', vendorId: VENDOR_ID, date: '2026-01-01', amount: 1000, title: 'Services', category: 'Services',
    });
    expect(paymentTermFindOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'term-net30' }));
  });

  it('does not override an explicit manual Due Date even when a Payment Term is also selected', async () => {
    const svc = makeService({
      [EXPENSE_IDX]: makeExpenseModel(),
      [VENDOR_IDX]: { findOne: jest.fn().mockResolvedValue(vendor) },
      [PAYMENT_TERM_IDX]: { findOne: jest.fn().mockResolvedValue({ _id: 'term-net30', name: 'Net 30', dueDays: 30 }) },
      [WITHHOLDING_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [COST_CENTER_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [BANK_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
    });

    const exp = await (svc as any).createExpense({
      schoolSlug: 'demo-school', vendorId: VENDOR_ID, paymentTermId: 'term-net30', dueDate: '2026-02-15',
      date: '2026-01-01', amount: 1000, title: 'Services', category: 'Services',
    });
    expect(new Date(exp.dueDate).toISOString().slice(0, 10)).toBe('2026-02-15');
  });

  it('computes a withholding-tax preview from the vendor withholding category, capped at the invoice amount', async () => {
    const vendorWithWithholding = { ...vendor, withholdingCategoryId: 'wh-cat-1' };
    const svc = makeService({
      [EXPENSE_IDX]: makeExpenseModel(),
      [VENDOR_IDX]: { findOne: jest.fn().mockResolvedValue(vendorWithWithholding) },
      [PAYMENT_TERM_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [WITHHOLDING_IDX]: { findOne: jest.fn().mockResolvedValue({ _id: 'wh-cat-1', name: 'Services WHT', rate: 4, accountCode: '2200', isActive: true }) },
      [COST_CENTER_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [BANK_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
    });

    const exp = await (svc as any).createExpense({
      schoolSlug: 'demo-school', vendorId: VENDOR_ID, amount: 10000, title: 'Consulting', category: 'Services',
    });
    expect(exp.withholdingAmount).toBe(400); // 4% of 10,000
  });

  it('ignores the Status field from the create form — new expenses always start submitted', async () => {
    const svc = makeService({
      [EXPENSE_IDX]: makeExpenseModel(),
      [VENDOR_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [PAYMENT_TERM_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [WITHHOLDING_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [COST_CENTER_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
      [BANK_IDX]: { findOne: jest.fn().mockResolvedValue(null) },
    });

    const exp = await (svc as any).createExpense({
      schoolSlug: 'demo-school', status: 'paid', amount: 100, title: 'Misc', category: 'Other',
    });
    expect(exp.status).toBe('submitted');
  });
});
