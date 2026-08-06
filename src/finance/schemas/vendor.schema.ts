// ============================================================
// VENDOR / ACCOUNTS PAYABLE — Eldermin ERP | NestJS + MongoDB
// Phase 2 of the Odoo-standard finance rebuild: a proper vendor master +
// formal vendor bill (with terms and multi-line account coding) + vendor
// payment (with partial-payment allocation), separate from the existing
// simple Expense spend-log. See
// claude/finance-module-odoo-standard-build-plan.md.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// VENDOR (Supplier master)
// ============================================================
export type VendorDocument = Vendor & Document;

@Schema({ timestamps: true, collection: 'vendors' })
export class Vendor {
  @Prop({ required: true }) name: string;
  @Prop() contactPerson: string;
  @Prop() phone: string;
  @Prop() email: string;
  @Prop() address: string;
  @Prop() taxId: string; // NTN / STRN etc.
  @Prop({ type: Types.ObjectId, ref: 'PaymentTerm', default: null }) paymentTermId: Types.ObjectId | null;
  @Prop() defaultExpenseAccountCode: string; // which COA expense/asset account this vendor's bills usually hit
  // Phase 3 — tags this vendor as subject to withholding tax on every bill
  // payment (Pakistan's withholding-at-source regime). Optional: a vendor
  // with no category set behaves exactly as before (no withholding).
  @Prop({ type: Types.ObjectId, ref: 'WithholdingTaxCategory', default: null }) withholdingCategoryId: Types.ObjectId | null;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const VendorSchema = SchemaFactory.createForClass(Vendor);
VendorSchema.index({ schoolSlug: 1, name: 1 });

// ============================================================
// VENDOR BILL — the formal AP document. Unlike the simple Expense
// spend-log, a bill can carry multiple lines hitting different GL
// accounts, has real payment terms (dueDate), and supports partial
// payment across time via VendorPayment below.
// ============================================================
export type VendorBillDocument = VendorBill & Document;

@Schema({ _id: false })
class VendorBillLine {
  @Prop({ required: true }) description: string;
  @Prop({ required: true }) accountCode: string;
  @Prop() costCenterName: string;
  @Prop({ required: true }) amount: number;
}
const VendorBillLineSchema = SchemaFactory.createForClass(VendorBillLine);

@Schema({ timestamps: true, collection: 'vendor_bills' })
export class VendorBill {
  @Prop({ required: true }) billNo: string; // e.g. BILL-2026-12345
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true }) vendorId: Types.ObjectId;
  @Prop({ required: true }) vendorName: string; // denormalized, same pattern as Invoice.studentName
  @Prop({ required: true }) billDate: Date;
  @Prop({ required: true }) dueDate: Date;
  @Prop() referenceNumber: string; // vendor's own invoice number
  @Prop({ type: [VendorBillLineSchema], default: [] }) lines: VendorBillLine[];
  @Prop({ default: 0 }) subtotal: number;
  @Prop({ default: 0 }) taxAmount: number; // flat amount — full tax templates are Phase 3
  @Prop({ default: 0 }) totalAmount: number;
  @Prop({ default: 0 }) paidAmount: number;
  @Prop({ default: 0 }) balanceDue: number;
  @Prop({
    enum: ['draft', 'posted', 'partial', 'paid', 'cancelled'],
    default: 'draft',
  })
  status: string;
  // Phase 5 — multi-currency (optional/additive), mirror of Invoice's
  // fields on the AP side. When unset, this bill is implicitly in the
  // school's base currency (unchanged behavior). When set,
  // subtotal/taxAmount/totalAmount/balanceDue above stay in the FOREIGN
  // currency; `exchangeRate` (as of billDate) and `baseCurrencyAmount`
  // (totalAmount * exchangeRate) are what post to the ledger.
  @Prop() currencyCode: string;
  @Prop() exchangeRate: number;
  @Prop() baseCurrencyAmount: number;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const VendorBillSchema = SchemaFactory.createForClass(VendorBill);
VendorBillSchema.index({ schoolSlug: 1, billNo: 1 }, { unique: true });
VendorBillSchema.index({ schoolSlug: 1, vendorId: 1 });
VendorBillSchema.index({ schoolSlug: 1, status: 1 });
VendorBillSchema.pre('validate', function () {
  if (this.isNew && !this.billNo) {
    const year = new Date().getFullYear();
    const rand = Math.floor(10000 + Math.random() * 90000);
    this.billNo = `BILL-${year}-${rand}`;
  }
});

// ============================================================
// VENDOR PAYMENT — one or more payments allocated against a bill,
// mirroring how Payment works against Invoice on the AR side.
// ============================================================
export type VendorPaymentDocument = VendorPayment & Document;

@Schema({ timestamps: true, collection: 'vendor_payments' })
export class VendorPayment {
  @Prop({ type: Types.ObjectId, ref: 'VendorBill', required: true }) billId: Types.ObjectId;
  @Prop({ required: true }) billNo: string;
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true }) vendorId: Types.ObjectId;
  @Prop({ required: true }) vendorName: string;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) paymentDate: Date;
  @Prop({
    enum: ['cash', 'bank_transfer', 'cheque', 'online', 'card', 'mobile_wallet'],
    default: 'cash',
  })
  paymentMethod: string;
  @Prop() referenceNumber: string;
  // Phase 3 — portion of `amount` withheld at source per the vendor's
  // WithholdingTaxCategory, if any (0 when the vendor has none configured).
  // The vendor is still deemed paid in full for `amount`; this is purely
  // informational/reporting — the actual liability split happens in the
  // journal posting (Cr Cash for amount-withholdingAmount, Cr Withholding
  // Tax Payable for withholdingAmount).
  @Prop({ default: 0 }) withholdingAmount: number;
  // Phase 5 — multi-currency (optional/additive), mirror of Payment's
  // fields on the AP side. Assumed to match the parent bill's
  // currencyCode. `exchangeRate` is resolved AT PAYMENT DATE, which may
  // differ from the bill's booked rate — see
  // FinanceService.recordVendorPayment for the realized FX gain/loss this
  // movement generates.
  @Prop() currencyCode: string;
  @Prop() exchangeRate: number;
  // Phase 6 — optional link to the specific BankAccount this vendor payment
  // actually went out of, mirroring Payment.bankAccountId/bankAccountName
  // on the AR side. Additive: unset by default.
  @Prop() bankAccountId: string;
  @Prop() bankAccountName: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const VendorPaymentSchema = SchemaFactory.createForClass(VendorPayment);
VendorPaymentSchema.index({ schoolSlug: 1, vendorId: 1 });
VendorPaymentSchema.index({ schoolSlug: 1, billId: 1 });
