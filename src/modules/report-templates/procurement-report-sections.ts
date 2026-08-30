// ============================================================
// PROCUREMENT REPORT DEFAULTS — titles + section/column layout shared by:
//   1. default-templates.ts's defaultReportTemplates() — the full seeded
//      ReportTemplate row every school gets (new at signup via
//      OnboardingService, backfilled for existing schools via
//      `npm run seed:report-templates`).
//   2. pdf.service.ts's getDefaultTemplateObject() — the in-code fallback
//      used if a school somehow has no seeded row yet, so a report PDF
//      never renders as an empty/garbled generic table.
//
// Single source of truth for what each of the 8 Procurement report types
// looks like, so the two callers above can never drift apart. The `dataKey`/
// `field` names here are a contract with
// ProcurementReportsService — each report's aggregation method builds a
// `data` object whose top-level fields and array keys exactly match what's
// referenced here (see that service's header comment for the full list).
// ============================================================

export const PROCUREMENT_REPORT_TITLES: Record<string, string> = {
  procurement_summary: 'Procurement Summary Report',
  vendor_performance: 'Vendor Performance Report',
  requisition_status: 'Requisition Status Report',
  spend_analysis: 'Spend Analysis Report',
  grn_report: 'Goods Receipt Report',
  asset_register: 'Asset Register',
  inventory_valuation: 'Inventory Valuation Report',
  budget_vs_actual: 'Budget vs Actual Report',
};

export function procurementReportSections(type: string): any[] {
  switch (type) {
    case 'procurement_summary':
      return [
        {
          id: 'summary-kpis', type: 'key_value', order: 1, visible: true,
          config: {
            fields: [
              { label: 'Period', field: 'periodLabel' },
              { label: 'Total Requisitions', field: 'totalPRs' },
              { label: 'Total Purchase Orders', field: 'totalPOs' },
              { label: 'Active Vendors', field: 'activeVendors' },
              { label: 'Total Spend (PKR)', field: 'totalSpend' },
              { label: 'Pending Payments (PKR)', field: 'pendingPayments' },
              { label: 'Average PO Value (PKR)', field: 'avgPOValue' },
            ],
          },
        },
        {
          id: 'top-categories', type: 'table', order: 2, visible: true,
          config: {
            dataKey: 'topCategories',
            columns: [
              { label: 'Category', field: 'category' },
              { label: 'PO Count', field: 'poCount' },
              { label: 'Total Spend (PKR)', field: 'totalSpend' },
            ],
          },
        },
        {
          id: 'top-vendors', type: 'table', order: 3, visible: true,
          config: {
            dataKey: 'topVendors',
            columns: [
              { label: 'Vendor', field: 'name' },
              { label: 'PO Count', field: 'poCount' },
              { label: 'Total Spend (PKR)', field: 'totalSpend' },
            ],
          },
        },
      ];

    case 'vendor_performance':
      return [
        {
          id: 'vendor-summary', type: 'key_value', order: 1, visible: true,
          config: {
            fields: [
              { label: 'Period', field: 'periodLabel' },
              { label: 'Vendors Evaluated', field: 'totalVendors' },
              { label: 'Total Spend (PKR)', field: 'totalSpend' },
            ],
          },
        },
        {
          id: 'vendor-table', type: 'table', order: 2, visible: true,
          config: {
            dataKey: 'vendors',
            columns: [
              { label: 'Vendor', field: 'name' },
              { label: 'Category', field: 'category' },
              { label: 'Rating', field: 'rating' },
              { label: 'PO Count', field: 'poCount' },
              { label: 'Total Spend (PKR)', field: 'totalSpend' },
              { label: 'Outstanding (PKR)', field: 'outstandingBalance' },
              { label: 'Status', field: 'status' },
            ],
          },
        },
      ];

    case 'requisition_status':
      return [
        {
          id: 'status-kpis', type: 'key_value', order: 1, visible: true,
          config: {
            fields: [
              { label: 'Period', field: 'periodLabel' },
              { label: 'Draft', field: 'draftCount' },
              { label: 'Submitted / Under Review', field: 'submittedCount' },
              { label: 'Approved', field: 'approvedCount' },
              { label: 'Rejected', field: 'rejectedCount' },
              { label: 'PO Raised', field: 'poRaisedCount' },
              { label: 'Completed', field: 'completedCount' },
              { label: 'Cancelled', field: 'cancelledCount' },
              { label: 'Total Value (PKR)', field: 'totalValue' },
            ],
          },
        },
        {
          id: 'requisitions-table', type: 'table', order: 2, visible: true,
          config: {
            dataKey: 'requisitions',
            columns: [
              { label: 'PR Number', field: 'prNumber' },
              { label: 'Title', field: 'title' },
              { label: 'Category', field: 'category' },
              { label: 'Priority', field: 'priority' },
              { label: 'Status', field: 'status' },
              { label: 'Est. Total (PKR)', field: 'estimatedTotal' },
              { label: 'Requested By', field: 'requestedBy' },
              { label: 'Date', field: 'createdAtLabel' },
            ],
          },
        },
      ];

    case 'spend_analysis':
      return [
        {
          id: 'spend-summary', type: 'key_value', order: 1, visible: true,
          config: {
            fields: [
              { label: 'Period', field: 'periodLabel' },
              { label: 'Total Spend (PKR)', field: 'totalSpend' },
              { label: 'Total Purchase Orders', field: 'totalPOs' },
            ],
          },
        },
        {
          id: 'spend-by-category', type: 'table', order: 2, visible: true,
          config: {
            dataKey: 'byCategory',
            columns: [
              { label: 'Category', field: 'category' },
              { label: 'PO Count', field: 'poCount' },
              { label: 'Total Spend (PKR)', field: 'totalSpend' },
              { label: '% of Total', field: 'pctOfTotal' },
            ],
          },
        },
        {
          id: 'spend-by-month', type: 'table', order: 3, visible: true,
          config: {
            dataKey: 'byMonth',
            columns: [
              { label: 'Month', field: 'monthLabel' },
              { label: 'PO Count', field: 'poCount' },
              { label: 'Total Spend (PKR)', field: 'totalSpend' },
            ],
          },
        },
      ];

    case 'grn_report':
      return [
        {
          id: 'grn-summary', type: 'key_value', order: 1, visible: true,
          config: {
            fields: [
              { label: 'Period', field: 'periodLabel' },
              { label: 'Total GRNs', field: 'totalGRNs' },
              { label: 'Total Received Qty', field: 'totalReceivedQty' },
              { label: 'Total Rejected Qty', field: 'totalRejectedQty' },
              { label: 'Verified GRNs', field: 'verifiedCount' },
            ],
          },
        },
        {
          id: 'grn-table', type: 'table', order: 2, visible: true,
          config: {
            dataKey: 'grns',
            columns: [
              { label: 'GRN Number', field: 'grnNumber' },
              { label: 'PO Number', field: 'poNumber' },
              { label: 'Vendor', field: 'vendorName' },
              { label: 'Received Date', field: 'receivedDateLabel' },
              { label: 'Received Qty', field: 'receivedQty' },
              { label: 'Rejected Qty', field: 'rejectedQty' },
              { label: 'Verified', field: 'verifiedLabel' },
              { label: 'Receipt Type', field: 'receiptType' },
            ],
          },
        },
      ];

    case 'asset_register':
      return [
        {
          id: 'asset-summary', type: 'key_value', order: 1, visible: true,
          config: {
            fields: [
              { label: 'Period', field: 'periodLabel' },
              { label: 'Total Assets', field: 'totalAssets' },
              { label: 'Total Value (PKR)', field: 'totalValue' },
            ],
          },
        },
        {
          id: 'asset-table', type: 'table', order: 2, visible: true,
          config: {
            dataKey: 'assets',
            columns: [
              { label: 'Tag', field: 'tag' },
              { label: 'Name', field: 'name' },
              { label: 'Category', field: 'category' },
              { label: 'Campus', field: 'campusName' },
              { label: 'Price (PKR)', field: 'price' },
              { label: 'Purchase Date', field: 'purchaseDateLabel' },
              { label: 'Condition', field: 'condition' },
              { label: 'Status', field: 'status' },
              { label: 'Depreciation', field: 'depreciation' },
            ],
          },
        },
      ];

    case 'inventory_valuation':
      return [
        {
          id: 'inventory-summary', type: 'key_value', order: 1, visible: true,
          config: {
            fields: [
              { label: 'As Of', field: 'periodLabel' },
              { label: 'Total Items', field: 'totalItems' },
              { label: 'Total Valuation (PKR)', field: 'totalValue' },
            ],
          },
        },
        {
          id: 'valuation-by-category', type: 'table', order: 2, visible: true,
          config: {
            dataKey: 'byCategory',
            columns: [
              { label: 'Category', field: 'category' },
              { label: 'Item Count', field: 'itemCount' },
              { label: 'Total Value (PKR)', field: 'totalValue' },
            ],
          },
        },
        {
          id: 'inventory-items', type: 'table', order: 3, visible: true,
          config: {
            dataKey: 'items',
            columns: [
              { label: 'Code', field: 'code' },
              { label: 'Name', field: 'name' },
              { label: 'Category', field: 'category' },
              { label: 'Stock', field: 'currentStock' },
              { label: 'Unit', field: 'unit' },
              { label: 'Unit Cost (PKR)', field: 'unitCost' },
              { label: 'Total Value (PKR)', field: 'totalValue' },
              { label: 'Status', field: 'status' },
            ],
          },
        },
      ];

    case 'budget_vs_actual':
      return [
        {
          id: 'budget-summary', type: 'key_value', order: 1, visible: true,
          config: {
            fields: [
              { label: 'Period', field: 'periodLabel' },
              { label: 'Total Allocated (PKR)', field: 'totalAllocated' },
              { label: 'Total Actual Spend (PKR)', field: 'totalActual' },
              { label: 'Total Variance (PKR)', field: 'totalVariance' },
              { label: 'Variance %', field: 'variancePct' },
            ],
          },
        },
        {
          id: 'budget-lines', type: 'table', order: 2, visible: true,
          config: {
            dataKey: 'lines',
            columns: [
              { label: 'Budget', field: 'budgetName' },
              { label: 'Category', field: 'category' },
              { label: 'Allocated (PKR)', field: 'allocated' },
              { label: 'Actual (PKR)', field: 'actual' },
              { label: 'Variance (PKR)', field: 'variance' },
              { label: 'Variance %', field: 'variancePctLabel' },
              { label: 'Status', field: 'statusLabel' },
            ],
          },
        },
      ];

    default:
      return [];
  }
}
