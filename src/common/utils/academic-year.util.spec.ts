import { resolveAcademicYearFallback } from './academic-year.util';

describe('resolveAcademicYearFallback', () => {
  it('returns the July-start academic year label for a date in the second half of the year', () => {
    expect(resolveAcademicYearFallback(new Date('2026-11-02T00:00:00Z'))).toBe('2026-27');
  });

  it('returns the July-start academic year label for a date in the first half of the year', () => {
    expect(resolveAcademicYearFallback(new Date('2026-03-15T00:00:00Z'))).toBe('2025-26');
  });

  it('rolls over exactly at the start of July', () => {
    expect(resolveAcademicYearFallback(new Date('2026-07-01T00:00:00Z'))).toBe('2026-27');
    expect(resolveAcademicYearFallback(new Date('2026-06-30T23:59:59Z'))).toBe('2025-26');
  });

  it('pads a single-digit end year', () => {
    expect(resolveAcademicYearFallback(new Date('2099-08-01T00:00:00Z'))).toBe('2099-00');
    expect(resolveAcademicYearFallback(new Date('2008-08-01T00:00:00Z'))).toBe('2008-09');
  });
});
