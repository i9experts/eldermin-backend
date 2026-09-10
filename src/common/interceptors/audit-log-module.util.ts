// Pure helper for AuditLogInterceptor's module-label derivation - split out
// so the path -> label mapping has a small unit-testable surface, same
// rationale as pr-number.util.ts/data-privacy.util.ts.
//
// Derives a human-readable module name from the request path, e.g.
// /api/v1/students/123 -> "Students", /api/v1/finance/invoices -> "Finance".
// Procurement is a special case: every sub-resource (Vendors, Purchase
// Requisitions, Purchase Orders, GRN, Inventory, Assets, Settings, Reports)
// is mounted under the single /procurement prefix, so without this
// override every procurement action collapsed into one generic
// "Procurement" audit-log entry - indistinguishable in the Audit Logs tab
// whether a vendor was edited or an asset was deleted. SUB_MODULE_LABELS
// looks at the path's second segment to split those back out; only
// Procurement is populated for now since that's the module this was
// reported against, but the mechanism is generic and can gain entries for
// other multi-resource controllers later without changing its shape.
const SUB_MODULE_LABELS: Record<string, Record<string, string>> = {
  procurement: {
    vendors: 'Procurement: Vendors',
    requests: 'Procurement: Purchase Requisitions',
    orders: 'Procurement: Purchase Orders',
    grn: 'Procurement: GRN',
    inventory: 'Procurement: Inventory',
    assets: 'Procurement: Assets',
    settings: 'Procurement: Settings',
    reports: 'Procurement: Reports',
    'scheduled-reports': 'Procurement: Scheduled Reports',
  },
  // Same granularity gap as Procurement's, for the same reason: every
  // library action (books, issues, reservations, settings, reports) is
  // mounted under the single /academics prefix alongside Subjects,
  // Curriculum, Timetable, etc, so without this override every library
  // action collapsed into the generic "Academics" audit-log entry.
  academics: {
    library: 'Academics: Library',
  },
};

export function deriveAuditModule(path: string): string {
  const cleaned = path.split('?')[0].replace(/^\/api\/v1\//, '');
  const segments = cleaned.split('/');
  const first = segments[0] || 'system';
  const second = segments[1];

  const subLabel = second && SUB_MODULE_LABELS[first]?.[second];
  if (subLabel) return subLabel;

  return first.charAt(0).toUpperCase() + first.slice(1);
}
