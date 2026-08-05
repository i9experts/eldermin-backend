// ============================================================
// LEDGER / ACCOUNTING FOUNDATION — Eldermin ERP | NestJS + MongoDB
// Phase 1 of the Odoo-standard finance rebuild: fiscal years, periods,
// cost centers, payment terms, and the double-entry journal engine that
// every money-moving transaction (fee, payroll, expense, advance) posts
// through. See claude/finance-module-odoo-standard-build-plan.md.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// FISCAL YEAR
// ============================================================
export type FiscalYearDocument = FiscalYear & Document;

@Schema({ timestamps: true, collection: 'fiscal_years' })
export class FiscalYear {
  @Prop({ required: true }) name: string; // e.g. "FY 2025-26"
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: false }) isClosed: boolean; // year-end close performed
  @Prop() closedAt: Date;
  @Prop() closedBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const FiscalYearSchema = SchemaFactory.createForClass(FiscalYear);
FiscalYearSchema.index({ schoolSlug: 1, startDate: 1 });

// ============================================================
// ACCOUNTING PERIOD (month-level, lockable — standard audit control so
// closed periods can't be silently back-posted into)
// ============================================================
export type AccountingPeriodDocument = AccountingPeriod & Document;

@Schema({ timestamps: true, collection: 'accounting_periods' })
export class AccountingPeriod {
  @Prop({ type: Types.ObjectId, ref: 'FiscalYear', required: true }) fiscalYearId: Types.ObjectId;
  @Prop({ required: true }) name: string; // e.g. "January 2026"
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;
  @Prop({ enum: ['open', 'closed', 'locked'], default: 'open' }) status: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const AccountingPeriodSchema = SchemaFactory.createForClass(AccountingPeriod);
AccountingPeriodSchema.index({ schoolSlug: 1, startDate: 1 }, { unique: true });

// ============================================================
// COST CENTER (hierarchical; mapped onto Campus/Department initially so
// it's usable immediately without a separate setup step)
// ============================================================
export type CostCenterDocument = CostCenter & Document;

@Schema({ timestamps: true, collection: 'cost_centers' })
export class CostCenter {
  @Prop({ required: true }) code: string;
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['campus', 'department', 'other'], default: 'other' }) type: string;
  @Prop({ type: Types.ObjectId, ref: 'CostCenter', default: null }) parentId: Types.ObjectId | null;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const CostCenterSchema = SchemaFactory.createForClass(CostCenter);
CostCenterSchema.index({ schoolSlug: 1, code: 1 }, { unique: true });

// ============================================================
// PAYMENT TERM (Due on Receipt, Net 15, Net 30, ...)
// ============================================================
export type PaymentTermDocument = PaymentTerm & Document;

@Schema({ timestamps: true, collection: 'payment_terms' })
export class PaymentTerm {
  @Prop({ required: true }) name: string;
  @Prop({ default: 0 }) dueDays: number; // 0 = due on receipt
  @Prop() description: string;
  @Prop({ default: false }) isDefault: boolean;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const PaymentTermSchema = SchemaFactory.createForClass(PaymentTerm);

// ============================================================
// JOURNAL ENTRY (the double-entry engine — every posting in the system
// ultimately becomes one of these). Lines must sum debit === credit;
// enforced in FinanceService.postJournalEntry, not just trusted here.
// ============================================================
export type JournalEntryDocument = JournalEntry & Document;

@Schema({ _id: false })
export class JournalLine {
  @Prop({ required: true }) accountCode: string;
  @Prop({ required: true }) accountName: string;
  @Prop({ type: Types.ObjectId, ref: 'CostCenter', default: null }) costCenterId: Types.ObjectId | null;
  @Prop() costCenterName: string;
  @Prop({ default: 0 }) debit: number;
  @Prop({ default: 0 }) credit: number;
  // Subledger dimension — lets Student/Parent Ledger and Supplier Ledger
  // be derived from the same journal data instead of separate tables.
  @Prop({ type: String, enum: ['student', 'family', 'vendor', 'staff', null], default: null }) partnerType: string | null;
  @Prop() partnerId: string;
  @Prop() partnerName: string;
  @Prop({ default: false }) isUnmapped: boolean; // posted to the Suspense account because no real mapping existed yet
  // Phase 3 — denormalized TaxTemplate/WithholdingTaxCategory name, set only
  // on the tax leg of a posting, so getTaxSummaryReport can group by tax
  // template without a second lookup (same pattern as costCenterName/partnerName).
  @Prop() taxTemplateName: string;
}
const JournalLineSchema = SchemaFactory.createForClass(JournalLine);

@Schema({ timestamps: true, collection: 'journal_entries' })
export class JournalEntry {
  @Prop({ required: true }) entryNo: string; // e.g. JE-2026-0001
  @Prop({ required: true }) date: Date;
  @Prop({ type: Types.ObjectId, ref: 'AccountingPeriod' }) periodId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'FiscalYear' }) fiscalYearId: Types.ObjectId;
  @Prop() reference: string;
  @Prop() narration: string;
  // Where this entry came from — every auto-posting hook tags its source so
  // a posting can always be traced back to the transaction that caused it.
  @Prop({ enum: ['fee_invoice', 'fee_payment', 'expense', 'payroll', 'expense_claim', 'advance', 'vendor_bill', 'vendor_payment', 'manual'], required: true })
  sourceType: string;
  @Prop() sourceId: string;
  @Prop({ type: [JournalLineSchema], default: [] }) lines: JournalLine[];
  @Prop({ required: true }) totalDebit: number;
  @Prop({ required: true }) totalCredit: number;
  @Prop({ enum: ['draft', 'posted', 'reversed'], default: 'posted' }) status: string;
  @Prop() postedBy: string;
  @Prop() postedAt: Date;
  @Prop({ default: false }) isTemplate: boolean; // saved as a reusable template (recurring accruals etc.)
  @Prop() templateName: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const JournalEntrySchema = SchemaFactory.createForClass(JournalEntry);
JournalEntrySchema.index({ schoolSlug: 1, date: -1 });
JournalEntrySchema.index({ schoolSlug: 1, sourceType: 1, sourceId: 1 });
JournalEntrySchema.pre('validate', function () {
  if (this.isNew && !this.entryNo) {
    const year = new Date().getFullYear();
    const rand = Math.floor(10000 + Math.random() * 90000);
    this.entryNo = `JE-${year}-${rand}`;
  }
});
