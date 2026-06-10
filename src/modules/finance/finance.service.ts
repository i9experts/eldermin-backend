import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FeeHead, FeeHeadDocument } from './schemas/fee-head.schema';
import { FeeInvoice, FeeInvoiceDocument } from './schemas/fee-invoice.schema';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Expense, ExpenseDocument } from './schemas/expense.schema';
import { ChartOfAccounts, ChartOfAccountsDocument } from './schemas/chart-of-accounts.schema';

@Injectable()
export class FinanceService {
  constructor(
    @InjectModel(FeeHead.name) private feeHeadModel: Model<FeeHeadDocument>,
    @InjectModel(FeeInvoice.name) private invoiceModel: Model<FeeInvoiceDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(ChartOfAccounts.name) private coaModel: Model<ChartOfAccountsDocument>,
  ) {}

  private tid(tenantId: string) { return new Types.ObjectId(tenantId); }

  async getFeeHeads(tenantId: string) {
    return this.feeHeadModel.find({ tenantId: this.tid(tenantId), isActive: true }).lean();
  }

  async createFeeHead(tenantId: string, institutionId: string, data: any) {
    return this.feeHeadModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
    });
  }

  async updateFeeHead(tenantId: string, id: string, data: any) {
    return this.feeHeadModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }

  async getInvoices(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.status) filter.status = query.status;
    return this.invoiceModel.find(filter).sort({ issueDate: -1 }).limit(100).lean();
  }

  async createInvoice(tenantId: string, institutionId: string, data: any) {
    const count = await this.invoiceModel.countDocuments({ tenantId: this.tid(tenantId) });
    const invoiceNo = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    return this.invoiceModel.create({
      ...data,
      invoiceNo,
      balanceAmount: data.totalAmount,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
    });
  }

  async getInvoiceById(tenantId: string, id: string) {
    return this.invoiceModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
  }

  async getPayments(tenantId: string) {
    return this.paymentModel.find({ tenantId: this.tid(tenantId) }).sort({ paymentDate: -1 }).limit(100).lean();
  }

  async createPayment(tenantId: string, institutionId: string, data: any) {
    const count = await this.paymentModel.countDocuments({ tenantId: this.tid(tenantId) });
    const receiptNo = `REC-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const payment = await this.paymentModel.create({
      ...data,
      receiptNo,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
    });
    await this.invoiceModel.findByIdAndUpdate(data.invoiceId, {
      $inc: { paidAmount: data.amount, balanceAmount: -data.amount },
    });
    const invoice = await this.invoiceModel.findById(data.invoiceId);
    if (invoice) {
      const status = invoice.balanceAmount <= 0 ? 'paid'
        : invoice.paidAmount > 0 ? 'partially_paid'
        : 'issued';
      await this.invoiceModel.findByIdAndUpdate(data.invoiceId, { $set: { status } });
    }
    return payment;
  }

  async getExpenses(tenantId: string) {
    return this.expenseModel.find({ tenantId: this.tid(tenantId) }).sort({ expenseDate: -1 }).limit(100).lean();
  }

  async createExpense(tenantId: string, institutionId: string, campusId: string, data: any) {
    const count = await this.expenseModel.countDocuments({ tenantId: this.tid(tenantId) });
    const expenseNo = `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    return this.expenseModel.create({
      ...data,
      expenseNo,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
      campusId: new Types.ObjectId(campusId || institutionId),
    });
  }

  // ── Chart of Accounts ────────────────────────────────────────────────
  private readonly standardCOA = [
    // ASSETS
    { code: '1000', name: 'Current Assets',          type: 'asset',     normalBalance: 'debit',  isPostable: false, level: 1 },
    { code: '1100', name: 'Cash & Bank',              type: 'asset',     normalBalance: 'debit',  isPostable: false, level: 2, parentCode: '1000' },
    { code: '1110', name: 'Main Cash Counter',        type: 'asset',     normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '1100' },
    { code: '1120', name: 'Bank Account – Current',   type: 'asset',     normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '1100' },
    { code: '1130', name: 'Bank Account – Savings',   type: 'asset',     normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '1100' },
    { code: '1200', name: 'Accounts Receivable',      type: 'asset',     normalBalance: 'debit',  isPostable: false, level: 2, parentCode: '1000' },
    { code: '1210', name: 'Student Fee Receivable',   type: 'asset',     normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '1200' },
    { code: '1220', name: 'Other Receivables',        type: 'asset',     normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '1200' },
    { code: '1300', name: 'Prepaid Expenses',         type: 'asset',     normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '1000' },
    { code: '1400', name: 'Fixed Assets',             type: 'asset',     normalBalance: 'debit',  isPostable: false, level: 1 },
    { code: '1410', name: 'Buildings & Land',         type: 'asset',     normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '1400' },
    { code: '1420', name: 'Furniture & Fixtures',     type: 'asset',     normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '1400' },
    { code: '1430', name: 'IT Equipment',             type: 'asset',     normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '1400' },
    { code: '1490', name: 'Accumulated Depreciation', type: 'asset',     normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '1400' },
    // LIABILITIES
    { code: '2000', name: 'Current Liabilities',      type: 'liability', normalBalance: 'credit', isPostable: false, level: 1 },
    { code: '2100', name: 'Accounts Payable',         type: 'liability', normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '2000' },
    { code: '2200', name: 'Salaries Payable',         type: 'liability', normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '2000' },
    { code: '2300', name: 'Advance Fees Received',    type: 'liability', normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '2000' },
    { code: '2400', name: 'Tax Payable',              type: 'liability', normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '2000' },
    { code: '2500', name: 'Long-term Liabilities',    type: 'liability', normalBalance: 'credit', isPostable: false, level: 1 },
    { code: '2510', name: 'Loans Payable',            type: 'liability', normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '2500' },
    // EQUITY
    { code: '3000', name: 'Equity',                   type: 'equity',    normalBalance: 'credit', isPostable: false, level: 1 },
    { code: '3100', name: 'Retained Surplus',         type: 'equity',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '3000' },
    { code: '3200', name: 'Endowment / Waqf Fund',    type: 'equity',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '3000' },
    { code: '3300', name: 'Zakat Fund',               type: 'equity',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '3000' },
    { code: '3400', name: 'Sadaqah Fund',             type: 'equity',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '3000' },
    // INCOME
    { code: '4000', name: 'Revenue',                  type: 'income',    normalBalance: 'credit', isPostable: false, level: 1 },
    { code: '4100', name: 'Tuition Fee Income',       type: 'income',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '4000' },
    { code: '4200', name: 'Transport Fee Income',     type: 'income',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '4000' },
    { code: '4300', name: 'Admission Fee Income',     type: 'income',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '4000' },
    { code: '4400', name: 'Activity & Lab Fees',      type: 'income',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '4000' },
    { code: '4500', name: 'Exam Fee Income',          type: 'income',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '4000' },
    { code: '4600', name: 'Hostel Fee Income',        type: 'income',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '4000' },
    { code: '4700', name: 'Donation & Grant Income',  type: 'income',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '4000' },
    { code: '4800', name: 'Other Income',             type: 'income',    normalBalance: 'credit', isPostable: true,  level: 2, parentCode: '4000' },
    // EXPENSES
    { code: '5000', name: 'Expenses',                 type: 'expense',   normalBalance: 'debit',  isPostable: false, level: 1 },
    { code: '5100', name: 'Staff Salaries',           type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '5000' },
    { code: '5110', name: 'Teaching Staff Salaries',  type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '5100' },
    { code: '5120', name: 'Admin Staff Salaries',     type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '5100' },
    { code: '5200', name: 'Utilities',                type: 'expense',   normalBalance: 'debit',  isPostable: false, level: 2, parentCode: '5000' },
    { code: '5210', name: 'Electricity',              type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '5200' },
    { code: '5220', name: 'Water & Gas',              type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '5200' },
    { code: '5230', name: 'Internet & Telecom',       type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 3, parentCode: '5200' },
    { code: '5300', name: 'Maintenance & Repairs',    type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '5000' },
    { code: '5400', name: 'Transport Expenses',       type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '5000' },
    { code: '5500', name: 'Academic Supplies',        type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '5000' },
    { code: '5600', name: 'Scholarship & Waivers',    type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '5000' },
    { code: '5700', name: 'Depreciation Expense',     type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '5000' },
    { code: '5800', name: 'Administrative Expenses',  type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '5000' },
    { code: '5900', name: 'Miscellaneous Expenses',   type: 'expense',   normalBalance: 'debit',  isPostable: true,  level: 2, parentCode: '5000' },
  ];

  async getChartOfAccounts(tenantId: string) {
    return this.coaModel
      .find({ tenantId: this.tid(tenantId), isActive: true })
      .sort({ code: 1 })
      .lean();
  }

  async createAccount(tenantId: string, institutionId: string, data: any) {
    return this.coaModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
    });
  }

  async updateAccount(tenantId: string, id: string, data: any) {
    return this.coaModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }

  async deleteAccount(tenantId: string, id: string) {
    await this.coaModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: { isActive: false } },
    );
    return { message: 'Account deactivated' };
  }

  async seedStandardCOA(tenantId: string, institutionId: string) {
    const tid = this.tid(tenantId);
    const instId = new Types.ObjectId(institutionId);
    const existing = await this.coaModel.countDocuments({ tenantId: tid });
    if (existing > 0) {
      return { message: 'Chart of Accounts already exists', count: existing };
    }
    const docs = this.standardCOA.map(a => ({
      ...a,
      tenantId: tid,
      institutionId: instId,
      isSystemAccount: true,
      currency: 'USD',
    }));
    await this.coaModel.insertMany(docs, { ordered: false });
    return { message: 'Standard COA seeded successfully', count: docs.length };
  }

  async getDashboardStats(tenantId: string) {
    const tid = this.tid(tenantId);
    const [totalInvoiced, totalCollected, overdueCount, pendingExpenses, totalExpensesAgg, totalPendingAgg] = await Promise.all([
      this.invoiceModel.aggregate([
        { $match: { tenantId: tid } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.paymentModel.aggregate([
        { $match: { tenantId: tid, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.countDocuments({ tenantId: tid, status: 'overdue' }),
      this.expenseModel.countDocuments({ tenantId: tid, status: 'submitted' }),
      this.expenseModel.aggregate([
        { $match: { tenantId: tid, status: { $ne: 'rejected' } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.expenseModel.aggregate([
        { $match: { tenantId: tid, status: 'submitted' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    return {
      totalInvoiced: totalInvoiced[0]?.total || 0,
      totalCollected: totalCollected[0]?.total || 0,
      outstanding: (totalInvoiced[0]?.total || 0) - (totalCollected[0]?.total || 0),
      overdueCount,
      pendingExpenses,
      totalExpenses: totalExpensesAgg[0]?.total || 0,
      totalPendingExpenses: totalPendingAgg[0]?.total || 0,
    };
  }
}
