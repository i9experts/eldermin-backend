// ============================================================
// PAYMENT / RECEIPT VOUCHER — Eldermin ERP | NestJS + MongoDB
// Client-requested "quick entry" feature, modeled directly on ERPNext's
// "Payment Entry" doctype: ONE unified concept (`PaymentVoucher`) with a
// `paymentType` field (`receive` | `pay` | `transfer`) distinguishing
// direction, rather than two separate schemas — the mechanics (party,
// accounts, tax, cost center, currency) are identical either way and only
// the direction and field defaults differ, exactly like ERPNext.
//
// Every voucher posts through FinanceService.postJournalEntry — the same
// double-entry engine every other transaction in this app uses — so it is
// provably balanced and shows up in Trial Balance / General Ledger /
// Partner Ledger for free, just like fee payments and vendor payments.
//
// "Branch" (client's field #4) and "Cost Center" (client's field #9) are
// deliberately the SAME field here (`costCenterId`/`costCenterName`) — Cost
// Center already represents Campus in this app since Phase 1
// (CostCenter.type: 'campus'), so building two separate dimensions for
// what is structurally one concept would just create a duplicate,
// unreconciled "branch" list. See FinanceService's Voucher section for the
// full write-up.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentVoucherDocument = PaymentVoucher & Document;

@Schema({ timestamps: true, collection: 'payment_vouchers' })
export class PaymentVoucher {
  // 1. Series — auto-generated per paymentType: RV-YYYY-NNNNN (receive),
  // PV-YYYY-NNNNN (pay), JV-YYYY-NNNNN (transfer) — mirrors
  // JournalEntry.entryNo's pre-validate-hook auto-numbering pattern exactly.
  @Prop({ required: true }) voucherNo: string;

  // 3. Payment type
  @Prop({ enum: ['receive', 'pay', 'transfer'], required: true }) paymentType: string;

  // 2. Posting date
  @Prop({ required: true }) postingDate: Date;

  // 4. Branch + 9. Cost center — ONE field, see file-level note above.
  @Prop({ type: Types.ObjectId, ref: 'CostCenter', default: null }) costCenterId: Types.ObjectId | null;
  @Prop() costCenterName: string;

  // 5. Payment from/to (party type) + 6. Party/vendor
  @Prop({ enum: ['student', 'family', 'employee', 'vendor', 'shareholder', 'other'], required: true })
  partyType: string;
  // Free string for employee/shareholder/other (no backing collection in
  // this app — see file-level note in finance.service.ts's Voucher
  // section); ObjectId-as-string for student/family/vendor, resolved and
  // denormalized server-side exactly like Invoice.studentId/studentName.
  @Prop() partyId: string;
  @Prop({ required: true }) partyName: string;

  // 7. Accounts — Account paid to / Account paid from (denormalized, same
  // pattern as every other line in this ledger), Account currency, Amount,
  // Party Balance (snapshotted at creation, not live — see below).
  //
  // Item 41 — field names kept as paidFrom/paidToAccountCode (renaming
  // would be a data migration, not a labeling fix), but in accounting
  // terms: paidFromAccountCode is the account CREDITED (money left it) and
  // paidToAccountCode is the account DEBITED (money landed in it) — see
  // createVoucher below, which always posts Dr paidToAccountCode / Cr
  // paidFromAccountCode. The frontend now labels these "Credit Account"
  // and "Debit Account" accordingly.
  @Prop({ required: true }) paidFromAccountCode: string;
  @Prop({ required: true }) paidFromAccountName: string;
  @Prop({ required: true }) paidToAccountCode: string;
  @Prop({ required: true }) paidToAccountName: string;
  @Prop({ required: true }) currencyCode: string;
  @Prop({ default: 1 }) exchangeRate: number;
  @Prop({ required: true }) paidAmount: number; // in currencyCode
  @Prop({ required: true }) receivedAmount: number; // base-currency equivalent (paidAmount * exchangeRate)
  // Snapshot of the party's running balance (from getPartnerLedger) at the
  // moment this voucher was created — a voucher, once posted, should show
  // what the balance WAS at that point in history, not a live-recomputed
  // value that would drift as later transactions post. Standard accounting
  // practice (mirrors how a printed receipt never changes after issuance).
  @Prop({ default: 0 }) partyBalanceBefore: number;

  // 8. Taxes and charges
  @Prop({ type: Types.ObjectId, ref: 'TaxTemplate', default: null }) taxTemplateId: Types.ObjectId | null;
  @Prop() taxTemplateName: string;
  @Prop({ default: 0 }) taxAmount: number;

  @Prop() referenceNumber: string;
  @Prop() referenceDate: Date;
  @Prop() remarks: string;

  // Posts immediately on creation (no draft-then-submit workflow), matching
  // this app's existing convention (createInvoice/recordPayment/
  // createVendorBill all post immediately). Cancellation reverses the
  // journal entry rather than deleting anything — accounting records are
  // never deleted.
  @Prop({ enum: ['posted', 'cancelled'], default: 'posted' }) status: string;

  @Prop({ type: Types.ObjectId, ref: 'JournalEntry', default: null }) journalEntryId: Types.ObjectId | null;
  // Set when cancelVoucher posts a reversing entry, so the reversal is
  // traceable from the voucher just like the original posting is.
  @Prop({ type: Types.ObjectId, ref: 'JournalEntry', default: null }) reversalJournalEntryId: Types.ObjectId | null;

  @Prop() postedBy?: string;
  @Prop() cancelledBy?: string;
  @Prop() cancelledAt: Date;

  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const PaymentVoucherSchema = SchemaFactory.createForClass(PaymentVoucher);
PaymentVoucherSchema.index({ schoolSlug: 1, voucherNo: 1 }, { unique: true });
PaymentVoucherSchema.index({ schoolSlug: 1, postingDate: -1 });
PaymentVoucherSchema.index({ schoolSlug: 1, partyType: 1, partyId: 1 });
PaymentVoucherSchema.pre('validate', function () {
  if (this.isNew && !this.voucherNo) {
    const year = new Date().getFullYear();
    const rand = Math.floor(10000 + Math.random() * 90000);
    const prefix = this.paymentType === 'receive' ? 'RV' : this.paymentType === 'pay' ? 'PV' : 'JV';
    this.voucherNo = `${prefix}-${year}-${rand}`;
  }
});
