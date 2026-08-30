// Pure formatting helper for Asset tags (AST-<year>-<seq>), mirroring
// pr-number.util.ts's formatPrNumber split exactly: the actual per-tenant
// sequential count lives in AssetSchema's pre('validate') hook (needs the
// Mongoose model/DB, not unit-testable in isolation) — this file only owns
// the display format itself (padding, year, prefix), which is directly
// testable without mocking Mongoose.
//
// Unlike PurchaseOrder.poNumber/GRN.grnNumber (still `Math.random()` —
// known, separate, pre-existing issue, out of scope here), Asset.tag is
// generated the same countDocuments()-then-increment way PurchaseRequest.
// prNumber already was fixed to.

export function formatAssetTag(year: number, seq: number): string {
  if (!Number.isFinite(seq) || seq < 1) {
    throw new Error(`formatAssetTag: seq must be a positive integer, got ${seq}`);
  }
  // 4-digit zero-padded, but never truncates — a school with 10000+ assets
  // registered in a year gets a wider number instead of a silently wrong/
  // duplicate one.
  const padded = String(Math.trunc(seq)).padStart(4, '0');
  return `AST-${year}-${padded}`;
}
