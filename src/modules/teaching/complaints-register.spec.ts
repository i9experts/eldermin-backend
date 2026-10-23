import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';

// Unit tests for the Complaints Register additions on top of the
// existing BehaviourNote collection: createBehaviourNote's default
// status, updateBehaviourNote's resolved-at/-by auto-stamping, and the
// new listComplaints() paginated/filterable list. Same lightweight
// hand-rolled-fake approach as this file's sibling specs.

function makeService(records: any[]) {
  const behaviourModel: any = {
    find: jest.fn().mockImplementation((filter: any) => ({
      sort: () => ({
        skip: (n: number) => ({
          limit: (l: number) => ({
            lean: () => Promise.resolve(applyFilter(records, filter).slice(n, n + l)),
          }),
        }),
      }),
    })),
    countDocuments: jest.fn().mockImplementation((filter: any) => Promise.resolve(applyFilter(records, filter).length)),
    create: jest.fn((doc: any) => Promise.resolve({ ...doc, _id: new Types.ObjectId() })),
    findOneAndUpdate: jest.fn().mockImplementation((query: any, update: any) => {
      const rec = records.find((r) => String(r._id) === String(query._id));
      const merged = { ...rec, ...update.$set };
      return { lean: () => Promise.resolve(merged) };
    }),
    findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) }),
  };

  function applyFilter(all: any[], filter: any) {
    return all.filter((r) => {
      if (filter.status && r.status !== filter.status) return false;
      if (filter.category && r.category !== filter.category) return false;
      return true;
    });
  }

  const noop: any = {};
  const service = new TeachingService(
    noop, noop, noop, noop, noop, noop, noop,
    behaviourModel,
    noop, noop, noop, noop, noop, noop, noop, noop, noop,
  );
  return { service, behaviourModel };
}

describe('Complaints Register (BehaviourNote additions)', () => {
  const institutionId = new Types.ObjectId().toString();

  it('createBehaviourNote defaults status to "open" when not supplied', async () => {
    const { service, behaviourModel } = makeService([]);
    await service.createBehaviourNote('t1', institutionId, { studentId: new Types.ObjectId().toString(), note: 'x' });
    expect(behaviourModel.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
  });

  it('createBehaviourNote respects an explicitly supplied status', async () => {
    const { service, behaviourModel } = makeService([]);
    await service.createBehaviourNote('t1', institutionId, { studentId: new Types.ObjectId().toString(), note: 'x', status: 'in_progress' });
    expect(behaviourModel.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it('updateBehaviourNote auto-stamps resolvedAt when moved to resolved', async () => {
    const id = new Types.ObjectId();
    const { service } = makeService([{ _id: id, tenantId: 't1', status: 'open' }]);
    const result: any = await service.updateBehaviourNote('t1', id.toString(), { status: 'resolved' });
    expect(result.status).toBe('resolved');
    expect(result.resolvedAt).toBeInstanceOf(Date);
  });

  it('updateBehaviourNote does not overwrite a caller-supplied resolvedAt', async () => {
    const id = new Types.ObjectId();
    const { service } = makeService([{ _id: id, tenantId: 't1', status: 'open' }]);
    const explicit = new Date('2026-01-01T00:00:00.000Z');
    const result: any = await service.updateBehaviourNote('t1', id.toString(), { status: 'closed', resolvedAt: explicit });
    expect(result.resolvedAt).toBe(explicit);
  });

  it('updateBehaviourNote leaves resolvedAt untouched for a non-resolving status change', async () => {
    const id = new Types.ObjectId();
    const { service } = makeService([{ _id: id, tenantId: 't1', status: 'open' }]);
    const result: any = await service.updateBehaviourNote('t1', id.toString(), { status: 'in_progress' });
    expect(result.resolvedAt).toBeUndefined();
  });

  it('listComplaints filters by status and category and returns {data, meta}', async () => {
    const records = [
      { _id: new Types.ObjectId(), tenantId: 't1', status: 'open', category: 'conduct', incidentDate: new Date() },
      { _id: new Types.ObjectId(), tenantId: 't1', status: 'resolved', category: 'conduct', incidentDate: new Date() },
      { _id: new Types.ObjectId(), tenantId: 't1', status: 'open', category: 'academic', incidentDate: new Date() },
    ];
    const { service } = makeService(records);
    const result = await service.listComplaints('t1', { status: 'open', category: 'conduct' });
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual(expect.objectContaining({ page: 1, limit: 20, total: 1 }));
  });

  it('listComplaints paginates', async () => {
    const records = Array.from({ length: 5 }, () => ({ _id: new Types.ObjectId(), tenantId: 't1', incidentDate: new Date() }));
    const { service } = makeService(records);
    const result = await service.listComplaints('t1', { page: '2', limit: '2' });
    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual(expect.objectContaining({ page: 2, limit: 2, total: 5, totalPages: 3 }));
  });

  it('an old record created before the Complaints Register fields existed still reads back fine', async () => {
    const legacy = { _id: new Types.ObjectId(), tenantId: 't1', studentName: 'Old Record', type: 'concern', note: 'legacy', incidentDate: new Date() };
    const { service } = makeService([legacy]);
    const result = await service.listComplaints('t1', {});
    expect(result.data[0].status).toBeUndefined();
    expect(result.data[0].category).toBeUndefined();
    expect(result.data[0].studentName).toBe('Old Record');
  });
});
