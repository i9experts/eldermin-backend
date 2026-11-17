import { Types } from 'mongoose';
import { RolesService } from './roles.service';

// Pins the fix for "GET /api/v1/roles → 500: BSONError: input must be a
// 24 character hex string, 12 byte Uint8Array, or an integer" seen in
// production. RolesService.tenantMatch unconditionally called
// `new Types.ObjectId(tenantId)`, which throws for any tenantId that
// isn't a valid 24-char hex string - crashing the entire roles list for
// that caller (and anyone sharing the request) instead of just not
// matching anything for a garbage/malformed id.

describe('RolesService.tenantMatch', () => {
  it('matches both the string and ObjectId form for a valid ObjectId-shaped tenantId', () => {
    const id = new Types.ObjectId().toString();
    const result: any = RolesService.tenantMatch(id);
    expect(result.$in).toHaveLength(2);
    expect(result.$in[0]).toBe(id);
    expect(result.$in[1]).toBeInstanceOf(Types.ObjectId);
    expect(result.$in[1].toString()).toBe(id);
  });

  it('does not throw for a non-ObjectId tenantId - the exact crash reported in production', () => {
    expect(() => RolesService.tenantMatch('not-a-real-object-id')).not.toThrow();
    expect(() => RolesService.tenantMatch('')).not.toThrow();
    expect(() => RolesService.tenantMatch('undefined')).not.toThrow();
  });

  it('falls back to a plain string match for a non-ObjectId tenantId, instead of a BSONError', () => {
    expect(RolesService.tenantMatch('not-a-real-object-id')).toBe('not-a-real-object-id');
  });
});
