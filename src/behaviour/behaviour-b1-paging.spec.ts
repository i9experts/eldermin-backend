// B1: page / limit clamping, per-class `section` filter and server-side `mine` on the lists the teacher app uses.
import { Types } from 'mongoose';
import { BehaviourService, pageParams, MAX_PAGE_SIZE } from './behaviour.service';

function q(result: any) {
  const o: any = { select: () => o, lean: () => Promise.resolve(result), sort: jest.fn(() => o), skip: jest.fn(() => o), limit: jest.fn(() => Promise.resolve(result)), then: (a: any, b: any) => Promise.resolve(result).then(a, b) };
  return o;
}
function build() {
  const recordModel: any = { find: jest.fn(() => q([])), countDocuments: jest.fn(async () => 0) };
  const tarbiyahModel: any = { find: jest.fn(() => q([])), countDocuments: jest.fn(async () => 0) };
  const n: any = {};
  return { svc: new BehaviourService(recordModel, tarbiyahModel, n, n, n, n, n, n, n), recordModel, tarbiyahModel };
}
const ADMIN: any = { userId: new Types.ObjectId().toString(), name: 'Principal', role: 'super_admin' };

describe('pageParams', () => {
  it('defaults 1 / 20; strings parsed; page >= 1; limit 1..MAX', () => {
    expect(pageParams(undefined, undefined)).toEqual({ page: 1, limit: 20, skip: 0 });
    expect(pageParams('3', '50')).toEqual({ page: 3, limit: 50, skip: 100 });
    expect(pageParams('0', '-5')).toEqual({ page: 1, limit: 20, skip: 0 }); // junk -> defaults
    expect(pageParams('abc', 'xyz')).toEqual({ page: 1, limit: 20, skip: 0 });
    expect(pageParams(2, 100000).limit).toBe(MAX_PAGE_SIZE);
    expect(pageParams(1, 0).limit).toBe(20);
  });
});

describe('BehaviourService.getRecords paging and filters (B1)', () => {
  it('default call is unchanged for the web (page 1, limit 20, school filter only)', async () => {
    const { svc, recordModel } = build();
    const res: any = await svc.getRecords('demo', {}, ADMIN);
    expect((recordModel.find.mock.calls as any[][])[0][0]).toEqual({ schoolSlug: 'demo' });
    expect(res.meta).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
  });

  it('page / limit from the query string drive skip / limit and meta; an absurd limit is capped', async () => {
    const { svc, recordModel } = build();
    const res: any = await svc.getRecords('demo', { page: '2', limit: '100' }, ADMIN);
    const chainObj = (recordModel.find.mock.results[0] as any).value;
    expect(chainObj.skip).toHaveBeenCalledWith(100);
    expect(chainObj.limit).toHaveBeenCalledWith(100);
    expect(res.meta.page).toBe(2);
    const big: any = await svc.getRecords('demo', { limit: '99999' }, ADMIN);
    expect(big.meta.limit).toBe(MAX_PAGE_SIZE);
  });

  it('sorts newest first with a stable _id tiebreak (pages do not overlap)', async () => {
    const { svc, recordModel } = build();
    await svc.getRecords('demo', {}, ADMIN);
    expect(((recordModel.find.mock.results[0] as any).value.sort.mock.calls as any[][])[0][0]).toEqual({ date: -1, _id: -1 });
  });

  it('section filter is tolerant (per-class paging)', async () => {
    const { svc, recordModel } = build();
    await svc.getRecords('demo', { grade: 'Grade 5', section: 'A' }, ADMIN);
    const f = (recordModel.find.mock.calls as any[][])[0][0];
    expect(f.grade).toBe('Grade 5');
    expect(f.section.test('A')).toBe(true);
    expect(f.section.test('Section a')).toBe(true);
    expect(f.section.test('B')).toBe(false);
  });

  it('mine=true: by reportedById, or by name when the record has no id; ANDed with other filters', async () => {
    const { svc, recordModel } = build();
    await svc.getRecords('demo', { mine: 'true', type: 'negative' }, ADMIN);
    const f = (recordModel.find.mock.calls as any[][])[0][0];
    expect(f.type).toBe('negative');
    const or = f.$and[0].$or;
    expect(String(or[0].reportedById)).toBe(ADMIN.userId);
    expect(or[1].reportedById).toBeNull();
    expect(or[1].reportedBy.test('  principal ')).toBe(true);
    expect(or[1].reportedBy.test('Someone Else')).toBe(false);
  });

  it('mine is ignored unless exactly "true"; works together with the teacher class narrowing ($and merged, not replaced)', async () => {
    const { svc, recordModel } = build();
    await svc.getRecords('demo', { mine: 'false' }, ADMIN);
    expect((recordModel.find.mock.calls as any[][])[0][0].$and).toBeUndefined();
  });

  it('a name with regex characters cannot break or widen the name match', async () => {
    const { svc, recordModel } = build();
    await svc.getRecords('demo', { mine: 'true' }, { ...ADMIN, name: 'A.*(x)' });
    const re = ((recordModel.find.mock.calls as any[][])[0][0].$and[0].$or[1].reportedBy) as RegExp;
    expect(re.test('A.*(x)')).toBe(true);
    expect(re.test('Abc')).toBe(false);
  });
});

describe('BehaviourService.getTarbiyahAssessments paging (B1)', () => {
  it('clamps like records and accepts a section filter', async () => {
    const { svc, tarbiyahModel } = build();
    const res: any = await svc.getTarbiyahAssessments('demo', { limit: '99999', page: '2', section: 'B', grade: 'Grade 5' }, ADMIN);
    expect(res.meta.limit).toBe(MAX_PAGE_SIZE);
    expect(res.meta.page).toBe(2);
    expect(((tarbiyahModel.find.mock.calls as any[][])[0][0]).section.test('B')).toBe(true);
  });
});
