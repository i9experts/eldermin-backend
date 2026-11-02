/**
 * Single source of truth for the request-context "academic year" fallback
 * used across controllers' ctx()-style helpers, e.g.
 * `req?.user?.academicYear || req?.headers['x-academic-year'] || FALLBACK`.
 * Before this existed, that exact fallback chain was duplicated across ~9
 * controllers each with its own frozen '2025-26' literal - fixing the year
 * meant editing every one of them, and in practice most never got updated.
 *
 * This is a last resort only: the JWT's academicYear claim, or the
 * frontend's x-academic-year header (kept in sync with the school's real
 * current AcademicYear - see Eldermin-Frontend's TopBar.tsx), should cover
 * the normal case. This only fires for a request with neither - e.g. a
 * tenant with no AcademicYear marked current yet - and computes a
 * date-based label under this app's July -> June "YYYY-YY" convention
 * instead of freezing a literal that goes stale forever.
 */
export function resolveAcademicYearFallback(d: Date = new Date()): string {
  const year = d.getUTCMonth() >= 6 /* July */ ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const endYY = String((year + 1) % 100).padStart(2, '0');
  return `${year}-${endYY}`;
}
