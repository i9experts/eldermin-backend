import { deriveAuditModule } from './audit-log-module.util';

describe('deriveAuditModule', () => {
  it('splits every procurement sub-resource into its own label instead of one generic "Procurement"', () => {
    expect(deriveAuditModule('/api/v1/procurement/vendors/123')).toBe('Procurement: Vendors');
    expect(deriveAuditModule('/api/v1/procurement/requests')).toBe('Procurement: Purchase Requisitions');
    expect(deriveAuditModule('/api/v1/procurement/orders/456')).toBe('Procurement: Purchase Orders');
    expect(deriveAuditModule('/api/v1/procurement/grn')).toBe('Procurement: GRN');
    expect(deriveAuditModule('/api/v1/procurement/inventory/789')).toBe('Procurement: Inventory');
    expect(deriveAuditModule('/api/v1/procurement/assets/1')).toBe('Procurement: Assets');
    expect(deriveAuditModule('/api/v1/procurement/settings/vendor-categories')).toBe('Procurement: Settings');
    expect(deriveAuditModule('/api/v1/procurement/reports/spend-analysis')).toBe('Procurement: Reports');
    expect(deriveAuditModule('/api/v1/procurement/scheduled-reports/1')).toBe('Procurement: Scheduled Reports');
  });

  it('strips query strings before deriving the module', () => {
    expect(deriveAuditModule('/api/v1/procurement/vendors/123?foo=bar')).toBe('Procurement: Vendors');
  });

  it('falls back to the capitalized first segment for an unmapped procurement sub-resource', () => {
    expect(deriveAuditModule('/api/v1/procurement/some-new-endpoint')).toBe('Procurement');
  });

  it('falls back to the capitalized first segment for modules with no sub-module map', () => {
    expect(deriveAuditModule('/api/v1/students/123')).toBe('Students');
    expect(deriveAuditModule('/api/v1/finance/invoices')).toBe('Finance');
  });

  it('falls back to "System" for a root path with no segments', () => {
    expect(deriveAuditModule('/api/v1/')).toBe('System');
  });
});
