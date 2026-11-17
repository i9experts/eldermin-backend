import { StudentsController } from './students.controller';
import { ForbiddenException } from '@nestjs/common';

// Pins the fix for "Student 360's Fee Ledger always shows 0 records and
// ₦0/₦0/₦0, for every student". Root cause: Student 360's Fees tab read
// GET /:id/fees/statement, which queried the Students module's own
// StudentFee collection - a collection nothing in the real fee-assignment
// flow (FeeStructure -> assignFeeStructure -> generateInvoices, all in
// src/finance/) ever wrote to. The real, populated fee data has always
// lived in Finance's Invoice/Payment collections, which Finance's own
// Receivables view already reads correctly. The fix: getFeeStatement and
// collectFee now delegate to FinanceService instead of the dead
// StudentFee path.

function makeController(financeOverrides: any = {}, serviceOverrides: any = {}) {
  const svc: any = { ...serviceOverrides };
  const finance: any = {
    getInvoices: jest.fn(async () => ({ data: [] })),
    recordPayment: jest.fn(async () => ({ _id: 'payment-1' })),
    diagnoseNoInvoices: jest.fn(async () => ({ reason: 'no_fee_structure_assigned', detail: 'No active Fee Structure matches this student.' })),
    ...financeOverrides,
  };
  return { ctrl: new StudentsController(svc, finance, { assertMayMark: async () => undefined } as any), svc, finance };
}

const reqOf = (user: any) => ({ user: { schoolSlug: 's', ...user }, headers: {} });

describe('getFeeStatement', () => {
  it('reads real invoices from FinanceService, scoped to the student', async () => {
    const invoices = [
      { _id: 'inv-1', invoiceNumber: 'INV-1', month: '2026-08', totalAmount: 15000, paidAmount: 5000, balanceDue: 10000, status: 'partial' },
      { _id: 'inv-2', invoiceNumber: 'INV-2', month: '2026-09', totalAmount: 15000, paidAmount: 15000, balanceDue: 0, status: 'paid' },
    ];
    const { ctrl, finance } = makeController({ getInvoices: jest.fn(async () => ({ data: invoices })) });

    const result = await ctrl.getFeeStatement('student-1', reqOf({ role: 'admin' }));

    expect(finance.getInvoices).toHaveBeenCalledWith('s', { studentId: 'student-1', limit: 1000 });
    expect(result.invoices).toBe(invoices);
    // Summed across BOTH invoices, not just the first — this is exactly
    // the kind of aggregation that used to silently show 0 for everyone.
    expect(result.summary).toEqual({ totalBilled: 30000, totalPaid: 20000, totalBalance: 10000 });
    expect(result.diagnosis).toBeNull();
  });

  // An empty ledger is ambiguous on its own - identical whether the student
  // genuinely owes nothing or was simply never billed. diagnosis explains
  // which, instead of a bare empty array leaving staff/parents guessing.
  it('includes a diagnosis explaining why, when the student genuinely has no invoices yet', async () => {
    const { ctrl, finance } = makeController();
    const result = await ctrl.getFeeStatement('student-1', reqOf({ role: 'admin' }));
    expect(result).toEqual({
      invoices: [], summary: { totalBilled: 0, totalPaid: 0, totalBalance: 0 },
      diagnosis: { reason: 'no_fee_structure_assigned', detail: 'No active Fee Structure matches this student.' },
    });
    expect(finance.diagnoseNoInvoices).toHaveBeenCalledWith('s', 'student-1');
  });

  it('does not bother computing a diagnosis when invoices were actually found', async () => {
    const invoices = [{ _id: 'inv-1', totalAmount: 1000, paidAmount: 0, balanceDue: 1000, status: 'sent' }];
    const { ctrl, finance } = makeController({ getInvoices: jest.fn(async () => ({ data: invoices })) });
    await ctrl.getFeeStatement('student-1', reqOf({ role: 'admin' }));
    expect(finance.diagnoseNoInvoices).not.toHaveBeenCalled();
  });

  it('still blocks a teacher caller from seeing financial data', async () => {
    const { ctrl, finance } = makeController();
    await expect(ctrl.getFeeStatement('student-1', reqOf({ role: 'teacher' }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(finance.getInvoices).not.toHaveBeenCalled();
  });
});

describe('collectFee', () => {
  it('delegates to FinanceService.recordPayment against the real invoice', async () => {
    const { ctrl, finance } = makeController();
    const dto = { paidAmount: 5000, paymentMethod: 'cash', receiptNumber: 'manual-1', remarks: 'partial payment' };

    await ctrl.collectFee('inv-1', dto as any, reqOf({ role: 'admin', name: 'Front Desk' }));

    expect(finance.recordPayment).toHaveBeenCalledWith('inv-1', 's', {
      amount: 5000,
      paymentMethod: 'cash',
      transactionId: 'manual-1',
      chequeNumber: undefined,
      notes: 'partial payment',
      collectedBy: 'Front Desk',
    });
  });

  it('blocks a teacher from recording a payment', async () => {
    const { ctrl, finance } = makeController();
    await expect(ctrl.collectFee('inv-1', { paidAmount: 100 } as any, reqOf({ role: 'teacher' }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(finance.recordPayment).not.toHaveBeenCalled();
  });
});
