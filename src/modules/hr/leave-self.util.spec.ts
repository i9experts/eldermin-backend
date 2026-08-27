import { belongsToStaff, buildOwnLeaveFilter, sanitizeSelfLeaveInput } from './leave-self.util';

describe('belongsToStaff', () => {
  it('returns true when the record staffId matches the given staffId', () => {
    expect(belongsToStaff({ staffId: 'abc123' }, 'abc123')).toBe(true);
  });

  it('compares ObjectId-like values by string form', () => {
    const oid = { toString: () => 'abc123' };
    expect(belongsToStaff({ staffId: oid }, 'abc123')).toBe(true);
  });

  it('returns false when the record staffId does not match', () => {
    expect(belongsToStaff({ staffId: 'other-staff' }, 'abc123')).toBe(false);
  });

  it('returns false for a null/undefined record (e.g. not found)', () => {
    expect(belongsToStaff(null, 'abc123')).toBe(false);
    expect(belongsToStaff(undefined, 'abc123')).toBe(false);
  });

  it('returns false when no staffId is given to compare against', () => {
    expect(belongsToStaff({ staffId: 'abc123' }, undefined)).toBe(false);
    expect(belongsToStaff({ staffId: 'abc123' }, null)).toBe(false);
  });
});

describe('buildOwnLeaveFilter', () => {
  it('forces staffId and tenantId from trusted values', () => {
    const filter = buildOwnLeaveFilter('my-staff-id', 'tenant-1');
    expect(filter).toEqual({ tenantId: 'tenant-1', staffId: 'my-staff-id' });
  });

  it('ignores a client-supplied staffId/tenantId in extra, always using the trusted ones', () => {
    const filter = buildOwnLeaveFilter('my-staff-id', 'tenant-1', {
      staffId: 'someone-elses-staff-id',
      tenantId: 'someone-elses-tenant',
      status: 'pending',
    });
    expect(filter).toEqual({ status: 'pending', tenantId: 'tenant-1', staffId: 'my-staff-id' });
  });

  it('omits tenantId from the filter when not provided', () => {
    const filter = buildOwnLeaveFilter('my-staff-id');
    expect(filter).toEqual({ staffId: 'my-staff-id' });
  });
});

describe('sanitizeSelfLeaveInput', () => {
  it('strips identity, tenancy, status, and approval fields a client could try to spoof', () => {
    const result = sanitizeSelfLeaveInput({
      leaveType: 'sick',
      fromDate: '2026-09-01',
      toDate: '2026-09-02',
      reason: 'Not feeling well',
      staffId: 'someone-elses-id',
      staffName: 'Spoofed Name',
      tenantId: 'other-tenant',
      institutionId: 'other-institution',
      status: 'approved',
      approvedBy: 'me-approving-myself',
      leaveNo: 'LV-9999-9999',
    });
    expect(result).toEqual({
      leaveType: 'sick',
      fromDate: '2026-09-01',
      toDate: '2026-09-02',
      reason: 'Not feeling well',
    });
  });

  it('handles an empty/undefined body without throwing', () => {
    expect(sanitizeSelfLeaveInput(undefined as any)).toEqual({});
    expect(sanitizeSelfLeaveInput({})).toEqual({});
  });
});
