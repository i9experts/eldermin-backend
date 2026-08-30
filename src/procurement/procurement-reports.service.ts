// ============================================================
// PROCUREMENT REPORTS SERVICE — Eldermin ERP | NestJS + MongoDB
//
// Real aggregation behind the 8 Procurement → Reports cards (previously
// entirely fake — see procurement/index.tsx's ReportsTab in the frontend).
// Each `get<Report>Data` method below returns a plain `data` object shaped
// for PdfService.generateFromTemplate's contract: top-level fields for a
// `key_value` summary section, plus one or more array fields (matching a
// `table` section's `dataKey`) for the detailed row tables — see
// procurement-report-sections.ts for the exact field/column contract each
// report's data must satisfy, and PdfService.buildSectionHtml for how a
// template consumes it.
//
// generateReportBuffer is the single choke point both the on-demand
// GET .../export endpoint AND the daily @Cron sweep (runDueScheduledReports)
// call — aggregation + rendering logic lives here exactly once.
// ============================================================

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as XLSX from 'xlsx';
import {
  Vendor, VendorDocument,
  PurchaseRequest, PurchaseRequestDocument,
  PurchaseOrder, PurchaseOrderDocument,
  GRN, GRNDocument,
  InventoryItem, InventoryItemDocument,
} from './procurement.schema';
import { Asset, AssetDocument } from './asset.schema';
import { ScheduledReport, ScheduledReportDocument } from './procurement-reports.schema';
import { PdfService } from '../pdf/pdf.service';
import { EmailService } from '../email/email.service';
import { PROCUREMENT_REPORT_TITLES } from '../modules/report-templates/procurement-report-sections';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

/** GET /procurement/reports/<key> path segment -> ReportTemplate `type`
 *  enum value (see REPORT_TEMPLATE_TYPES in report-template.schema.ts). */
const REPORT_KEY_TO_TYPE: Record<string, string> = {
  'procurement-summary': 'procurement_summary',
  'vendor-performance': 'vendor_performance',
  'requisition-status': 'requisition_status',
  'spend-analysis': 'spend_analysis',
  'grn-report': 'grn_report',
  'asset-register': 'asset_register',
  'inventory-valuation': 'inventory_valuation',
  'budget-vs-actual': 'budget_vs_actual',
};

interface ReportFilters {
  from?: string;
  to?: string;
  campusId?: string;
}

function dateRangeMatch(filters: ReportFilters, field = 'createdAt'): any {
  const range: any = {};
  if (filters.from) range.$gte = new Date(filters.from);
  if (filters.to) {
    const to = new Date(filters.to);
    to.setHours(23, 59, 59, 999);
    range.$lte = to;
  }
  return Object.keys(range).length ? { [field]: range } : {};
}

function periodLabel(filters: ReportFilters): string {
  if (filters.from && filters.to) return `${filters.from} to ${filters.to}`;
  if (filters.from) return `From ${filters.from}`;
  if (filters.to) return `Up to ${filters.to}`;
  return 'All Time';
}

function fmtDate(d?: Date | string): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB');
}

@Injectable()
export class ProcurementReportsService {
  private logger = new Logger('ProcurementReportsService');

  constructor(
    @InjectModel(Vendor.name) private vendorModel: Model<VendorDocument>,
    @InjectModel(PurchaseRequest.name) private prModel: Model<PurchaseRequestDocument>,
    @InjectModel(PurchaseOrder.name) private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(GRN.name) private grnModel: Model<GRNDocument>,
    @InjectModel(InventoryItem.name) private inventoryModel: Model<InventoryItemDocument>,
    @InjectModel(Asset.name) private assetModel: Model<AssetDocument>,
    @InjectModel('Budget') private budgetModel: Model<any>,
    @InjectModel('Campus') private campusModel: Model<any>,
    @InjectModel(ScheduledReport.name) private scheduledReportModel: Model<ScheduledReportDocument>,
    private pdfService: PdfService,
    private emailService: EmailService,
  ) {}

  // ── shared campus-name lookup ────────────────────────────────
  private async campusNameMap(schoolSlug: string): Promise<Map<string, string>> {
    const campuses = await this.campusModel.find({ schoolSlug }).select('name').lean();
    const map = new Map<string, string>();
    for (const c of campuses) map.set(String(c._id), (c as any).name);
    return map;
  }

  // ============================================================
  // 1. PROCUREMENT SUMMARY
  // ============================================================
  async getProcurementSummaryData(schoolSlug: string, filters: ReportFilters) {
    const poBase: any = { schoolSlug, ...dateRangeMatch(filters, 'orderDate') };
    if (filters.campusId) poBase.campusId = filters.campusId;
    const prBase: any = { schoolSlug, ...dateRangeMatch(filters) };
    if (filters.campusId) prBase.campusId = filters.campusId;

    const [totalPRs, totalPOs, activeVendors, totalSpendAgg, pendingPaymentsAgg, byCategory, byVendor] = await Promise.all([
      this.prModel.countDocuments(prBase),
      this.poModel.countDocuments(poBase),
      this.vendorModel.countDocuments({ schoolSlug, status: 'active' }),
      this.poModel.aggregate([{ $match: poBase }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      this.poModel.aggregate([
        { $match: { ...poBase, isPaid: false } },
        { $group: { _id: null, total: { $sum: '$balanceDue' } } },
      ]),
      this.poModel.aggregate([
        { $match: poBase },
        { $group: { _id: '$category', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
      this.poModel.aggregate([
        { $match: poBase },
        { $group: { _id: '$vendorName', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const totalSpend = totalSpendAgg[0]?.total || 0;

    return {
      documentNumber: `PS-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString('en-GB'),
      periodLabel: periodLabel(filters),
      totalPRs, totalPOs, activeVendors,
      totalSpend,
      pendingPayments: pendingPaymentsAgg[0]?.total || 0,
      avgPOValue: totalPOs > 0 ? Math.round(totalSpend / totalPOs) : 0,
      topCategories: byCategory.map((c) => ({ category: c._id || 'Uncategorized', poCount: c.count, totalSpend: c.total })),
      topVendors: byVendor.map((v) => ({ name: v._id || 'Unknown Vendor', poCount: v.count, totalSpend: v.total })),
    };
  }

  // ============================================================
  // 2. VENDOR PERFORMANCE
  // ============================================================
  async getVendorPerformanceData(schoolSlug: string, filters: ReportFilters) {
    const poBase: any = { schoolSlug, ...dateRangeMatch(filters, 'orderDate') };
    if (filters.campusId) poBase.campusId = filters.campusId;

    const [vendors, spendByVendor] = await Promise.all([
      this.vendorModel.find({ schoolSlug }).sort({ totalPurchased: -1 }).lean(),
      this.poModel.aggregate([
        { $match: poBase },
        { $group: { _id: '$vendorId', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
    ]);

    const spendMap = new Map<string, { total: number; count: number }>();
    for (const s of spendByVendor) spendMap.set(String(s._id), { total: s.total, count: s.count });

    // On-time-delivery is genuinely NOT derivable from what's stored — PO
    // carries expectedDeliveryDate but GRN.receivedDate is per-GRN, not
    // linked back to a per-line "was this batch on time" flag, and a
    // vendor's overall on-time rate would require reconciling every GRN
    // against every PO's expected date with no reliable 1:1 mapping when a
    // PO is split across multiple GRNs. Using real, honestly-derivable
    // figures instead: order count, spend, outstanding balance, and the
    // vendor's own manually-set rating — not a fabricated metric.
    const rows = vendors
      .map((v: any) => {
        const s = spendMap.get(String(v._id)) || { total: 0, count: 0 };
        return {
          name: v.name, category: v.category || '', rating: v.rating || 0,
          poCount: s.count, totalSpend: s.total,
          outstandingBalance: v.outstandingBalance || 0, status: v.status,
        };
      })
      .filter((v) => v.poCount > 0 || !filters.from) // when a period is set, only show vendors active in it
      .sort((a, b) => b.totalSpend - a.totalSpend);

    return {
      documentNumber: `VP-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString('en-GB'),
      periodLabel: periodLabel(filters),
      totalVendors: rows.length,
      totalSpend: rows.reduce((a, r) => a + r.totalSpend, 0),
      vendors: rows,
    };
  }

  // ============================================================
  // 3. REQUISITION STATUS
  // ============================================================
  async getRequisitionStatusData(schoolSlug: string, filters: ReportFilters) {
    const base: any = { schoolSlug, ...dateRangeMatch(filters) };
    if (filters.campusId) base.campusId = filters.campusId;

    const [byStatus, requisitions] = await Promise.all([
      this.prModel.aggregate([
        { $match: base },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$estimatedTotal' } } },
      ]),
      this.prModel.find(base).sort({ createdAt: -1 }).limit(500).lean(),
    ]);

    const counts: Record<string, number> = {};
    let totalValue = 0;
    for (const s of byStatus) { counts[s._id] = s.count; totalValue += s.total || 0; }

    return {
      documentNumber: `RS-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString('en-GB'),
      periodLabel: periodLabel(filters),
      draftCount: counts.draft || 0,
      submittedCount: (counts.submitted || 0) + (counts.under_review || 0),
      approvedCount: counts.approved || 0,
      rejectedCount: counts.rejected || 0,
      poRaisedCount: counts.po_raised || 0,
      completedCount: counts.completed || 0,
      cancelledCount: counts.cancelled || 0,
      totalValue,
      requisitions: requisitions.map((r: any) => ({
        prNumber: r.prNumber, title: r.title, category: r.category, priority: r.priority,
        status: r.status, estimatedTotal: r.estimatedTotal || 0,
        requestedBy: r.requestedBy, createdAtLabel: fmtDate(r.createdAt),
      })),
    };
  }

  // ============================================================
  // 4. SPEND ANALYSIS
  // ============================================================
  async getSpendAnalysisData(schoolSlug: string, filters: ReportFilters) {
    const base: any = { schoolSlug, ...dateRangeMatch(filters, 'orderDate') };
    if (filters.campusId) base.campusId = filters.campusId;

    const [byCategory, byMonth] = await Promise.all([
      this.poModel.aggregate([
        { $match: base },
        { $group: { _id: '$category', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      this.poModel.aggregate([
        { $match: base },
        {
          $group: {
            _id: { y: { $year: '$orderDate' }, m: { $month: '$orderDate' } },
            total: { $sum: '$totalAmount' }, count: { $sum: 1 },
          },
        },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]),
    ]);

    const totalSpend = byCategory.reduce((a, c) => a + c.total, 0);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return {
      documentNumber: `SA-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString('en-GB'),
      periodLabel: periodLabel(filters),
      totalSpend, totalPOs: byCategory.reduce((a, c) => a + c.count, 0),
      byCategory: byCategory.map((c) => ({
        category: c._id || 'Uncategorized', poCount: c.count, totalSpend: c.total,
        pctOfTotal: totalSpend > 0 ? `${((c.total / totalSpend) * 100).toFixed(1)}%` : '0%',
      })),
      byMonth: byMonth.map((m) => ({
        monthLabel: `${monthNames[m._id.m - 1]} ${m._id.y}`, poCount: m.count, totalSpend: m.total,
      })),
    };
  }

  // ============================================================
  // 5. GRN REPORT
  // ============================================================
  async getGrnReportData(schoolSlug: string, filters: ReportFilters) {
    const base: any = { schoolSlug, ...dateRangeMatch(filters, 'receivedDate') };

    const grns = await this.grnModel.find(base).sort({ receivedDate: -1 }).limit(500).lean();

    let totalReceivedQty = 0, totalRejectedQty = 0, verifiedCount = 0;
    const rows = grns.map((g: any) => {
      const receivedQty = (g.items || []).reduce((a: number, i: any) => a + (i.receivedQuantity || 0), 0);
      const rejectedQty = (g.items || []).reduce((a: number, i: any) => a + (i.rejectedQuantity || 0), 0);
      totalReceivedQty += receivedQty;
      totalRejectedQty += rejectedQty;
      if (g.verified) verifiedCount++;
      return {
        grnNumber: g.grnNumber, poNumber: g.poNumber, vendorName: g.vendorName,
        receivedDateLabel: fmtDate(g.receivedDate), receivedQty, rejectedQty,
        verifiedLabel: g.verified ? 'Yes' : 'No', receiptType: g.receiptType,
      };
    });

    return {
      documentNumber: `GR-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString('en-GB'),
      periodLabel: periodLabel(filters),
      totalGRNs: grns.length, totalReceivedQty, totalRejectedQty, verifiedCount,
      grns: rows,
    };
  }

  // ============================================================
  // 6. ASSET REGISTER
  // ============================================================
  async getAssetRegisterData(schoolSlug: string, filters: ReportFilters) {
    const base: any = { schoolSlug };
    if (filters.campusId) base.campusId = filters.campusId;
    if (filters.from || filters.to) Object.assign(base, dateRangeMatch(filters, 'purchaseDate'));

    const [assets, campusNames] = await Promise.all([
      this.assetModel.find(base).sort({ createdAt: -1 }).limit(1000).lean(),
      this.campusNameMap(schoolSlug),
    ]);

    const totalValue = assets.reduce((a, x: any) => a + (x.price || 0), 0);

    return {
      documentNumber: `AR-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString('en-GB'),
      periodLabel: periodLabel(filters) === 'All Time' ? `As of ${new Date().toLocaleDateString('en-GB')}` : periodLabel(filters),
      totalAssets: assets.length, totalValue,
      assets: assets.map((a: any) => ({
        tag: a.tag, name: a.name, category: a.category,
        campusName: campusNames.get(String(a.campusId)) || a.campusId || 'Unassigned',
        price: a.price || 0, purchaseDateLabel: fmtDate(a.purchaseDate),
        condition: a.condition, status: a.status, depreciation: a.depreciation || '',
      })),
    };
  }

  // ============================================================
  // 7. INVENTORY VALUATION
  // ============================================================
  async getInventoryValuationData(schoolSlug: string, filters: ReportFilters) {
    const base: any = { schoolSlug };
    if (filters.campusId) base.campusId = filters.campusId;

    const [items, byCategory] = await Promise.all([
      this.inventoryModel.find(base).sort({ category: 1, name: 1 }).limit(1000).lean(),
      this.inventoryModel.aggregate([
        { $match: base },
        { $group: { _id: '$category', itemCount: { $sum: 1 }, totalValue: { $sum: '$totalValue' } } },
        { $sort: { totalValue: -1 } },
      ]),
    ]);

    const totalValue = byCategory.reduce((a, c) => a + (c.totalValue || 0), 0);

    return {
      documentNumber: `IV-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString('en-GB'),
      periodLabel: `As of ${new Date().toLocaleDateString('en-GB')}`,
      totalItems: items.length, totalValue,
      byCategory: byCategory.map((c) => ({ category: c._id || 'Uncategorized', itemCount: c.itemCount, totalValue: c.totalValue || 0 })),
      items: items.map((i: any) => ({
        code: i.code, name: i.name, category: i.category, currentStock: i.currentStock,
        unit: i.unit || '', unitCost: i.unitCost || 0, totalValue: i.totalValue || 0, status: i.status,
      })),
    };
  }

  // ============================================================
  // 8. BUDGET VS ACTUAL
  // Reads Finance's real Budget model read-only (same cross-module read
  // precedent PdfModule already establishes for Invoice/Payment/Expense) —
  // never writes to it. Actual spend = sum of PurchaseOrder.totalAmount for
  // orders that are a real committed/paid order (sent onward — not draft/
  // cancelled), matched to each budget line's category and, when set, the
  // budget's own campus.
  // ============================================================
  async getBudgetVsActualData(schoolSlug: string, filters: ReportFilters) {
    const budgetBase: any = { schoolSlug, status: { $in: ['approved', 'active'] } };
    if (filters.campusId) budgetBase.campusId = filters.campusId;

    const budgets = await this.budgetModel.find(budgetBase).lean();

    const poCommittedStatuses = ['sent', 'acknowledged', 'partially_received', 'fully_received', 'invoiced', 'paid'];
    const lines: any[] = [];
    let totalAllocated = 0, totalActual = 0;

    for (const budget of budgets) {
      for (const line of budget.lines || []) {
        const poMatch: any = {
          schoolSlug, category: line.category, status: { $in: poCommittedStatuses },
        };
        if (budget.campusId) poMatch.campusId = budget.campusId;
        if (filters.from || filters.to) Object.assign(poMatch, dateRangeMatch(filters, 'orderDate'));

        const actualAgg = await this.poModel.aggregate([
          { $match: poMatch },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]);
        const actual = actualAgg[0]?.total || 0;
        const allocated = line.allocatedAmount || 0;
        const variance = allocated - actual;
        const variancePct = allocated > 0 ? (variance / allocated) * 100 : 0;

        totalAllocated += allocated;
        totalActual += actual;

        lines.push({
          budgetName: budget.name, category: line.category,
          allocated, actual, variance,
          variancePctLabel: `${variancePct.toFixed(1)}%`,
          statusLabel: variance >= 0 ? 'Under Budget' : 'Over Budget',
        });
      }
    }

    const totalVariance = totalAllocated - totalActual;

    return {
      documentNumber: `BA-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString('en-GB'),
      periodLabel: periodLabel(filters),
      totalAllocated, totalActual, totalVariance,
      variancePct: totalAllocated > 0 ? `${((totalVariance / totalAllocated) * 100).toFixed(1)}%` : '0%',
      lines,
    };
  }

  // ============================================================
  // DISPATCH — one entry point per report key, used by both the on-demand
  // data/export endpoints and the scheduled-report cron sweep.
  // ============================================================
  async getReportData(schoolSlug: string, key: string, filters: ReportFilters) {
    switch (key) {
      case 'procurement-summary': return this.getProcurementSummaryData(schoolSlug, filters);
      case 'vendor-performance': return this.getVendorPerformanceData(schoolSlug, filters);
      case 'requisition-status': return this.getRequisitionStatusData(schoolSlug, filters);
      case 'spend-analysis': return this.getSpendAnalysisData(schoolSlug, filters);
      case 'grn-report': return this.getGrnReportData(schoolSlug, filters);
      case 'asset-register': return this.getAssetRegisterData(schoolSlug, filters);
      case 'inventory-valuation': return this.getInventoryValuationData(schoolSlug, filters);
      case 'budget-vs-actual': return this.getBudgetVsActualData(schoolSlug, filters);
      default: throw new NotFoundException(`Unknown report: ${key}`);
    }
  }

  // ── Excel/CSV export — mirrors syllabus.service.ts's XLSX pattern ─────
  private tableFieldsForKey(key: string): { arrayKeys: string[]; summaryFields: string[] } {
    // One or more array fields per report (see procurement-report-sections.ts
    // for the authoritative dataKey list) become one sheet each; scalar
    // top-level fields become a "Summary" sheet.
    const map: Record<string, { arrayKeys: string[]; summaryFields: string[] }> = {
      'procurement-summary': {
        arrayKeys: ['topCategories', 'topVendors'],
        summaryFields: ['periodLabel', 'totalPRs', 'totalPOs', 'activeVendors', 'totalSpend', 'pendingPayments', 'avgPOValue'],
      },
      'vendor-performance': { arrayKeys: ['vendors'], summaryFields: ['periodLabel', 'totalVendors', 'totalSpend'] },
      'requisition-status': {
        arrayKeys: ['requisitions'],
        summaryFields: ['periodLabel', 'draftCount', 'submittedCount', 'approvedCount', 'rejectedCount', 'poRaisedCount', 'completedCount', 'cancelledCount', 'totalValue'],
      },
      'spend-analysis': { arrayKeys: ['byCategory', 'byMonth'], summaryFields: ['periodLabel', 'totalSpend', 'totalPOs'] },
      'grn-report': { arrayKeys: ['grns'], summaryFields: ['periodLabel', 'totalGRNs', 'totalReceivedQty', 'totalRejectedQty', 'verifiedCount'] },
      'asset-register': { arrayKeys: ['assets'], summaryFields: ['periodLabel', 'totalAssets', 'totalValue'] },
      'inventory-valuation': { arrayKeys: ['byCategory', 'items'], summaryFields: ['periodLabel', 'totalItems', 'totalValue'] },
      'budget-vs-actual': { arrayKeys: ['lines'], summaryFields: ['periodLabel', 'totalAllocated', 'totalActual', 'totalVariance', 'variancePct'] },
    };
    return map[key];
  }

  private buildWorkbook(key: string, data: any): XLSX.WorkBook {
    const { arrayKeys, summaryFields } = this.tableFieldsForKey(key);
    const wb = XLSX.utils.book_new();

    const summaryRows: any[][] = [[PROCUREMENT_REPORT_TITLES[REPORT_KEY_TO_TYPE[key]] || key], [''], ...summaryFields.map((f) => [f, data[f] ?? ''])];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 28 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    for (const arrayKey of arrayKeys) {
      const rows: any[] = data[arrayKey] || [];
      const sheetName = arrayKey.slice(0, 31);
      if (!rows.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No data']]), sheetName);
        continue;
      }
      const headers = Object.keys(rows[0]);
      const aoa = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ''))];
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      sheet['!cols'] = headers.map(() => ({ wch: 18 }));
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    }

    return wb;
  }

  async generateExcel(schoolSlug: string, key: string, filters: ReportFilters): Promise<Buffer> {
    const data = await this.getReportData(schoolSlug, key, filters);
    const wb = this.buildWorkbook(key, data);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  async generateCsv(schoolSlug: string, key: string, filters: ReportFilters): Promise<Buffer> {
    // CSV has no concept of multiple sheets — export the report's primary
    // (first) table, which is always its most detailed per-record listing.
    const data = await this.getReportData(schoolSlug, key, filters);
    const { arrayKeys } = this.tableFieldsForKey(key);
    const rows: any[] = data[arrayKeys[0]] || [];
    const wb = XLSX.utils.book_new();
    const sheet = rows.length
      ? XLSX.utils.json_to_sheet(rows)
      : XLSX.utils.aoa_to_sheet([['No data']]);
    XLSX.utils.book_append_sheet(wb, sheet, 'Report');
    return XLSX.write(wb, { type: 'buffer', bookType: 'csv' });
  }

  async generatePdf(schoolSlug: string, key: string, filters: ReportFilters, userId?: string): Promise<Buffer> {
    const data = await this.getReportData(schoolSlug, key, filters);
    const type = REPORT_KEY_TO_TYPE[key];
    return this.pdfService.generateFromTemplate(schoolSlug, type, data, userId || 'system');
  }

  /** Single choke point for "give me this report as a file" — used by the
   *  on-demand export endpoint AND the scheduled-report cron sweep below,
   *  so the two paths can never generate different output. */
  async generateReportBuffer(
    schoolSlug: string, key: string, format: 'pdf' | 'excel' | 'csv', filters: ReportFilters, userId?: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const title = PROCUREMENT_REPORT_TITLES[REPORT_KEY_TO_TYPE[key]] || key;
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'excel') {
      return {
        buffer: await this.generateExcel(schoolSlug, key, filters),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${title.replace(/\s+/g, '-')}-${stamp}.xlsx`,
      };
    }
    if (format === 'csv') {
      return {
        buffer: await this.generateCsv(schoolSlug, key, filters),
        contentType: 'text/csv',
        filename: `${title.replace(/\s+/g, '-')}-${stamp}.csv`,
      };
    }
    return {
      buffer: await this.generatePdf(schoolSlug, key, filters, userId),
      contentType: 'application/pdf',
      filename: `${title.replace(/\s+/g, '-')}-${stamp}.pdf`,
    };
  }

  // ============================================================
  // SCHEDULED REPORTS — CRUD
  // ============================================================
  private computeNextRunAt(frequency: string, from: Date = new Date()): Date {
    const next = new Date(from);
    if (frequency === 'daily') next.setDate(next.getDate() + 1);
    else if (frequency === 'weekly') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1); // monthly
    return next;
  }

  async createScheduledReport(schoolSlug: string, data: any, createdBy?: string) {
    if (!PROCUREMENT_REPORT_TITLES[REPORT_KEY_TO_TYPE[data.reportType]]) {
      throw new BadRequestException(`Unknown report type: ${data.reportType}`);
    }
    if (!Array.isArray(data.recipients) || !data.recipients.length) {
      throw new BadRequestException('At least one recipient email is required');
    }
    const reportName = PROCUREMENT_REPORT_TITLES[REPORT_KEY_TO_TYPE[data.reportType]];
    const doc = new this.scheduledReportModel({
      ...data, schoolSlug, reportName, createdBy,
      nextRunAt: this.computeNextRunAt(data.frequency),
    });
    return doc.save();
  }

  async getScheduledReports(schoolSlug: string, query: any = {}) {
    const { page = 1, limit = 20 } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    const [data, total] = await Promise.all([
      this.scheduledReportModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.scheduledReportModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateScheduledReport(id: string, schoolSlug: string, data: any) {
    const update: any = { ...data };
    if (data.frequency) update.nextRunAt = this.computeNextRunAt(data.frequency);
    const doc = await this.scheduledReportModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: update }, { new: true });
    if (!doc) throw new NotFoundException('Scheduled report not found');
    return doc;
  }

  async deleteScheduledReport(id: string, schoolSlug: string) {
    const doc = await this.scheduledReportModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!doc) throw new NotFoundException('Scheduled report not found');
    return { deleted: true };
  }

  async runScheduledReportNow(id: string, schoolSlug: string) {
    const doc = await this.scheduledReportModel.findOne({ _id: id, schoolSlug });
    if (!doc) throw new NotFoundException('Scheduled report not found');
    await this.dispatchScheduledReport(doc);
    return this.scheduledReportModel.findOne({ _id: id, schoolSlug });
  }

  private async dispatchScheduledReport(doc: ScheduledReportDocument) {
    try {
      const filters: ReportFilters = {
        from: doc.filters?.from, to: doc.filters?.to, campusId: doc.filters?.campusId,
      };
      const { buffer, contentType, filename } = await this.generateReportBuffer(
        doc.schoolSlug, doc.reportType, doc.format as any, filters,
      );

      const result = await this.emailService.sendEmailWithAttachment({
        to: doc.recipients,
        subject: `${doc.reportName} — ${new Date().toLocaleDateString('en-GB')}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
            <div style="background:#0C447C;padding:20px;text-align:center">
              <h1 style="color:white;margin:0;font-size:20px">elder<span style="color:#EF9F27">min</span></h1>
            </div>
            <div style="background:white;padding:20px">
              <p>Your scheduled report <strong>${doc.reportName}</strong> is attached (${doc.format.toUpperCase()}).</p>
              <p style="color:#6b7280;font-size:12px">This is an automated delivery from your Procurement report schedule (${doc.frequency}). Manage it under Procurement → Reports.</p>
            </div>
          </div>`,
        attachment: { filename, content: buffer, contentType },
      });

      await this.scheduledReportModel.updateOne(
        { _id: doc._id },
        {
          $set: {
            lastRunAt: new Date(),
            nextRunAt: this.computeNextRunAt(doc.frequency),
            lastRunStatus: result.sent ? 'success' : 'failed',
            lastRunError: result.sent ? '' : result.error,
          },
        },
      );
    } catch (err: any) {
      this.logger.error(`Scheduled report ${doc._id} failed: ${err.message}`);
      await this.scheduledReportModel.updateOne(
        { _id: doc._id },
        { $set: { lastRunAt: new Date(), nextRunAt: this.computeNextRunAt(doc.frequency), lastRunStatus: 'failed', lastRunError: err.message } },
      );
    }
  }

  // Daily sweep — mirrors FeeDefaulterService.runAutomatedReminders' cron
  // pattern (fee-defaulter.service.ts). A schedule's actual cadence (daily/
  // weekly/monthly) is enforced by nextRunAt, computed on every dispatch —
  // this job just asks "what's due since yesterday" once a day.
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async runDueScheduledReports() {
    const due = await this.scheduledReportModel.find({ isActive: true, nextRunAt: { $lte: new Date() } });
    if (!due.length) return;
    this.logger.log(`Dispatching ${due.length} due scheduled Procurement report(s)`);
    for (const doc of due) {
      await this.dispatchScheduledReport(doc);
    }
  }
}
