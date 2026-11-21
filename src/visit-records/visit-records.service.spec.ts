import { NotFoundException } from '@nestjs/common';
import { VisitRecordsService } from './visit-records.service';

// No real Mongo - each test wires in just the model methods the code
// under test actually calls, same convention as book-category.spec.ts.
function makeService(overrides: Record<string, any> = {}) {
  const svc: any = Object.create(VisitRecordsService.prototype);
  svc.visitModel = overrides.visitModel;
  return svc;
}

describe('VisitRecordsService', () => {
  it('create stamps visitedBy/visitedByName from the caller and defaults visitDate to now', async () => {
    const create = jest.fn(async (doc: any) => doc);
    const visitModel: any = { create };
    const svc = makeService({ visitModel });
    const dto: any = { institutionName: 'Deenway School', institutionType: 'school' };
    await svc.create(dto, 'user-1', 'Atiq Rehman');
    expect(create).toHaveBeenCalledTimes(1);
    const doc = create.mock.calls[0][0];
    expect(doc.visitedBy).toBe('user-1');
    expect(doc.visitedByName).toBe('Atiq Rehman');
    expect(doc.visitDate).toBeInstanceOf(Date);
    expect(doc.location).toBeNull();
  });

  it('findAll filters by the given params and defaults to visitDate-desc order', async () => {
    const sort = jest.fn(() => ({ lean: () => ({ exec: async () => [] }) }));
    const find = jest.fn(() => ({ sort }));
    const visitModel: any = { find };
    const svc = makeService({ visitModel });
    await svc.findAll({ institutionType: 'school', search: 'Deenway' });
    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      institutionType: 'school',
      $or: expect.arrayContaining([{ institutionName: { $regex: 'Deenway', $options: 'i' } }]),
    }));
    expect(sort).toHaveBeenCalledWith({ visitDate: -1 });
  });

  it('findAll with pendingFollowUp re-ranks by combined interest, hottest first', async () => {
    const records = [
      { _id: '1', elderminInterest: 'curious', smartvanInterest: 'none' },
      { _id: '2', elderminInterest: 'hot', smartvanInterest: 'hot' },
      { _id: '3', elderminInterest: 'interested', smartvanInterest: 'demo_scheduled' },
    ];
    const sort = jest.fn(() => ({ lean: () => ({ exec: async () => records }) }));
    const find = jest.fn(() => ({ sort }));
    const visitModel: any = { find };
    const svc = makeService({ visitModel });
    const result = await svc.findAll({ pendingFollowUp: true });
    expect(result.map((r: any) => r._id)).toEqual(['2', '3', '1']);
  });

  it('findOne throws NotFoundException for a missing record', async () => {
    const lean = jest.fn(() => ({ exec: async () => null }));
    const findById = jest.fn(() => ({ lean }));
    const visitModel: any = { findById };
    const svc = makeService({ visitModel });
    await expect(svc.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('addFollowUpNote pushes a note and saves', async () => {
    const record: any = { followUpNotes: [], save: jest.fn() };
    const findById = jest.fn(() => ({ exec: async () => record }));
    const visitModel: any = { findById };
    const svc = makeService({ visitModel });
    await svc.addFollowUpNote('rec-1', 'Called back, interested in a demo', 'Sales Rep', 'user-2');
    expect(record.followUpNotes).toHaveLength(1);
    expect(record.followUpNotes[0]).toEqual(expect.objectContaining({
      text: 'Called back, interested in a demo', authorName: 'Sales Rep', authorId: 'user-2',
    }));
    expect(record.save).toHaveBeenCalledTimes(1);
  });

  it('stats aggregates totals, hot-lead counts for both products, and due follow-ups', async () => {
    const countDocuments = jest.fn()
      .mockResolvedValueOnce(42)   // total
      .mockResolvedValueOnce(3)    // elderminHot
      .mockResolvedValueOnce(1)    // smartvanHot
      .mockResolvedValueOnce(5);   // pendingFollowUp
    const aggregate = jest.fn(async () => [{ _id: 'school', count: 30 }, { _id: 'college', count: 12 }]);
    const visitModel: any = { countDocuments, aggregate };
    const svc = makeService({ visitModel });
    const result = await svc.stats();
    expect(result).toEqual({
      total: 42,
      byInstitutionType: { school: 30, college: 12 },
      elderminHotLeads: 3,
      smartvanHotLeads: 1,
      followUpsDue: 5,
    });
  });
});
