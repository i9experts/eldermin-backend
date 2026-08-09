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
  // Payment/Receipt Vouchers (see voucher.schema.ts) add 'shareholder' and
  // 'other' — additive, no existing row ever used either value before.
  // Voucher party type 'employee' deliberately posts as 'staff' here (not a
  // separate 'employee' value) so a voucher's subledger entries land in the
  // SAME running balance as payroll/expense-claim/advance postings, which
  // have always used 'staff' — see FinanceService.createVoucher.
  @Prop({ type: String, enum: ['student', 'family', 'vendor', 'staff', 'shareholder', 'other', null], default: null }) partnerType: string | null;
  @Prop() partnerId: string;
  @Prop() partnerName: string;
  @Prop({ default: false }) isUnmapped: boolean; // posted to the Suspense account because no real mapping existed yet
  // Phase 3 — denormalized TaxTemplate/WithholdingTaxCategory name, set only
  // on the tax leg of a posting, so getTaxSummaryReport can group by tax
  // template without a second lookup (same pattern as costCenterName/partnerName).
  @Prop() taxTemplateName: string;
  // Phase 6 — optional link to the specific BankAccount a Cash/Bank line
  // actually hit, so Bank Reconciliation can match this line to a real
  // bank-statement transaction instead of just knowing it hit the generic
  // 1000/1100 GL account. Unset (the common case, since no pre-Phase-6 UI
  // ever collected a bankAccountId) means this line simply isn't
  // auto-linkable and must be matched manually during reconciliation —
  // no different from how reconciliation works everywhere else when data
  // is incomplete. See FinanceService.postJournalEntry.
  @Prop({ type: Types.ObjectId, ref: 'BankAccount', default: null }) bankAccountId: Types.ObjectId | null;
  @Prop() bankAccountName: string;
  // Phase 8 — generalized Accounting Dimensions, additive infrastructure for
  // future use alongside (not replacing) Cost Center above. A plain
  // passthrough array — FinanceService.postJournalEntry only validates that
  // referenced dimension/value IDs exist, no aggregation logic lives here.
  // Empty/unset for every pre-Phase-8 entry and for any school that never
  // configures a dimension beyond Cost Center.
  @Prop({ type: [{
    dimensionId: { type: Types.ObjectId, ref: 'AccountingDimension' },
    dimensionName: String,
    valueId: { type: Types.ObjectId, ref: 'DimensionValue' },
    valueName: String,
  }], default: [] })
  dimensions: { dimensionId: Types.ObjectId; dimensionName: string; valueId: Types.ObjectId; valueName: string }[];
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
  // 'payment_voucher'/'receipt_voucher' — the client-requested quick-entry
  // Payment/Receipt Voucher feature (see voucher.schema.ts). A 'transfer'
  // paymentType voucher also uses 'payment_voucher' (no separate value —
  // it's still a single-account-pair movement, no different in shape).
  @Prop({ enum: ['fee_invoice', 'fee_payment', 'expense', 'payroll', 'expense_claim', 'advance', 'vendor_bill', 'vendor_payment', 'manual', 'year_end_closing', 'payment_voucher', 'receipt_voucher'], required: true })
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

// ============================================================
// OPENING BALANCE — Phase 8. A proper per-fiscal-year ledger of opening
// balances, one row per (schoolSlug, accountCode, fiscalYearId). Chosen
// over simply treating ChartOfAccount.openingBalance (Phase 1) as "the
// balance for whichever year is active" because that flat field can't
// hold more than one year's history — an audit-grade rebuild should not
// lose that. FinanceService.getTrialBalance resolves the fiscal year in
// scope (from `asOf`, or the school's currently active fiscal year) and
// looks up this collection FIRST; if no row is found for that
// (account, fiscalYear) pair it falls back to the flat
// ChartOfAccount.openingBalance field exactly as before Phase 8 — so a
// school that never sets a per-year opening balance sees zero behavior
// change (still defaults to 0 via that field's own default).
// ============================================================
export type OpeningBalanceDocument = OpeningBalance & Document;

@Schema({ timestamps: true, collection: 'opening_balances' })
export class OpeningBalance {
  @Prop({ required: true }) accountCode: string;
  @Prop() accountName: string;
  @Prop({ type: Types.ObjectId, ref: 'FiscalYear', required: true }) fiscalYearId: Types.ObjectId;
  @Prop({ required: true, default: 0 }) amount: number;
  @Prop() postedBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const OpeningBalanceSchema = SchemaFactory.createForClass(OpeningBalance);
OpeningBalanceSchema.index({ schoolSlug: 1, accountCode: 1, fiscalYearId: 1 }, { unique: true });
