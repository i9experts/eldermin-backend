import { ProcurementReportsService } from './procurement-reports.service';

// The Procurement Summary report's totalSpend/pendingPayments/category and
// vendor breakdowns counted every Purchase Order regardless of status - a
// draft nobody has approved yet, or a PO cancelled via the Reverse PO flow,
// both still contributed to "Total Spend". The Requisition Status report
// elsewhere in this same file already tracks cancelled as its own distinct
// bucket, confirming the convention this was simply missing. totalPOs
// (a document count, not a spend figure) deliberately still counts every PO
// regardless of status.

function makeService(overrides: Record<number, any>) {
  const params: any[] = new Array(11).fill({});
  for (const [idx, val] of Object.entries(overrides)) params[Number(idx)] = val;
  return new (ProcurementReportsService as any)(...params);
}

const PR_IDX = 1;
const PO_IDX = 2;
const VENDOR_IDX = 0;

describe('ProcurementReportsService.getProcurementSummaryData', () => {
  it('excludes draft and cancelled POs from totalSpend, pendingPayments, byCategory and byVendor, but not from totalPOs', async () => {
    const poAggregatePipelines: any[][] = [];
    const poModel: any = {
      countDocuments: () => Promise.resolve(7),
      aggregate: (pipeline: any[]) => { poAggregatePipelines.push(pipeline); return Promise.resolve([]); },
    };
    const prModel: any = { countDocuments: () => Promise.resolve(0) };
    const vendorModel: any = { countDocuments: () => Promise.resolve(0) };
    const svc = makeService({ [PO_IDX]: poModel, [PR_IDX]: prModel, [VENDOR_IDX]: vendorModel });

    const result = await svc.getProcurementSummaryData('demo-school', {});

    expect(result.totalPOs).toBe(7);
    // totalSpendAgg, pendingPaymentsAgg, byCategory, byVendor, in that order.
    expect(poAggregatePipelines).toHaveLength(4);
    for (const pipeline of poAggregatePipelines) {
      expect(pipeline[0].$match.status).toEqual({ $nin: ['draft', 'cancelled'] });
    }
  });
});
