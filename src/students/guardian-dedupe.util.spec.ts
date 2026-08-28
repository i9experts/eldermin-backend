import { dedupeGuardians, guardianDedupeKey, pickMoreCompleteGuardian } from './guardian-dedupe.util';

describe('guardianDedupeKey', () => {
  it('keys by trimmed phone when present', () => {
    expect(guardianDedupeKey({ name: 'Jane Doe', phone: ' 0300-1234567 ' })).toBe('phone:0300-1234567');
  });

  it('falls back to a case-insensitive name key when no phone is on record', () => {
    expect(guardianDedupeKey({ name: 'John Smith' })).toBe('name:john smith');
    expect(guardianDedupeKey({ name: 'JOHN SMITH' })).toBe('name:john smith');
  });
});

describe('pickMoreCompleteGuardian', () => {
  it('keeps the entry with more filled-in fields', () => {
    const sparse = { name: 'Jane Doe', phone: '0300-1111111' };
    const rich = {
      name: 'Jane Doe', phone: '0300-1111111', email: 'jane@example.com',
      occupation: 'Doctor', employer: 'City Hospital', relation: 'mother',
    };
    expect(pickMoreCompleteGuardian(sparse, rich)).toBe(rich);
    expect(pickMoreCompleteGuardian(rich, sparse)).toBe(rich);
  });

  it('prefers isPrimary on a genuine tie', () => {
    const a = { name: 'Jane Doe', phone: '0300-1111111', isPrimary: false };
    const b = { name: 'Jane Doe', phone: '0300-1111111', isPrimary: true };
    expect(pickMoreCompleteGuardian(a, b)).toBe(b);
    expect(pickMoreCompleteGuardian(b, a)).toBe(b);
  });

  it('keeps the first entry on a total tie for stability', () => {
    const a = { name: 'Jane Doe', phone: '0300-1111111' };
    const b = { name: 'Jane Doe', phone: '0300-1111111' };
    expect(pickMoreCompleteGuardian(a, b)).toBe(a);
  });
});

describe('dedupeGuardians', () => {
  it('collapses exact phone duplicates down to one entry', () => {
    const guardians = [
      { name: 'Jane Doe', phone: '0300-1111111', relation: 'mother' },
      { name: 'Jane Doe', phone: '0300-1111111', relation: 'mother' },
      { name: 'Jane Doe', phone: '0300-1111111', relation: 'mother' },
    ];
    expect(dedupeGuardians(guardians)).toHaveLength(1);
  });

  it('keeps the most complete record among duplicates, not just the first', () => {
    const sparse = { name: 'Jane Doe', phone: '0300-1111111' };
    const rich = {
      name: 'Jane Doe', phone: '0300-1111111', email: 'jane@example.com',
      occupation: 'Doctor', employer: 'City Hospital', relation: 'mother',
    };
    const result = dedupeGuardians([sparse, rich]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(rich);
  });

  it('preserves richer data even when the complete record appears first', () => {
    const rich = {
      name: 'Jane Doe', phone: '0300-1111111', email: 'jane@example.com',
      occupation: 'Doctor', employer: 'City Hospital', relation: 'mother',
    };
    const sparse = { name: 'Jane Doe', phone: '0300-1111111' };
    const result = dedupeGuardians([rich, sparse]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(rich);
  });

  it('falls back to name matching when phone is missing on the duplicates', () => {
    const a = { name: 'John Smith', relation: 'father' };
    const b = { name: 'john smith', relation: 'father', email: 'john@example.com' };
    const result = dedupeGuardians([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(b);
  });

  it('never merges different guardians - distinct phones/names are all kept', () => {
    const guardians = [
      { name: 'Jane Doe', phone: '0300-1111111', relation: 'mother' },
      { name: 'John Doe', phone: '0300-2222222', relation: 'father' },
      { name: 'Aunt May', relation: 'guardian' },
    ];
    expect(dedupeGuardians(guardians)).toHaveLength(3);
  });

  it('preserves first-seen order of distinct guardians', () => {
    const guardians = [
      { name: 'Zed', phone: '111' },
      { name: 'Amy', phone: '222' },
      { name: 'Zed', phone: '111' },
    ];
    const result = dedupeGuardians(guardians);
    expect(result.map((g) => g.name)).toEqual(['Zed', 'Amy']);
  });

  it('is idempotent - running it twice gives the same result', () => {
    const guardians = [
      { name: 'Jane Doe', phone: '0300-1111111' },
      { name: 'Jane Doe', phone: '0300-1111111', email: 'jane@example.com' },
      { name: 'John Doe', phone: '0300-2222222' },
    ];
    const once = dedupeGuardians(guardians);
    const twice = dedupeGuardians(once);
    expect(twice).toEqual(once);
  });

  it('handles an empty or undefined array', () => {
    expect(dedupeGuardians([])).toEqual([]);
    expect(dedupeGuardians(undefined as any)).toEqual([]);
  });
});
