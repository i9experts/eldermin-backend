import { toHijri, formatHijri } from './hijri-date.util';

describe('hijri-date.util', () => {
  it('converts a known Gregorian date to a plausible Hijri year/month/day', () => {
    const h = toHijri(new Date('2026-11-09'));
    expect(h.year).toBe(1448);
    expect(h.month).toBeGreaterThanOrEqual(1);
    expect(h.month).toBeLessThanOrEqual(12);
    expect(h.day).toBeGreaterThanOrEqual(1);
    expect(h.day).toBeLessThanOrEqual(30);
  });

  it('dayAdjustment shifts the result by whole days', () => {
    const base = toHijri(new Date('2026-11-09'));
    const shifted = toHijri(new Date('2026-11-09'), 1);
    // Either the day advances by 1, or (at a month boundary) the month/year rolls over - either
    // way the two must not be identical.
    expect(shifted).not.toEqual(base);
  });

  it('formatHijri returns a human-readable reference string', () => {
    expect(formatHijri('2026-11-09')).toMatch(/^\d+ [\w' -]+ \d+ AH$/);
  });

  it('formatHijri returns an empty string for a missing/invalid date', () => {
    expect(formatHijri(null)).toBe('');
    expect(formatHijri('not-a-date')).toBe('');
  });
});
