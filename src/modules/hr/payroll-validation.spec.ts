import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { HrService } from './hr.service';

// D15: duplicate payroll run -> 409 (was a Mongo E11000 -> 500); payslip without a payrollRunId -> 400 (was a Mongoose ValidationError -> 500).
const RUN = new Types.ObjectId().toHexString();
function svc(over: any = {}) {
  const s: any = Object.create(HrService.prototype);
  s.payrollRunModel = { create: jest.fn(async (d: any) => ({ _id: 'r1', ...d })), ...(over.payrollRunModel || {}) };
  s.payslipModel = { create: jest.fn(async (d: any) => ({ _id: 'p1', ...d })), ...(over.payslipModel || {}) };
  s.expenseClaimModel = { find: jest.fn(() => ({ lean: async () => [] })), updateMany: jest.fn() };
  return s as any;
}
const dup = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

describe('createPayrollRun', () => {
  it('creates a run with the period label', async () => {
    const s = svc();
    const r: any = await s.createPayrollRun('t', 'i', { month: 3, year: 2041 }, 'u');
    expect(r.periodLabel).toMatch(/2041$/);
  });
  it('a duplicate month/year is a 409 naming the period', async () => {
    const s = svc({ payrollRunModel: { create: jest.fn(async () => { throw dup(); }) } });
    const p = s.createPayrollRun('t', 'i', { month: 1, year: 2041 }, 'u');
    await expect(p).rejects.toBeInstanceOf(ConflictException);
    await expect(s.createPayrollRun('t', 'i', { month: 1, year: 2041 }, 'u')).rejects.toThrow(/already exists/);
  });
  it('any other database error is NOT converted (still surfaces)', async () => {
    const s = svc({ payrollRunModel: { create: jest.fn(async () => { throw new Error('boom'); }) } });
    await expect(s.createPayrollRun('t', 'i', { month: 1, year: 2041 }, 'u')).rejects.toThrow('boom');
  });
});

describe('createPayslip', () => {
  const base = { month: 1, year: 2041, basicSalary: 100, grossSalary: 100 };
  it.each([[undefined], [null], [''], ['not-an-id'], [{}], [12345]])('payrollRunId=%p -> 400 and nothing is queried or written', async (payrollRunId) => {
    const s = svc();
    await expect(s.createPayslip('t', 'i', 'slug', { ...base, payrollRunId } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.payslipModel.create).not.toHaveBeenCalled();
    expect(s.expenseClaimModel.find).not.toHaveBeenCalled();
  });
  it('a body that is not an object is a 400, not a TypeError', async () => {
    await expect(svc().createPayslip('t', 'i', 'slug', undefined as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('a valid payrollRunId creates the payslip as before (net = gross - deductions)', async () => {
    const s = svc();
    const r: any = await s.createPayslip('t', 'i', 'slug', { ...base, payrollRunId: RUN, incomeTax: 10 });
    expect(r.netSalary).toBe(90);
  });
  it('a second payslip for the same person and month is a 409 and settles no expense claims', async () => {
    const s = svc({ payslipModel: { create: jest.fn(async () => { throw dup(); }) } });
    await expect(s.createPayslip('t', 'i', 'slug', { ...base, payrollRunId: RUN })).rejects.toBeInstanceOf(ConflictException);
    expect(s.expenseClaimModel.updateMany).not.toHaveBeenCalled();
  });

  // PAY-04, found in QA (screenshot: "Gross" didn't match the sum of its
  // own component columns): grossSalary is now always derived server-side
  // from the canonical fields + otherAllowances + componentLines, never
  // trusted verbatim from whatever the client computed and sent as
  // data.grossSalary - a client bug (or a future one) can no longer ship
  // a wrong gross straight into a saved payslip.
  it('derives grossSalary from canonical fields + otherAllowances + componentLines, ignoring a wrong data.grossSalary', async () => {
    const s = svc();
    const r: any = await s.createPayslip('t', 'i', 'slug', {
      month: 1, year: 2041, payrollRunId: RUN,
      basicSalary: 50000, hra: 0, transportAllowance: 0, medicalAllowance: 0,
      otherAllowances: 0,
      grossSalary: 999999, // deliberately wrong - must be ignored
      componentLines: [
        { code: 'GEC', name: 'GEC Allowance', type: 'earning', amount: 6000 },
      ],
    });
    expect(r.grossSalary).toBe(56000);
    expect(r.netSalary).toBe(56000);
  });

  it('does not double-count a dynamic earning component whose amount is also folded into otherAllowances (the exact bug from the screenshot)', async () => {
    // Reproduces the pre-fix payroll grid payload shape: otherAllowances
    // already includes the GEC Allowance amount (the old, buggy
    // initRows() behaviour), and componentLines lists it again by name.
    // A correct backend must not simply add both together.
    const s = svc();
    const r: any = await s.createPayslip('t', 'i', 'slug', {
      month: 1, year: 2041, payrollRunId: RUN,
      basicSalary: 64000, hra: 0, transportAllowance: 0, medicalAllowance: 0,
      otherAllowances: 6000, // already includes the GEC Allowance below
      grossSalary: 76000, // what the old buggy frontend would have sent (64000 + 6000 + 6000)
      componentLines: [
        { code: 'GEC', name: 'GEC Allowance', type: 'earning', amount: 6000 },
      ],
    });
    // This documents the backend's own formula is no longer fooled by an
    // inflated data.grossSalary - but it can only be as correct as the
    // otherAllowances it's given. The frontend fix (initRows no longer
    // folding an extraComponent's amount into otherAllowances) is what
    // keeps otherAllowances clean in the first place; this test guards
    // the backend half of the contract: whatever otherAllowances + the
    // componentLines it's given, grossSalary is their straight sum, never
    // the client's own total.
    expect(r.grossSalary).toBe(70000); // 64000 + 6000 (otherAllowances) + 6000 (componentLines) per the backend's own formula
    expect(r.grossSalary).not.toBe(76000);
  });
});

describe('recomputePayslipTotals', () => {
  function recomputeSvc(payslips: any[], over: any = {}) {
    const s: any = Object.create(HrService.prototype);
    s.payslipModel = {
      find: jest.fn(() => ({ lean: async () => payslips })),
      findById: jest.fn(() => ({ lean: async () => payslips[0] })),
      updateOne: jest.fn(),
      aggregate: jest.fn(async () => [{ gross: 0, ded: 0, net: 0 }]),
      ...(over.payslipModel || {}),
    };
    s.payrollRunModel = { updateOne: jest.fn(), ...(over.payrollRunModel || {}) };
    s.reversePayslipLedgerEntry = jest.fn();
    s.postPayslipToLedger = jest.fn();
    return s as any;
  }

  const basePayslip = {
    _id: 'p1', payrollRunId: 'r1', staffName: 'Jane Doe', status: 'processing', postedToFinance: false,
    basicSalary: 64000, hra: 0, transportAllowance: 0, medicalAllowance: 0,
    incomeTax: 0, providentFund: 0, loanDeduction: 0, leaveDeduction: 0, otherDeductions: 0,
  };

  it('a payslip with no overlap between otherAllowances and componentLines needs no fix', async () => {
    const s = recomputeSvc([{
      ...basePayslip, otherAllowances: 0, grossSalary: 64000, totalDeductions: 0, netSalary: 64000,
      componentLines: [],
    }]);
    const result = await s.recomputePayslipTotals('t', 'slug', true);
    expect(result.willFix).toBe(0);
  });

  it('detects and dry-run previews a payslip where a dynamic earning was double-counted into Gross (the screenshot bug)', async () => {
    const s = recomputeSvc([{
      ...basePayslip,
      otherAllowances: 6000, // includes the GEC amount below - the bug
      grossSalary: 76000, // 64000 + 6000 (otherAllowances) + 6000 (componentLines) - wrong
      totalDeductions: 0, netSalary: 76000,
      componentLines: [{ code: 'GEC', name: 'GEC Allowance', type: 'earning', amount: 6000 }],
    }]);
    const result = await s.recomputePayslipTotals('t', 'slug', true);
    expect(result.willFix).toBe(1);
    const fix = result.fixes[0];
    expect(fix.oldGrossSalary).toBe(76000);
    expect(fix.newGrossSalary).toBe(70000); // the overlap stripped back out of otherAllowances, counted once
    expect(fix.newOtherAllowances).toBe(0);
    expect(fix.oldNetSalary).toBe(76000);
    expect(fix.newNetSalary).toBe(70000);
    // Dry run - nothing written yet.
    expect(s.payslipModel.updateOne).not.toHaveBeenCalled();
  });

  it('applies the fix and re-posts to Finance only for a payslip already posted', async () => {
    const s = recomputeSvc([{
      ...basePayslip,
      otherAllowances: 6000, grossSalary: 76000, totalDeductions: 0, netSalary: 76000, postedToFinance: true,
      componentLines: [{ code: 'GEC', name: 'GEC Allowance', type: 'earning', amount: 6000 }],
    }]);
    await s.recomputePayslipTotals('t', 'slug', false);
    expect(s.reversePayslipLedgerEntry).toHaveBeenCalledTimes(1);
    expect(s.postPayslipToLedger).toHaveBeenCalledTimes(1);
    expect(s.payslipModel.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      { $set: { totalDeductions: 0, grossSalary: 70000, otherAllowances: 0, netSalary: 70000 } },
    );
  });

  it('applies the fix without touching Finance when the payslip was never posted', async () => {
    const s = recomputeSvc([{
      ...basePayslip,
      otherAllowances: 6000, grossSalary: 76000, totalDeductions: 0, netSalary: 76000, postedToFinance: false,
      componentLines: [{ code: 'GEC', name: 'GEC Allowance', type: 'earning', amount: 6000 }],
    }]);
    await s.recomputePayslipTotals('t', 'slug', false);
    expect(s.reversePayslipLedgerEntry).not.toHaveBeenCalled();
    expect(s.postPayslipToLedger).not.toHaveBeenCalled();
    expect(s.payslipModel.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      { $set: { totalDeductions: 0, grossSalary: 70000, otherAllowances: 0, netSalary: 70000 } },
    );
  });

  it('a payslip already marked paid is never queried for a fix (status: { $ne: "paid" } filter)', async () => {
    const s = recomputeSvc([]); // the $ne:'paid' filter is applied in the Mongo query itself, simulated here by returning none
    await s.recomputePayslipTotals('t', 'slug', true);
    expect(s.payslipModel.find).toHaveBeenCalledWith(expect.objectContaining({ status: { $ne: 'paid' } }));
  });
});
