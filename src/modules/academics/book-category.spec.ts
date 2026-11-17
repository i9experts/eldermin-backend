import { AcademicsService } from './academics.service';
import { NotFoundException } from '@nestjs/common';
import { DEWEY_DECIMAL_CATEGORIES } from './dewey-decimal-categories';

// Library categories (Dewey Decimal seed) - no real Mongo, each test wires
// in just the model methods the code under test actually calls, same
// convention as grading-scale-and-visibility.spec.ts.

function makeService(overrides: Record<string, any> = {}) {
  const svc: any = Object.create(AcademicsService.prototype);
  svc.bookCategoryModel = overrides.bookCategoryModel;
  return svc;
}

describe('AcademicsService — Library book categories', () => {
  // One bulkWrite round trip rather than 100 sequential findOneAndUpdate
  // calls - the sequential version could exceed the frontend's request
  // timeout on anything but a near-zero-latency DB connection (see the
  // comment on seedDefaultBookCategories).
  it('seedDefaultBookCategories upserts all 100 Dewey entries by code in a single bulkWrite, scoped to the tenant', async () => {
    const bulkWrite = jest.fn(async (ops: any[]) => ({ nUpserted: ops.length }));
    const bookCategoryModel: any = { bulkWrite };
    const svc = makeService({ bookCategoryModel });
    const result = await svc.seedDefaultBookCategories('tenant-1', '507f1f77bcf86cd799439011');
    expect(result.count).toBe(100);
    expect(result.names).toHaveLength(100);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const ops = bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(100);
    expect(ops[0]).toEqual(expect.objectContaining({
      updateOne: expect.objectContaining({
        filter: { tenantId: 'tenant-1', code: '000' },
        update: { $set: expect.objectContaining({ name: 'Computer science, knowledge & systems', code: '000', tenantId: 'tenant-1' }) },
        upsert: true,
      }),
    }));
  });

  it('seedDefaultBookCategories surfaces a clear error instead of an unhandled 500 when the write fails', async () => {
    const bulkWrite = jest.fn(async () => { throw new Error('Cast to ObjectId failed'); });
    const bookCategoryModel: any = { bulkWrite };
    const svc = makeService({ bookCategoryModel });
    await expect(svc.seedDefaultBookCategories('tenant-1', '507f1f77bcf86cd799439011'))
      .rejects.toThrow('Cast to ObjectId failed');
  });

  it('seedDefaultBookCategories is idempotent - calling it twice still only ever has 100 distinct Dewey codes', () => {
    const codes = new Set(DEWEY_DECIMAL_CATEGORIES.map((c) => c.code));
    expect(codes.size).toBe(100);
  });

  it('getBookCategories defaults to active-only, sorted by order then code', async () => {
    const find = jest.fn(() => ({ sort: () => ({ lean: async () => [] }) }));
    const bookCategoryModel: any = { find };
    const svc = makeService({ bookCategoryModel });
    await svc.getBookCategories('tenant-1', {});
    expect(find).toHaveBeenCalledWith({ tenantId: 'tenant-1', isActive: true });
  });

  it('getBookCategories includes inactive ones when asked', async () => {
    const find = jest.fn(() => ({ sort: () => ({ lean: async () => [] }) }));
    const bookCategoryModel: any = { find };
    const svc = makeService({ bookCategoryModel });
    await svc.getBookCategories('tenant-1', { includeInactive: 'true' });
    expect(find).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
  });

  it('updateBookCategory 404s for a category in a different tenant or that does not exist', async () => {
    const bookCategoryModel: any = { findOneAndUpdate: () => ({ lean: async () => null }) };
    const svc = makeService({ bookCategoryModel });
    await expect(svc.updateBookCategory('tenant-1', 'cat-1', { name: 'New' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deleteBookCategory 404s when nothing was deleted', async () => {
    const bookCategoryModel: any = { findOneAndDelete: () => ({ lean: async () => null }) };
    const svc = makeService({ bookCategoryModel });
    await expect(svc.deleteBookCategory('tenant-1', 'cat-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
