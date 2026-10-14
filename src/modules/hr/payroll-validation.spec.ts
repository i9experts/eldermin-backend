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
});
