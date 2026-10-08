import { Types } from 'mongoose';
import { idMatch, idMatchIn, idMatchNullable, idForms, widenIdFilter } from './id-match.util';

const HEX = '64b7f0f0f0f0f0f0f0f0f0f0';
const HEX2 = '64b7f0f0f0f0f0f0f0f0f0f1';

describe('idMatch', () => {
  it('string id -> $in [string, ObjectId]', () => {
    const r: any = idMatch(HEX);
    expect(r.$in).toHaveLength(2);
    expect(r.$in[0]).toBe(HEX);
    expect(r.$in[1]).toBeInstanceOf(Types.ObjectId);
    expect(String(r.$in[1])).toBe(HEX);
  });
  it('ObjectId -> same two forms', () => {
    const r: any = idMatch(new Types.ObjectId(HEX));
    expect(r.$in[0]).toBe(HEX);
    expect(String(r.$in[1])).toBe(HEX);
  });
  it('invalid / null / undefined / numbers / objects are returned unchanged', () => {
    const o = { a: 1 };
    expect(idMatch('abc')).toBe('abc');
    expect(idMatch(HEX + 'z')).toBe(HEX + 'z');
    expect(idMatch('')).toBe('');
    expect(idMatch(null)).toBeNull();
    expect(idMatch(undefined)).toBeUndefined();
    expect(idMatch(12)).toBe(12);
    expect(idMatch(o)).toBe(o);
  });
  it('idForms rejects invalid', () => {
    expect(idForms('nope')).toBeNull();
    expect(idForms(HEX)).not.toBeNull();
  });
});

describe('idMatchIn / idMatchNullable', () => {
  it('array -> all forms, de-duplicated, invalid entries kept', () => {
    const r: any = idMatchIn([HEX, new Types.ObjectId(HEX2), HEX, 'free-text']);
    expect(r.$in).toContain(HEX);
    expect(r.$in).toContain('free-text');
    expect(r.$in.filter((x: any) => x instanceof Types.ObjectId).map(String).sort()).toEqual([HEX, HEX2].sort());
    expect(r.$in.filter((x: any) => x === HEX)).toHaveLength(1);
  });
  it('non-array / null unchanged', () => {
    expect(idMatchIn(null)).toBeNull();
    expect(idMatchIn(undefined)).toBeUndefined();
    expect(idMatchIn([])).toEqual({ $in: [] });
  });
  it('nullable keeps null/undefined', () => {
    expect(idMatchNullable(null)).toBeNull();
    expect(idMatchNullable(undefined)).toBeUndefined();
    expect((idMatchNullable(HEX) as any).$in).toHaveLength(2);
  });
});

describe('widenIdFilter', () => {
  const mixed = (k: string) => ['tenantId', 'campusId', 'teacherId'].includes(k);
  it('widens mixed id paths only; leaves others, operators and $ne alone', () => {
    const f = widenIdFilter({
      tenantId: HEX, status: 'x', schoolSlug: HEX, campusId: { $ne: HEX }, teacherId: { $in: [HEX2] },
      $or: [{ campusId: HEX }, { campusId: null }],
    }, mixed);
    expect(f.tenantId.$in).toHaveLength(2);
    expect(f.status).toBe('x');
    expect(f.schoolSlug).toBe(HEX);
    expect(f.campusId).toEqual({ $ne: HEX });
    expect(f.teacherId.$in).toHaveLength(2);
    expect(f.$or[0].campusId.$in).toHaveLength(2);
    expect(f.$or[1].campusId).toBeNull();
  });
  it('does not mutate its input', () => {
    const input = { tenantId: HEX };
    widenIdFilter(input, mixed);
    expect(input.tenantId).toBe(HEX);
  });
  it('leaves invalid values alone', () => {
    expect(widenIdFilter({ tenantId: 'abc', campusId: null }, mixed)).toEqual({ tenantId: 'abc', campusId: null });
  });
});
