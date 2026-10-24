import { FinanceService } from './finance.service';

// Regression coverage for linking Finance Cost Centers to the real
// Institution Setup Department module, instead of Cost Centers only ever
// being seeded from Campuses (which left the Budgeting tab's Cost Centers
// list looking disconnected from the Departments screen admins actually use).

function makeFinanceService(overrides: Record<number, any>) {
  const params: any[] = new Array(39).fill({});
  for (const [idx, val] of Object.entries(overrides)) params[Number(idx)] = val;
  return new (FinanceService as any)(...params);
}

const COST_CENTER_IDX = 12;
const DEPARTMENT_IDX = 31;

describe('FinanceService.syncCostCentersFromDepartments', () => {
  it('upserts one cost center per active department, tagged type=department with a stable derived code', async () => {
    const departments = [
      { _id: 'd1', name: 'Administration', code: 'ACD-01', isActive: true },
      { _id: 'd2', name: 'Academics', code: 'ADM-01', isActive: true },
    ];
    const departmentModel = {
      find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(departments) }),
    };
    const bulkWrite = jest.fn().mockResolvedValue({});
    const costCenterModel = {
      bulkWrite,
      find: jest.fn().mockResolvedValue([]),
    };
    const svc = makeFinanceService({
      [DEPARTMENT_IDX]: departmentModel,
      [COST_CENTER_IDX]: costCenterModel,
    });

    await svc.syncCostCentersFromDepartments('demo-school');

    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const ops = bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops[0].updateOne.filter).toEqual({ schoolSlug: 'demo-school', code: 'CC-DEPT-ACD-01' });
    expect(ops[0].updateOne.update.$set).toMatchObject({
      name: 'Administration',
      type: 'department',
      departmentId: 'd1',
      isActive: true,
    });
    expect(ops[0].updateOne.upsert).toBe(true);
  });

  it('is idempotent — re-running with the same departments produces the same stable filter/code (no new codes minted)', async () => {
    const departments = [{ _id: 'd1', name: 'Administration', code: 'ACD-01', isActive: true }];
    const departmentModel = {
      find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(departments) }),
    };
    const bulkWrite = jest.fn().mockResolvedValue({});
    const costCenterModel = { bulkWrite, find: jest.fn().mockResolvedValue([]) };
    const svc = makeFinanceService({
      [DEPARTMENT_IDX]: departmentModel,
      [COST_CENTER_IDX]: costCenterModel,
    });

    await svc.syncCostCentersFromDepartments('demo-school');
    await svc.syncCostCentersFromDepartments('demo-school');

    const firstCode = bulkWrite.mock.calls[0][0][0].updateOne.filter.code;
    const secondCode = bulkWrite.mock.calls[1][0][0].updateOne.filter.code;
    expect(firstCode).toBe(secondCode);
  });

  it('skips the write entirely when there are no active departments', async () => {
    const departmentModel = { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) };
    const bulkWrite = jest.fn();
    const costCenterModel = { bulkWrite, find: jest.fn().mockResolvedValue([]) };
    const svc = makeFinanceService({
      [DEPARTMENT_IDX]: departmentModel,
      [COST_CENTER_IDX]: costCenterModel,
    });

    await svc.syncCostCentersFromDepartments('demo-school');
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});
