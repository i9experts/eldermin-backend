import { FinanceService } from './finance.service';

// Regression coverage for the Finance → Budgeting overhaul: an expense
// tagged with a Cost Center now correctly contributes to
// computeBudgetVsActual once paid (fixing getCostCenterReport's debit/credit
// netting, which previously cancelled a paid expense's own two journal legs
// against each other and always produced actual = 0), plus the new
// transactions drill-down and the budget approve flow.

function makeService(overrides: Record<number, any>) {
  const params: any[] = new Array(38).fill({});
  for (const [idx, val] of Object.entries(overrides)) params[Number(idx)] = val;
  return new (FinanceService as any)(...params);
}

const COA_IDX = 0;
const EXPENSE_IDX = 4;
const BUDGET_IDX = 5;
const COST_CENTER_IDX = 12;
const JOURNAL_IDX = 14;

const ACCOUNTS = [
  { code: '5000', type: 'expense' }, // Maintenance expense
  { code: '1000', type: 'asset' },   // Cash/Bank
];

function makeCoaModel() {
  return { find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(ACCOUNTS) })) };
}

describe('FinanceService — Budget ↔ Cost Center linking', () => {
  describe('getCostCenterReport (account-type-aware netting)', () => {
    it('does not cancel a paid expense against itself when both legs share a costCenterName', async () => {
      // A single paid expense posts two legs under the same cost center:
      // a debit to the expense account and a credit to the cash account.
      const journalModel = {
        aggregate: jest.fn().mockResolvedValue([
          { _id: { costCenterName: 'Main Campus', accountCode: '5000' }, debit: 1000, credit: 0 },
          { _id: { costCenterName: 'Main Campus', accountCode: '1000' }, debit: 0, credit: 1000 },
        ]),
      };
      const svc = makeService({ [JOURNAL_IDX]: journalModel, [COA_IDX]: makeCoaModel() });
      const report = await (svc as any).getCostCenterReport('demo-school');
      expect(report).toHaveLength(1);
      expect(report[0].costCenterName).toBe('Main Campus');
      // Only the expense-type leg counts toward actual spend — not net 0.
      expect(report[0].net).toBe(1000);
    });
  });

  describe('computeBudgetVsActual', () => {
    it('reflects a paid, cost-center-tagged expense as actual spend against the matching budget line', async () => {
      const journalModel = {
        aggregate: jest.fn().mockResolvedValue([
          { _id: { costCenterName: 'Main Campus', accountCode: '5000' }, debit: 1500, credit: 0 },
          { _id: { costCenterName: 'Main Campus', accountCode: '1000' }, debit: 0, credit: 1500 },
        ]),
      };
      const costCenterModel = {
        findOne: jest.fn().mockReturnValue({ name: 'Main Campus' }),
      };
      const svc = makeService({
        [JOURNAL_IDX]: journalModel,
        [COA_IDX]: makeCoaModel(),
        [COST_CENTER_IDX]: costCenterModel,
      });
      const budget: any = {
        academicYear: '2025-26',
        departmentId: null,
        campusId: null,
        lines: [{ category: 'Maintenance', allocatedAmount: 5000, costCenterId: 'cc1' }],
      };
      const result = await svc.computeBudgetVsActual('demo-school', budget);
      expect(result.lines[0].actualAmount).toBe(1500);
      expect(result.lines[0].variance).toBe(3500);
      expect(result.totalActual).toBe(1500);
      expect(result.totalUtilizationPct).toBe(30);
    });
  });

  describe('getBudgetTransactions (drill-down)', () => {
    it('returns the posted expense-leg lines matching the budget cost center', async () => {
      const costCenterModel = { findOne: jest.fn().mockReturnValue({ name: 'Main Campus' }) };
      const entries = [
        {
          date: new Date('2026-01-15'), narration: 'Expense EXP-202601-1234 — Generator repair',
          sourceType: 'expense', sourceId: 'exp1', reference: 'EXP-202601-1234',
          lines: [
            { accountCode: '5000', debit: 1500, credit: 0, costCenterName: 'Main Campus', partnerName: 'ACME Repairs' },
            { accountCode: '1000', debit: 0, credit: 1500, costCenterName: 'Main Campus', partnerName: 'ACME Repairs' },
          ],
        },
      ];
      const journalModel = {
        find: jest.fn(() => ({ sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(entries) })) })),
      };
      const budgetModel = {
        findOne: jest.fn().mockResolvedValue({
          _id: 'b1', academicYear: '2025-26', departmentId: null, campusId: null,
          lines: [{ category: 'Maintenance', allocatedAmount: 5000, costCenterId: 'cc1' }],
        }),
      };
      const svc = makeService({
        [JOURNAL_IDX]: journalModel,
        [COA_IDX]: makeCoaModel(),
        [COST_CENTER_IDX]: costCenterModel,
        [BUDGET_IDX]: budgetModel,
      });
      const rows = await svc.getBudgetTransactions('demo-school', 'b1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        description: 'Expense EXP-202601-1234 — Generator repair',
        amount: 1500,
        paidTo: 'ACME Repairs',
        costCenterName: 'Main Campus',
      });
    });

    it('throws NotFoundException for an unknown budget', async () => {
      const budgetModel = { findOne: jest.fn().mockResolvedValue(null) };
      const svc = makeService({ [BUDGET_IDX]: budgetModel });
      await expect(svc.getBudgetTransactions('demo-school', 'missing')).rejects.toThrow('Budget not found');
    });
  });

  describe('approveBudget', () => {
    it('sets status to approved and stamps the approver', async () => {
      const budgetModel = {
        findOneAndUpdate: jest.fn().mockResolvedValue({ _id: 'b1', status: 'approved', approvedBy: 'Admin' }),
      };
      const svc = makeService({ [BUDGET_IDX]: budgetModel });
      const result = await svc.approveBudget('b1', 'demo-school', 'Admin');
      expect(budgetModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'b1', schoolSlug: 'demo-school' },
        { $set: { status: 'approved', approvedBy: 'Admin' } },
        { new: true },
      );
      expect(result.status).toBe('approved');
    });
  });

  describe('createExpense with a Cost Center', () => {
    it('denormalizes costCenterName from the selected Cost Center id', async () => {
      const costCenterModel = { findOne: jest.fn().mockResolvedValue({ name: 'Main Campus' }) };
      const saved: any = {};
      function FakeExpenseModel(this: any, data: any) {
        Object.assign(this, data);
        this.save = jest.fn().mockImplementation(() => Promise.resolve(this));
      }
      const svc = makeService({
        [EXPENSE_IDX]: FakeExpenseModel,
        [COST_CENTER_IDX]: costCenterModel,
      });
      const result = await svc.createExpense({
        schoolSlug: 'demo-school', title: 'Generator repair', category: 'Maintenance',
        amount: 1500, date: '2026-01-15', costCenterId: 'cc1',
      });
      expect(costCenterModel.findOne).toHaveBeenCalledWith({ _id: 'cc1', schoolSlug: 'demo-school' });
      expect((result as any).costCenterName).toBe('Main Campus');
    });
  });
});
