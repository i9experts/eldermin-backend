// ============================================================
// SCHEDULED REPORT — recurring Procurement report delivery.
// Eldermin ERP | NestJS + MongoDB
//
// A school configures "email me the Spend Analysis report every Monday, as
// a PDF, to these 3 addresses" once here; ProcurementReportsService's daily
// @Cron sweep (see runDueScheduledReports there) finds due rows, regenerates
// the report fresh (via the exact same aggregation + rendering path the
// on-demand Generate button uses — see generateReportBuffer), and emails it
// as an attachment.
//
// Same tenancy convention as every other schema in this module —
// `schoolSlug: string`, not a tenantId/institutionId ObjectId.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ScheduledReportDocument = ScheduledReport & Document;

export const PROCUREMENT_REPORT_KEYS = [
  'procurement-summary',
  'vendor-performance',
  'requisition-status',
  'spend-analysis',
  'grn-report',
  'asset-register',
  'inventory-valuation',
  'budget-vs-actual',
] as const;

@Schema({ _id: false })
class ScheduledReportFilters {
  @Prop() from: string;
  @Prop() to: string;
  @Prop() campusId: string;
}
const ScheduledReportFiltersSchema = SchemaFactory.createForClass(ScheduledReportFilters);

@Schema({ timestamps: true, collection: 'procurement_scheduled_reports' })
export class ScheduledReport {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, enum: PROCUREMENT_REPORT_KEYS }) reportType: string;
  // Kept alongside reportType for display without re-deriving a label from
  // the key on every list render (same denormalization convention as
  // PurchaseOrder.vendorName next to vendorId elsewhere in this module).
  @Prop() reportName: string;

  @Prop({ enum: ['daily', 'weekly', 'monthly'], required: true }) frequency: string;
  @Prop({ type: [String], required: true }) recipients: string[];
  @Prop({ enum: ['pdf', 'excel', 'csv'], default: 'pdf' }) format: string;

  @Prop({ type: ScheduledReportFiltersSchema, default: () => ({}) })
  filters: ScheduledReportFilters;

  @Prop({ default: true }) isActive: boolean;
  @Prop() lastRunAt: Date;
  @Prop() nextRunAt: Date;
  @Prop() createdBy: string;

  @Prop() lastRunStatus: string; // 'success' | 'failed'
  @Prop() lastRunError: string;
}

export const ScheduledReportSchema = SchemaFactory.createForClass(ScheduledReport);
ScheduledReportSchema.index({ schoolSlug: 1, isActive: 1 });
ScheduledReportSchema.index({ nextRunAt: 1, isActive: 1 });
