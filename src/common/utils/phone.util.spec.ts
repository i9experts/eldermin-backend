import { normalizePhone, phoneMatchCandidates, phoneMatchRegex } from './phone.util';

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

describe('phoneMatchRegex', () => {
  it('matches a clean, unpunctuated stored value', () => {
    expect(phoneMatchRegex('03152711020')!.test('03152711020')).toBe(true);
    expect(phoneMatchRegex('03152711020')!.test('+923152711020')).toBe(true);
    expect(phoneMatchRegex('03152711020')!.test('923152711020')).toBe(true);
    expect(phoneMatchRegex('03152711020')!.test('3152711020')).toBe(true);
  });

  it('matches a stored value that still has dashes baked in (real observed case)', () => {
    expect(phoneMatchRegex('03152711020')!.test('0315-2711020')).toBe(true);
  });

  it('matches a stored value that still has spaces baked in', () => {
    expect(phoneMatchRegex('03152711020')!.test('0315 271 1020')).toBe(true);
  });

  it('matches regardless of which format the query itself was typed in', () => {
    const re = phoneMatchRegex('+923152711020')!;
    expect(re.test('0315-2711020')).toBe(true);
    expect(re.test('03152711020')).toBe(true);
  });

  it('does not match a different number', () => {
    expect(phoneMatchRegex('03152711020')!.test('03172573105')).toBe(false);
  });

  it('does not false-match a longer number that merely contains these digits', () => {
    expect(phoneMatchRegex('03152711020')!.test('103152711020999')).toBe(false);
  });

  it('returns null for empty input', () => {
    expect(phoneMatchRegex('')).toBeNull();
    expect(phoneMatchRegex(undefined)).toBeNull();
  });
});
