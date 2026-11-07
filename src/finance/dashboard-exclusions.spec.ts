import { FinanceService } from './finance.service';

// Finance Dashboard's "Total Invoiced" summed every invoice regardless of
// status - a draft nobody has sent to a parent yet, or an invoice explicitly
// cancelled/waived, still counted as real invoiced revenue, inflating the
// headline figure and the Fee Collection Rate derived from it elsewhere
// (e.g. the main Home dashboard). Separately, Payment has no academicYear
// of its own, so "Total Collected"/"collectedThisMonth" could never be
// scoped by the dashboard's academic-year filter the way every other figure
// on this same screen already was - switching years changed what was
// invoiced/outstanding but left collected as an all-time sum.

function makeService(overrides: Record<number, any>) {
  const params: any[] = new Array(38).fill({});
  for (const [idx, val] of Object.entries(overrides)) params[Number(idx)] = val;
  return new (FinanceService as any)(...params);
}

const INVOICE_IDX = 2;
const PAYMENT_IDX = 3;
const EXPENSE_IDX = 4;
const BANK_IDX = 6;

function chainArr(result: any[] = []) {
  return { sort: () => ({ limit: () => ({ select: () => Promise.resolve(result) }) }) };
}

describe('FinanceService.getDashboard — status/year-scoped money figures', () => {
  it('excludes draft/cancelled/waived invoices from Total Invoiced', async () => {
    const pipelines: any[][] = [];
    const invoiceModel: any = {
      aggregate: (pipeline: any[]) => { pipelines.push(pipeline); return Promise.resolve([]); },
      countDocuments: () => Promise.resolve(0),
    };
    const paymentModel: any = {
      aggregate: () => Promise.resolve([]),
      find: () => chainArr([]),
    };
    const expenseModel: any = { aggregate: () => Promise.resolve([]) };
    const bankModel: any = { find: () => ({ select: () => Promise.resolve([]) }) };
    const svc = makeService({ [INVOICE_IDX]: invoiceModel, [PAYMENT_IDX]: paymentModel, [EXPENSE_IDX]: expenseModel, [BANK_IDX]: bankModel });

    await svc.getDashboard('demo-school');

    const totalInvoicedPipeline = pipelines[0];
    expect(totalInvoicedPipeline[0].$match.status).toEqual({ $nin: ['draft', 'cancelled', 'waived'] });
  });

  it('joins Payment to its Invoice and filters by academicYear when one is selected, for both Total Collected and collectedThisMonth', async () => {
    const paymentPipelines: any[][] = [];
    const invoiceModel: any = { aggregate: () => Promise.resolve([]), countDocuments: () => Promise.resolve(0) };
    const paymentModel: any = {
      aggregate: (pipeline: any[]) => { paymentPipelines.push(pipeline); return Promise.resolve([]); },
      find: () => chainArr([]),
    };
    const expenseModel: any = { aggregate: () => Promise.resolve([]) };
    const bankModel: any = { find: () => ({ select: () => Promise.resolve([]) }) };
    const svc = makeService({ [INVOICE_IDX]: invoiceModel, [PAYMENT_IDX]: paymentModel, [EXPENSE_IDX]: expenseModel, [BANK_IDX]: bankModel });

    await svc.getDashboard('demo-school', '2026-27');

    // totalCollected, then collectedThisMonth, in that declared order.
    expect(paymentPipelines).toHaveLength(2);
    for (const pipeline of paymentPipelines) {
      expect(pipeline).toEqual(expect.arrayContaining([
        { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'invoice' } },
        { $unwind: '$invoice' },
        { $match: { 'invoice.academicYear': '2026-27' } },
      ]));
    }
  });

  it('does not join to Invoice at all when no academicYear is selected ("All Years")', async () => {
    const paymentPipelines: any[][] = [];
    const invoiceModel: any = { aggregate: () => Promise.resolve([]), countDocuments: () => Promise.resolve(0) };
    const paymentModel: any = {
      aggregate: (pipeline: any[]) => { paymentPipelines.push(pipeline); return Promise.resolve([]); },
      find: () => chainArr([]),
    };
    const expenseModel: any = { aggregate: () => Promise.resolve([]) };
    const bankModel: any = { find: () => ({ select: () => Promise.resolve([]) }) };
    const svc = makeService({ [INVOICE_IDX]: invoiceModel, [PAYMENT_IDX]: paymentModel, [EXPENSE_IDX]: expenseModel, [BANK_IDX]: bankModel });

    await svc.getDashboard('demo-school');

    for (const pipeline of paymentPipelines) {
      expect(pipeline.some((s: any) => s.$lookup)).toBe(false);
    }
  });
});
