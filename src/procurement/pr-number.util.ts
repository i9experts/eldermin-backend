// Pure formatting helper for Purchase Request numbers (PR-<year>-<seq>).
// Split out from PurchaseRequestSchema's pre('validate') hook — which owns
// the actual per-tenant sequential count (that part needs the Mongoose
// model/DB and isn't unit-testable in isolation) — so the display format
// itself (padding, year, prefix) has a small pure surface to test directly.
//
// Previously this number was `Math.floor(1000 + Math.random() * 9000)`:
// not actually sequential, and since prNumber carried a bare `unique: true`
// index, two random draws colliding meant an occasional failed PR creation.
// The hook now computes `seq` as (count of this school's PRs already
// created this year) + 1, matching the countDocuments()-based numbering
// already used elsewhere in this same service (createVendor's VND-,
// createInventoryItem's ITM-, and the same pattern in students/HR/academics).

export function formatPrNumber(year: number, seq: number): string {
  if (!Number.isFinite(seq) || seq < 1) {
    throw new Error(`formatPrNumber: seq must be a positive integer, got ${seq}`);
  }
  // 4-digit zero-padded, but never truncates — a school with 10000+ PRs in a
  // year gets a wider number instead of a silently wrong/duplicate one.
  const padded = String(Math.trunc(seq)).padStart(4, '0');
  return `PR-${year}-${padded}`;
}
