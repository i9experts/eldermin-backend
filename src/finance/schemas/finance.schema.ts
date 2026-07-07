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
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop({ required: true }) academicYear: string;
  @Prop({
    enum: ['monthly','quarterly','termly','annually','one_time'],
    default: 'monthly',
  })
  frequency: string;
  @Prop({ type: [FeeLineItemSchema], default: [] }) items: FeeLineItem[];
  @Prop() totalAmount: number;
  @Prop() dueDay: number; // day of month
  @Prop({ default: 0 }) lateFinePerDay: number;
  @Prop({ default: 0 }) gracePeriodDays: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const FeeStructureSchema = SchemaFactory.createForClass(FeeStructure);
FeeStructureSchema.index({ schoolSlug: 1, grade: 1, academicYear: 1 });

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
    enum: ['draft','sent','paid','partial','overdue','cancelled','waived'],
    default: 'draft',
  })
  status: string;
  @Prop() dueDate: Date;
  @Prop({ default: 0 }) lateFine: number;
  @Prop() notes: string;
  @Prop() createdBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
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
  @Prop() notes: string;
  @Prop({ default: false }) isRefunded: boolean;
  @Prop() refundDate: Date;
  @Prop() refundReason: string;
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
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);
