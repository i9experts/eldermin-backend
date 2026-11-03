export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

export function isValidSemver(v: unknown): v is string {
  return typeof v === 'string' && SEMVER_REGEX.test(v);
}

/** Numeric (not lexicographic) compare of "x.y.z" strings: -1, 0 or 1. "1.0.10" > "1.0.9". */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}
