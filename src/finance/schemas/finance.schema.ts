// ============================================================
// FINANCE SCHEMAS — Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// CHART OF ACCOUNTS
// ============================================================
export type COADocument = ChartOfAccount & Document;

@Schema({ timestamps: true, collection: 'chart_of_accounts' })
export class ChartOfAccount {
  @Prop({ required: true }) code: string;
  @Prop({ required: true }) name: string;
  @Prop() description: string;
  @Prop({
    enum: ['asset','liability','equity','revenue','expense'],
    required: true,
  })
  type: string;
  @Prop({
    enum: ['current_asset','fixed_asset','current_liability','long_term_liability',
           'equity','operating_revenue','other_revenue','operating_expense','other_expense'],
  })
  subType: string;
  @Prop() parentCode: string;
  @Prop({ default: 0 }) openingBalance: number;
  @Prop({ default: 0 }) currentBalance: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: false }) isSystem: boolean; // cannot be deleted
  // Phase 5 — optional foreign-currency designation for this specific
  // account (e.g. a USD bank account). Nullable/unset means the account is
  // implicitly in the school's base currency, matching every account that
  // existed before this phase — Phase 5 does not require tagging every
  // account, only the ones a school actually wants to hold in a foreign
  // currency.
  @Prop() currencyCode: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const COASchema = SchemaFactory.createForClass(ChartOfAccount);
COASchema.index({ schoolSlug: 1, code: 1 }, { unique: true });
COASchema.index({ schoolSlug: 1, type: 1 });

// ============================================================
// FEE STRUCTURE
// ============================================================
export type FeeStructureDocument = FeeStructure & Document;

@Schema({ _id: true })
class FeeLineItem {
  @Prop({ required: true }) feeHead: string;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 0 }) discount: number;
  @Prop({ default: true }) isOptional: boolean;
  @Prop() description: string;
}
const FeeLineItemSchema = SchemaFactory.createForClass(FeeLineItem);

@Schema({ timestamps: true, collection: 'fee_structures' })
export class FeeStructure {
  @Prop({ required: true }) name: string;
  // Grade/section stay as an optional ELIGIBILITY filter (used to suggest
  // or auto-match a structure when a student has no explicit
  // StudentFeeAssignment - see generateInvoices) - they are no longer the
  // only way a structure attaches to a student. A structure with no grade
  // at all is valid and can only ever be reached via an explicit
  // assignment (see FEE-01/FEE-02).
  @Prop() grade: string;
  @Prop() section: string;
  @Prop({ required: true }) academicYear: string;
  // Free-form (not a strict enum) so schools can define their own billing cycles
  // e.g. "Every 2 Months" - many Pakistani schools bill two months of tuition at once.
  @Prop({ default: 'monthly' }) frequency: string;
  @Prop({ type: [FeeLineItemSchema], default: [] }) items: FeeLineItem[];
  @Prop() totalAmount: number;
  @Prop() dueDay: number; // day of month
  @Prop({ default: 0 }) lateFinePerDay: number;
  @Prop({ default: 0 }) gracePeriodDays: number;
  @Prop({ default: 0 }) lateFeeAmount: number; // flat late fee (distinct from the daily fine above)
  @Prop() effectiveFrom: Date;
  // Optional expiry - an unset effectiveTo means "still in force". Paired
  // with effectiveFrom so a structure's active window is fully explicit,
  // and so a superseding version (see below) can be given a clean
  // effectiveFrom without the two versions' windows overlapping.
  @Prop({ default: null }) effectiveTo: Date | null;
  @Prop() campus: string;
  @Prop({ default: false }) isTaxable: boolean;
  @Prop({ default: true }) isActive: boolean;
  // Versioning (see FEE-01): editing a structure that has already generated
  // real invoices creates a NEW document (version = previous + 1,
  // previousVersionId pointing back) instead of mutating the priced-and-
  // billed original - see FinanceService.updateFeeStructure. A structure
  // with no invoices yet can still be safely edited in place.
  @Prop({ default: 1 }) version: number;
  @Prop({ type: Types.ObjectId, ref: 'FeeStructure', default: null }) previousVersionId: Types.ObjectId | null;
  @Prop({ enum: ['active', 'superseded', 'draft'], default: 'active' }) status: string;
  // Phase 8 — optional link to a Terms & Conditions template (see
  // schemas/terms-template.schema.ts). Unset means no T&C attached,
  // exactly matching every pre-Phase-8 fee structure.
  @Prop({ type: Types.ObjectId, ref: 'TermsTemplate', default: null }) termsTemplateId: Types.ObjectId | null;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const FeeStructureSchema = SchemaFactory.createForClass(FeeStructure);
FeeStructureSchema.index({ schoolSlug: 1, grade: 1, academicYear: 1 });
FeeStructureSchema.index({ schoolSlug: 1, status: 1 });

// ============================================================
// STUDENT FEE ASSIGNMENT
// The real per-student fee-structure assignment that was completely
// missing (see FEE-01/FEE-02): FeeStructure.grade/section is only ever an
// ELIGIBILITY filter now, not the sole ownership mechanism - two students
// in the identical class/section can carry two different explicit
// assignments here and each bills correctly. A student with no active
// assignment here still falls back to the old grade/section/campus
// auto-match in generateInvoices, so a school that never uses this screen
// sees no change in behaviour at all.
// ============================================================
export type StudentFeeAssignmentDocument = StudentFeeAssignment & Document;

@Schema({ timestamps: true, collection: 'student_fee_assignments' })
export class StudentFeeAssignment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop() studentName: string; // denormalized for display without a populate
  @Prop({ required: true, type: Types.ObjectId, ref: 'FeeStructure' }) feeStructureId: Types.ObjectId;
  @Prop() feeStructureName: string; // denormalized
  @Prop({ required: true }) academicYear: string;
  @Prop({ required: true }) effectiveFrom: Date;
  @Prop({ default: null }) effectiveTo: Date | null;
  @Prop() assignedBy: string;
  @Prop() notes: string;
  @Prop({ default: true }) isActive: boolean;
  // Set false (never deleted) when superseded by a later assignment for
  // the same student/period, so assignment history is fully preserved -
  // see FinanceService.assignFeeStructure's overlap handling.
  @Prop({ default: null }) replacedAt: Date | null;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const StudentFeeAssignmentSchema = SchemaFactory.createForClass(StudentFeeAssignment);
StudentFeeAssignmentSchema.index({ schoolSlug: 1, studentId: 1, isActive: 1 });
StudentFeeAssignmentSchema.index({ schoolSlug: 1, academicYear: 1 });

// ============================================================
// INVOICE
// ============================================================
export type InvoiceDocument = Invoice & Document;

@Schema({ _id: true })
class InvoiceLineItem {
  @Prop({ required: true }) description: string;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 0 }) discount: number;
  @Prop() taxRate: number;
  @Prop() netAmount: number;
  // Which FeeStructure (and specific fee head within it) this line was
  // billed from - lets FinanceService.updateFeeStructure detect that a
  // structure has already generated real invoices and must version
  // instead of mutating in place (see FEE-01). Optional/nullable so every
  // invoice generated before this field existed keeps working unchanged.
  @Prop({ type: Types.ObjectId, ref: 'FeeStructure', default: null }) feeStructureId: Types.ObjectId | null;
  @Prop() feeHead: string;
}
const InvoiceLineItemSchema = SchemaFactory.createForClass(InvoiceLineItem);

@Schema({ timestamps: true, collection: 'invoices' })
export class Invoice {
  @Prop({ required: true, unique: true }) invoiceNumber: string;
  @Prop({
    enum: ['fee','admission','transport','hostel','library','other'],
    default: 'fee',
  })
  type: string;
  @Prop({ type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop() campus: string;
  @Prop({ required: true }) month: string; // 2025-02
  @Prop({ required: true }) academicYear: string;
  @Prop({ type: [InvoiceLineItemSchema], default: [] }) items: InvoiceLineItem[];
  @Prop({ default: 0 }) subtotal: number;
  @Prop({ default: 0 }) totalDiscount: number;
  @Prop({ default: 0 }) totalTax: number;
  @Prop({ default: 0 }) totalAmount: number;
  @Prop({ default: 0 }) paidAmount: number;
  @Prop({ default: 0 }) balanceDue: number;
  @Prop({
    enum: ['draft','sent','paid','partial','overdue','cancelled','waived','hold'],
    default: 'draft',
  })
  status: string;
  @Prop({ default: false }) isDeleted: boolean;
  @Prop() deletedAt: Date;
  @Prop() deletedBy: string;
  @Prop() deleteReason: string;
  @Prop() dueDate: Date;
  @Prop({ default: 0 }) lateFine: number;
  @Prop() notes: string;
  @Prop() createdBy: string;
  // Phase 5 — multi-currency (optional/additive). When unset, this invoice
  // is implicitly in the school's base currency and behaves exactly as
  // before. When set to a foreign currency, `totalAmount`/`balanceDue`
  // above stay in that FOREIGN currency (what the family actually owes) —
  // `exchangeRate` (resolved as of the invoice date) and `baseCurrencyAmount`
  // (totalAmount * exchangeRate) are what actually post to the ledger,
  // since the ledger itself stays single-currency (base currency).
  @Prop() currencyCode: string;
  @Prop() exchangeRate: number;
  @Prop() baseCurrencyAmount: number;
  // Phase 8 — optional link to a Terms & Conditions template (see
  // schemas/terms-template.schema.ts). Unset means no T&C attached,
  // exactly matching every pre-Phase-8 invoice.
  @Prop({ type: Types.ObjectId, ref: 'TermsTemplate', default: null }) termsTemplateId: Types.ObjectId | null;
  @Prop({ required: true, index: true }) schoolSlug: string;
  // Denormalized from the student's own campus at invoice creation time -
  // lets the fee defaulter engine (and any other reporting) scope by
  // campus without a join.
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ schoolSlug: 1, studentId: 1, month: -1 });
InvoiceSchema.index({ schoolSlug: 1, status: 1 });
InvoiceSchema.pre('validate', function () {
  if (this.isNew && !this.invoiceNumber) {
    const year = new Date().getFullYear();
    const rand = Math.floor(10000 + Math.random() * 90000);
    this.invoiceNumber = `INV-${year}-${rand}`;
  }
});

// ============================================================
// PAYMENT (Receipt)
// ============================================================
export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true, collection: 'payments' })
export class Payment {
  @Prop({ required: true, unique: true }) receiptNumber: string;
  @Prop({ type: Types.ObjectId, ref: 'Invoice', required: true }) invoiceId: Types.ObjectId;
  @Prop({ required: true }) invoiceNumber: string;
  @Prop({ type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) amount: number;
  @Prop({
    enum: ['cash','bank_transfer','cheque','online','card','mobile_wallet'],
    default: 'cash',
  })
  paymentMethod: string;
  @Prop() chequeNumber: string;
  @Prop() bankName: string;
  @Prop() transactionId: string;
  @Prop({ required: true }) paymentDate: Date;
  @Prop() collectedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) collectedById: Types.ObjectId;
  @Prop() bankAccountId: string;
  // Phase 6 — denormalized label for the BankAccount above (same convention
  // as costCenterName/partnerName elsewhere), so a receipt/reconciliation
  // view can show which specific bank account this hit without a populate.
  // Optional/additive: unset when bankAccountId is unset (unchanged from
  // pre-Phase-6 behavior).
  @Prop() bankAccountName: string;
  @Prop() notes: string;
  @Prop({ default: false }) isRefunded: boolean;
  @Prop() refundDate: Date;
  @Prop() refundReason: string;
  // Phase 5 — multi-currency (optional/additive). Assumed to match the
  // parent invoice's currencyCode (no cross-currency payment splitting in
  // Phase 5). `exchangeRate` is resolved AT PAYMENT DATE, which may differ
  // from the invoice's booked rate — see FinanceService.recordPayment for
  // the realized FX gain/loss this movement generates. `baseCurrencyAmount`
  // is the actual base-currency cash value received (amount * exchangeRate).
  @Prop() currencyCode: string;
  @Prop() exchangeRate: number;
  @Prop() baseCurrencyAmount: number;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ schoolSlug: 1, paymentDate: -1 });
PaymentSchema.index({ schoolSlug: 1, studentId: 1 });
PaymentSchema.pre('validate', function () {
  if (this.isNew && !this.receiptNumber) {
    const d = new Date();
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.receiptNumber = `RCP-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}-${rand}`;
  }
});

// ============================================================
// EXPENSE
// ============================================================
export type ExpenseDocument = Expense & Document;

@Schema({ timestamps: true, collection: 'expenses' })
export class Expense {
  @Prop() expenseNo: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) category: string; // Utilities, Salaries, Maintenance etc.
  @Prop() description: string;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) date: Date;
  @Prop({
    enum: ['submitted','approved','paid','rejected'],
    default: 'submitted',
  })
  status: string;
  @Prop() approvedBy: string;
  @Prop() approvedDate: Date;
  @Prop() paidBy: string;
  @Prop() paymentMethod: string;
  @Prop() receiptNumber: string;
  @Prop() vendorName: string;
  @Prop() paidTo: string;
  @Prop() accountCode: string;
  @Prop() departmentId: string;
  @Prop() campusId: string;
  @Prop() attachmentUrl: string;
  @Prop() submittedBy: string;
  // Phase 6 — optional link to the specific BankAccount this expense was
  // actually paid from, so a Cash/Bank posting for the expense can be
  // matched during Bank Reconciliation. Additive: unset by default, same
  // as Payment.bankAccountId's convention.
  @Prop() bankAccountId: string;
  @Prop() bankAccountName: string;
  // Phase 5 — multi-currency (optional/additive). Kept for schema parity
  // with Invoice/Payment/VendorBill; the simple Expense spend-log doesn't
  // carry FX gain/loss logic in Phase 5 (that lives on the formal Vendor
  // Bill / Vendor Payment flow) — set these when a school wants to record
  // that a particular expense was actually paid in a foreign currency.
  @Prop() currencyCode: string;
  @Prop() exchangeRate: number;
  @Prop() baseCurrencyAmount: number;
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
ExpenseSchema.index({ schoolSlug: 1, date: -1 });
ExpenseSchema.index({ schoolSlug: 1, category: 1, date: -1 });
ExpenseSchema.index({ schoolSlug: 1, status: 1 });
ExpenseSchema.pre('validate', function () {
  if (this.isNew && !this.expenseNo) {
    const d = new Date();
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.expenseNo = `EXP-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${rand}`;
  }
});

// ============================================================
// BUDGET
// ============================================================
export type BudgetDocument = Budget & Document;

@Schema({ _id: true })
class BudgetLine {
  @Prop({ required: true }) category: string;
  @Prop({ required: true }) allocatedAmount: number;
  @Prop({ default: 0 }) spentAmount: number;
  @Prop() notes: string;
  // Phase 4 — optional Cost Center dimension on each budget line, following
  // the same denormalization convention as JournalLine.costCenterId/Name.
  // Optional and additive: budgets created before Phase 4 (or by schools
  // that haven't seeded Cost Centers) have neither set, and budget-vs-actual
  // then falls back to resolving a cost center by name from this line's
  // costCenterName, or the parent Budget's departmentId/campusId.
  @Prop({ type: Types.ObjectId, ref: 'CostCenter', default: null }) costCenterId: Types.ObjectId | null;
  @Prop() costCenterName: string;
}
const BudgetLineSchema = SchemaFactory.createForClass(BudgetLine);

@Schema({ timestamps: true, collection: 'budgets' })
export class Budget {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) academicYear: string;
  @Prop() term: string;
  @Prop() departmentId: string;
  @Prop() campusId: string;
  @Prop({ type: [BudgetLineSchema], default: [] }) lines: BudgetLine[];
  @Prop() totalAllocated: number;
  @Prop({ default: 0 }) totalSpent: number;
  @Prop({
    enum: ['draft','approved','active','closed'],
    default: 'draft',
  })
  status: string;
  @Prop() approvedBy: string;
  @Prop() notes: string;
  @Prop() createdBy: string;
  // Phase 4 — optional time dimension so budget-vs-actual can derive a real
  // date range instead of only having a free-text academicYear string.
  // Optional: existing budgets (and schools that never set up Fiscal Years)
  // keep working exactly as before via the academicYear fallback.
  @Prop({ type: Types.ObjectId, ref: 'FiscalYear', default: null }) fiscalYearId: Types.ObjectId | null;
  @Prop({ enum: ['annual', 'monthly'], default: 'annual' }) periodType: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const BudgetSchema = SchemaFactory.createForClass(Budget);
BudgetSchema.index({ schoolSlug: 1, academicYear: 1 });

// ============================================================
// BANK ACCOUNT
// ============================================================
export type BankAccountDocument = BankAccount & Document;

@Schema({ timestamps: true, collection: 'bank_accounts' })
export class BankAccount {
  @Prop({ required: true }) bankName: string;
  @Prop({ required: true }) accountTitle: string;
  @Prop({ required: true }) accountNumber: string;
  @Prop() branchName: string;
  @Prop() branchCode: string;
  @Prop() iban: string;
  @Prop() swiftCode: string;
  @Prop({
    enum: ['savings','current','fd','loan'],
    default: 'current',
  })
  accountType: string;
  @Prop({ default: 0 }) openingBalance: number;
  @Prop({ default: 0 }) currentBalance: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: false }) isPrimary: boolean;
  @Prop() campus: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);

// ============================================================
// DISCOUNT / SCHOLARSHIP PROGRAM
// Reusable templates (e.g. "Merit Scholarship 2026", "Sibling Discount",
// "Staff Ward Waiver", "Hifz Incentive") that get applied to students via
// FeeAssignment below. Kept separate from FeeAssignment so the same
// program can be assigned to many different targets without redefining
// its value/type each time.
// ============================================================
export type DiscountProgramDocument = DiscountProgram & Document;

@Schema({ timestamps: true, collection: 'discount_programs' })
export class DiscountProgram {
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['scholarship', 'discount', 'grant', 'incentive'], required: true }) type: string;
  @Prop({ enum: ['percentage', 'flat'], required: true }) valueType: string;
  @Prop({ required: true }) value: number;
  @Prop() maxAmount: number; // optional cap, mainly for percentage-based programs
  @Prop() description: string;
  @Prop() validFrom: Date;
  @Prop() validTo: Date;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const DiscountProgramSchema = SchemaFactory.createForClass(DiscountProgram);

// ============================================================
// FEE ASSIGNMENT
// The actual bridge: assigns a DiscountProgram (or an ad-hoc one-off
// override) to a target — a single student, a whole family, a class,
// a section, or a campus. This is what was completely missing: Fee
// Structure defines the base price per class/section, but there was no
// way to say "this specific student/family gets X% off" without
// changing the whole class's pricing.
// ============================================================
export type FeeAssignmentDocument = FeeAssignment & Document;

@Schema({ timestamps: true, collection: 'fee_assignments' })
export class FeeAssignment {
  @Prop({ enum: ['student', 'family', 'class', 'section', 'campus'], required: true }) targetType: string;
  @Prop({ required: true }) targetValue: string; // studentId / familyId / grade name / "grade::section" / campus name
  @Prop() targetLabel: string; // denormalized human-readable label, e.g. "Ali Khan (STU-2026-5621)"
  @Prop({ type: Types.ObjectId, ref: 'DiscountProgram' }) discountProgramId: Types.ObjectId;
  @Prop() discountProgramName: string; // denormalized for display without a populate
  @Prop({ enum: ['percentage', 'flat'] }) overrideValueType: string; // used only for ad-hoc assignments (no program)
  @Prop() overrideValue: number;
  @Prop() feeHeadName: string; // optional - restrict to one fee head; empty/undefined = applies to all fee heads billed to the target
  @Prop() effectiveFrom: Date;
  @Prop() effectiveTo: Date;
  @Prop() approvedBy: string;
  @Prop() notes: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const FeeAssignmentSchema = SchemaFactory.createForClass(FeeAssignment);
FeeAssignmentSchema.index({ schoolSlug: 1, targetType: 1, targetValue: 1 });
