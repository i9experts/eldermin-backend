import { AdmissionsService } from './admissions.service';

// Regression test: getDashboardStats() (which backs both the Admissions
// Dashboard tab and the Reports tab — the Reports tab reuses the same
// dashboard query) counted ALL leads, including soft-deleted ones
// (isActive: false, set by the Delete Lead action), because its baseFilter
// never added `isActive: true` the way getLeadStats() already correctly did.

function makeCountable(result: number) {
  return { countDocuments: jest.fn(async (filter: any) => result), __filter: undefined as any };
}

function makeService(overrides: {
  leadCount?: number;
  leadAggregateResult?: any[];
} = {}) {
  const leadFilters: any[] = [];
  const leadModel: any = {
    countDocuments: jest.fn(async (filter: any) => {
      leadFilters.push(filter);
      return overrides.leadCount ?? 0;
    }),
    aggregate: jest.fn(async (pipeline: any[]) => {
      leadFilters.push(pipeline[0].$match);
      return overrides.leadAggregateResult ?? [];
    }),
  };
  const zeroModel: any = {
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
    find: jest.fn(() => ({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn(async () => []),
    })),
  };
  const svc = new AdmissionsService(
    leadModel, zeroModel, zeroModel, zeroModel, zeroModel, zeroModel, {} as any, {} as any,
  );
  return { svc, leadFilters, leadModel };
}

describe('AdmissionsService.getDashboardStats: excludes soft-deleted leads', () => {
  it('filters every lead-based query/aggregate by isActive: true', async () => {
    const { svc, leadFilters } = makeService({ leadCount: 3, leadAggregateResult: [] });

    await svc.getDashboardStats('my-school', '2026-27');

    expect(leadFilters.length).toBeGreaterThan(0);
    for (const filter of leadFilters) {
      expect(filter).toMatchObject({ schoolSlug: 'my-school', academicYear: '2026-27', isActive: true });
    }
  });

  it('does not count a soft-deleted lead toward totalLeads', async () => {
    // countDocuments is mocked to simulate the DB honoring the isActive
    // filter: if the filter is wrong (missing isActive: true), a real
    // Mongo query would still return the deleted lead; here we assert the
    // filter passed to countDocuments is the one that would exclude it.
    const { svc, leadModel } = makeService({ leadCount: 0 });

    const result = await svc.getDashboardStats('my-school');

    expect(result.stats.totalLeads).toBe(0);
    const [firstCall] = leadModel.countDocuments.mock.calls;
    expect(firstCall[0]).toMatchObject({ isActive: true });
  });
});
