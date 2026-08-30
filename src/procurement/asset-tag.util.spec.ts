import { formatAssetTag } from './asset-tag.util';

describe('formatAssetTag', () => {
  it('zero-pads the sequence to 4 digits', () => {
    expect(formatAssetTag(2025, 1)).toBe('AST-2025-0001');
    expect(formatAssetTag(2025, 42)).toBe('AST-2025-0042');
  });

  it('does not pad when the sequence already fills 4 digits', () => {
    expect(formatAssetTag(2025, 1000)).toBe('AST-2025-1000');
  });

  it('widens rather than truncating past 9999', () => {
    expect(formatAssetTag(2025, 10000)).toBe('AST-2025-10000');
  });

  it('truncates a non-integer seq down (defensive — callers should pass integers)', () => {
    expect(formatAssetTag(2025, 3.9)).toBe('AST-2025-0003');
  });

  it('throws for a non-positive or non-finite seq', () => {
    expect(() => formatAssetTag(2025, 0)).toThrow();
    expect(() => formatAssetTag(2025, -1)).toThrow();
    expect(() => formatAssetTag(2025, NaN)).toThrow();
  });
});
