import { normalizePhone, phoneMatchCandidates } from './phone.util';

describe('normalizePhone', () => {
  it('adds the country code to a local number with leading zero', () => {
    expect(normalizePhone('03172573105')).toBe('+923172573105');
  });

  it('adds the country code to a local number without leading zero', () => {
    expect(normalizePhone('3172573105')).toBe('+923172573105');
  });

  it('adds + to a number that already has the country code', () => {
    expect(normalizePhone('923172573105')).toBe('+923172573105');
  });

  it('leaves an already-canonical number unchanged', () => {
    expect(normalizePhone('+923172573105')).toBe('+923172573105');
  });

  it('strips spaces and dashes before normalizing', () => {
    expect(normalizePhone('0317-257 3105')).toBe('+923172573105');
  });

  it('treats a leading 00 as an international dialing prefix', () => {
    expect(normalizePhone('00923172573105')).toBe('+923172573105');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone(null)).toBe('');
  });
});

describe('phoneMatchCandidates', () => {
  it('lists every representation of a Pakistani number', () => {
    expect(new Set(phoneMatchCandidates('03172573105'))).toEqual(
      new Set(['+923172573105', '923172573105', '3172573105', '03172573105']),
    );
  });

  it('produces the same candidate set regardless of the input format', () => {
    const fromLocal = new Set(phoneMatchCandidates('03172573105'));
    const fromCanonical = new Set(phoneMatchCandidates('+923172573105'));
    const fromCountryCodeOnly = new Set(phoneMatchCandidates('923172573105'));
    expect(fromCanonical).toEqual(fromLocal);
    expect(fromCountryCodeOnly).toEqual(fromLocal);
  });

  it('returns an empty array for empty input', () => {
    expect(phoneMatchCandidates('')).toEqual([]);
    expect(phoneMatchCandidates(undefined)).toEqual([]);
  });
});
