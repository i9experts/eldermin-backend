import { formatPrNumber } from './pr-number.util';

describe('formatPrNumber', () => {
  it('zero-pads the sequence to 4 digits', () => {
    expect(formatPrNumber(2025, 1)).toBe('PR-2025-0001');
    expect(formatPrNumber(2025, 42)).toBe('PR-2025-0042');
  });

  it('does not pad when the sequence already fills 4 digits', () => {
    expect(formatPrNumber(2025, 1000)).toBe('PR-2025-1000');
  });

  it('widens rather than truncating past 9999', () => {
    expect(formatPrNumber(2025, 10000)).toBe('PR-2025-10000');
  });

  it('truncates a non-integer seq down (defensive — callers should pass integers)', () => {
    expect(formatPrNumber(2025, 3.9)).toBe('PR-2025-0003');
  });

  it('throws for a non-positive or non-finite seq', () => {
    expect(() => formatPrNumber(2025, 0)).toThrow();
    expect(() => formatPrNumber(2025, -1)).toThrow();
    expect(() => formatPrNumber(2025, NaN)).toThrow();
  });
});
