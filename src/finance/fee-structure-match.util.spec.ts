import { feeStructureCoversMonth, pickApplicableFeeStructures } from './fee-structure-match.util';

const d = (s: string) => new Date(s);

describe('feeStructureCoversMonth', () => {
  it('is true for a structure with no effectiveFrom/effectiveTo (always in force)', () => {
    expect(feeStructureCoversMonth({ _id: '1' }, d('2026-09-15'))).toBe(true);
  });

  it('is false before effectiveFrom', () => {
    expect(feeStructureCoversMonth({ _id: '1', effectiveFrom: d('2026-10-01') }, d('2026-09-15'))).toBe(false);
  });

  it('is false after effectiveTo', () => {
    expect(feeStructureCoversMonth({ _id: '1', effectiveTo: d('2026-08-31') }, d('2026-09-15'))).toBe(false);
  });

  it('is true within an explicit window', () => {
    expect(feeStructureCoversMonth({ _id: '1', effectiveFrom: d('2026-08-01'), effectiveTo: d('2026-12-31') }, d('2026-09-15'))).toBe(true);
  });
});

describe('pickApplicableFeeStructures', () => {
  it('returns a single unambiguous match unchanged', () => {
    const candidates = [{ _id: '1', grade: 'Prek-2' }];
    expect(pickApplicableFeeStructures(candidates, d('2026-09-15'))).toEqual(candidates);
  });

  it('excludes structures outside their effective window - the exact bug this fixes: a superseded structure with no effectiveTo set would otherwise still match and get summed into the invoice alongside its replacement', () => {
    const old = { _id: '1', grade: 'Prek-2', effectiveTo: d('2026-06-30') }; // last year's structure, never deactivated
    const current = { _id: '2', grade: 'Prek-2', effectiveFrom: d('2026-08-01') };
    expect(pickApplicableFeeStructures([old, current], d('2026-09-15'))).toEqual([current]);
  });

  it('prefers a more specific (section-scoped) structure over a grade-wide one', () => {
    const gradeWide = { _id: '1', grade: 'Prek-2' };
    const sectionSpecific = { _id: '2', grade: 'Prek-2', section: 'A' };
    expect(pickApplicableFeeStructures([gradeWide, sectionSpecific], d('2026-09-15'))).toEqual([sectionSpecific]);
  });

  it('breaks a tie between equally-specific structures by the most recent effectiveFrom', () => {
    const older = { _id: '1', grade: 'Prek-2', section: 'A', effectiveFrom: d('2026-01-01') };
    const newer = { _id: '2', grade: 'Prek-2', section: 'A', effectiveFrom: d('2026-08-01') };
    expect(pickApplicableFeeStructures([older, newer], d('2026-09-15'))).toEqual([newer]);
  });

  it('returns every candidate in an unresolved tie (identical specificity, no effectiveFrom to break it) rather than picking one arbitrarily or silently summing them', () => {
    const a = { _id: '1', grade: 'Prek-2', section: 'A' };
    const b = { _id: '2', grade: 'Prek-2', section: 'A' };
    const result = pickApplicableFeeStructures([a, b], d('2026-09-15'));
    expect(result).toHaveLength(2);
  });

  it('reproduces the real-world bug scenario: several special-discount variant structures left active for the same grade/section, only one actually in this month\'s window', () => {
    const y2025 = { _id: '1', grade: 'Prek-2', section: 'A', effectiveTo: d('2026-07-31') };
    const specialA = { _id: '2', grade: 'Prek-2', section: 'A', effectiveFrom: d('2026-08-01'), effectiveTo: d('2026-08-31') }; // a since-superseded mid-year variant
    const current = { _id: '3', grade: 'Prek-2', section: 'A', effectiveFrom: d('2026-09-01') };
    expect(pickApplicableFeeStructures([y2025, specialA, current], d('2026-09-15'))).toEqual([current]);
  });
});
