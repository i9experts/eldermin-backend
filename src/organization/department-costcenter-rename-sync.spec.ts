import { OrganizationService } from './organization.service';

// Regression coverage for Department rename syncing onto any Finance Cost
// Center linked to it (via CostCenter.departmentId) — Budget/Expense/Journal
// cost-center matching is done by name, so a stale name after a Department
// rename would silently break that matching without this propagation.

function makeService(overrides: Record<number, any>) {
  const params: any[] = new Array(17).fill({});
  for (const [idx, val] of Object.entries(overrides)) params[Number(idx)] = val;
  return new (OrganizationService as any)(...params);
}

const DEPT_IDX = 4;
const COST_CENTER_IDX = 14;

describe('OrganizationService.updateDepartment — linked Cost Center name sync', () => {
  it('pushes the new name onto any Cost Center linked to the renamed department', async () => {
    const updatedDept = { _id: 'd1', schoolSlug: 'demo-school', name: 'Student Affairs' };
    const deptModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue(updatedDept),
    };
    const updateMany = jest.fn().mockReturnValue({ catch: () => Promise.resolve() });
    const costCenterModel = { updateMany };

    const service = makeService({ [DEPT_IDX]: deptModel, [COST_CENTER_IDX]: costCenterModel });
    const result = await service.updateDepartment('d1', 'demo-school', { name: 'Student Affairs' });

    expect(result).toBe(updatedDept);
    expect(updateMany).toHaveBeenCalledWith(
      { schoolSlug: 'demo-school', departmentId: 'd1' },
      { $set: { name: 'Student Affairs' } },
    );
  });

  it('does not touch Cost Centers when the update does not change the name', async () => {
    const updatedDept = { _id: 'd1', schoolSlug: 'demo-school', name: 'Student Affairs' };
    const deptModel = { findOneAndUpdate: jest.fn().mockResolvedValue(updatedDept) };
    const updateMany = jest.fn();
    const costCenterModel = { updateMany };

    const service = makeService({ [DEPT_IDX]: deptModel, [COST_CENTER_IDX]: costCenterModel });
    await service.updateDepartment('d1', 'demo-school', { campusId: 'c2' });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not throw when the department being updated does not exist', async () => {
    const deptModel = { findOneAndUpdate: jest.fn().mockResolvedValue(null) };
    const updateMany = jest.fn();
    const costCenterModel = { updateMany };

    const service = makeService({ [DEPT_IDX]: deptModel, [COST_CENTER_IDX]: costCenterModel });
    const result = await service.updateDepartment('missing', 'demo-school', { name: 'X' });

    expect(result).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
