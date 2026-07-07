import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ChartOfAccount, COADocument,
  FeeStructure, FeeStructureDocument,
  Invoice, InvoiceDocument,
  Payment, PaymentDocument,
  Expense, ExpenseDocument,
  Budget, BudgetDocument,
  BankAccount, BankAccountDocument,
} from './schemas/finance.schema';

const paged = (page = 1, limit = 20) => ({ skip: (page - 1) * limit, limit });

@Injectable()
export class FinanceService {
  constructor(
    @InjectModel(ChartOfAccount.name) private coaModel: Model<COADocument>,
    @InjectModel(FeeStructure.name) private feeStructModel: Model<FeeStructureDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
    @InjectModel(Budget.name) private budgetModel: Model<BudgetDocument>,
    @InjectModel(BankAccount.name) private bankModel: Model<BankAccountDocument>,
  ) {}

  // ── Dashboard ───────────────────────────────────────────
  async getDashboard(schoolSlug: string, academicYear?: string) {
    const base: any = { schoolSlug };
    if (academicYear) base.academicYear = academicYear;

    const monthStart = new Date(new Date().setDate(1));
    const monthEnd = new Date(new Date(monthStart).setMonth(monthStart.getMonth() + 1));

    const [
      totalInvoiced, totalCollected, totalOutstanding,
      collectedThisMonth, expensesThisMonth, totalExpenses,
      overdueCount, pendingExpenses,
      invoicesByStatus, recentPayments, expenseByCategory,
      bankBalances,
    ] = await Promise.all([
      this.invoiceModel.aggregate([
        { $match: { ...base, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.paymentModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { ...base, status: { $in: ['sent','partial','overdue'] }, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$balanceDue' } } },
      ]),
      this.paymentModel.aggregate([
        { $match: { schoolSlug, paymentDate: { $gte: monthStart, $lt: monthEnd } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.expenseModel.aggregate([
        { $match: { ...base, date: { $gte: monthStart, $lt: monthEnd }, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.expenseModel.aggregate([
        { $match: { ...base, status: { $in: ['paid', 'approved'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.invoiceModel.countDocuments({ ...base, status: 'overdue', isDeleted: { $ne: true } }),
      this.expenseModel.aggregate([
        { $match: { ...base, status: 'submitted' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { ...base, isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
      ]),
      this.paymentModel.find({ schoolSlug }).sort({ paymentDate: -1 }).limit(5)
        .select('receiptNumber studentName amount paymentDate paymentMethod'),
      this.expenseModel.aggregate([
        { $match: { ...base, status: 'paid' } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $limit: 8 },
      ]),
      this.bankModel.find({ schoolSlug, isActive: true })
        .select('bankName accountTitle currentBalance isPrimary'),
    ]);

    return {
      summary: {
        totalInvoiced: totalInvoiced[0]?.total || 0,
        totalCollected: totalCollected[0]?.total || 0,
        totalOutstanding: totalOutstanding[0]?.total || 0,
        collectedThisMonth: collectedThisMonth[0]?.total || 0,
        expensesThisMonth: expensesThisMonth[0]?.total || 0,
        totalExpenses: totalExpenses[0]?.total || 0,
        overdueCount,
        totalPendingExpenses: pendingExpenses[0]?.total || 0,
        pendingExpensesCount: pendingExpenses[0]?.count || 0,
      },
      invoicesByStatus,
      recentPayments,
      expenseByCategory,
      bankBalances,
    };
  }

  // ── COA ─────────────────────────────────────────────────
  async getCOA(schoolSlug: string, type?: string) {
    const filter: any = { schoolSlug };
    if (type) filter.type = type;
    return this.coaModel.find(filter).sort({ code: 1 });
  }

  async createCOA(data: any) {
    const acc = new this.coaModel(data);
    return acc.save();
  }

  async updateCOA(id: string, schoolSlug: string, data: any) {
    return this.coaModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async deleteCOA(id: string, schoolSlug: string) {
    const acc = await this.coaModel.findOne({ _id: id, schoolSlug });
    if (!acc) throw new NotFoundException('Account not found');
    if (acc.isSystem) throw new BadRequestException('System accounts cannot be deleted');
    acc.isActive = false;
    return acc.save();
  }

  async seedDefaultCOA(schoolSlug: string) {
    const defaults = [
      { code: '1000', name: 'Cash & Cash Equivalents', type: 'asset', subType: 'current_asset' },
      { code: '1100', name: 'Bank Accounts', type: 'asset', subType: 'current_asset' },
      { code: '1200', name: 'Accounts Receivable (Fee)', type: 'asset', subType: 'current_asset' },
      { code: '1500', name: 'Fixed Assets', type: 'asset', subType: 'fixed_asset' },
      { code: '2000', name: 'Accounts Payable', type: 'liability', subType: 'current_liability' },
      { code: '2100', name: 'Salaries Payable', type: 'liability', subType: 'current_liability' },
      { code: '3000', name: "Owner's Equity", type: 'equity', subType: 'equity' },
      { code: '4000', name: 'Tuition Fee Revenue', type: 'revenue', subType: 'operating_revenue' },
      { code: '4100', name: 'Admission Fee Revenue', type: 'revenue', subType: 'operating_revenue' },
      { code: '4200', name: 'Transport Fee Revenue', type: 'revenue', subType: 'operating_revenue' },
      { code: '5000', name: 'Salaries & Wages', type: 'expense', subType: 'operating_expense' },
      { code: '5100', name: 'Utilities', type: 'expense', subType: 'operating_expense' },
      { code: '5200', name: 'Maintenance & Repairs', type: 'expense', subType: 'operating_expense' },
      { code: '5300', name: 'Academic Supplies', type: 'expense', subType: 'operating_expense' },
      { code: '5400', name: 'Marketing & Advertising', type: 'expense', subType: 'operating_expense' },
    ];
    const ops = defaults.map(d => ({
      updateOne: {
        filter: { code: d.code, schoolSlug },
        update: { $setOnInsert: { ...d, schoolSlug, isSystem: true, isActive: true, currentBalance: 0, openingBalance: 0 } },
        upsert: true,
      },
    }));
    await this.coaModel.bulkWrite(ops);
    return this.coaModel.find({ schoolSlug }).sort({ code: 1 });
  }

  // ── Fee Structures ───────────────────────────────────────
  async getFeeStructures(schoolSlug: string, grade?: string, year?: string) {
    const filter: any = { schoolSlug, isActive: true };
    if (grade) filter.grade = grade;
    if (year) filter.academicYear = year;
    return this.feeStructModel.find(filter).sort({ grade: 1 });
  }

  async createFeeStructure(data: any) {
    const total = (data.items || []).reduce((a: number, i: any) => a + (i.amount - (i.discount || 0)), 0);
    const fs = new this.feeStructModel({ ...data, totalAmount: total });
    return fs.save();
  }

  async updateFeeStructure(id: string, schoolSlug: string, data: any) {
    return this.feeStructModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  // ── Invoices ─────────────────────────────────────────────
  async getInvoices(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, grade, month, studentId, academicYear } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug, isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (grade) filter.grade = grade;
    if (month) filter.month = month;
    if (academicYear) filter.academicYear = academicYear;
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    const [data, total] = await Promise.all([
      this.invoiceModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.invoiceModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createInvoice(data: any) {
    const subtotal = (data.items || []).reduce((a: number, i: any) => a + i.amount, 0);
    const totalDiscount = (data.items || []).reduce((a: number, i: any) => a + (i.discount || 0), 0);
    const totalAmount = subtotal - totalDiscount;
    const inv = new this.invoiceModel({
      ...data,
      subtotal, totalDiscount, totalAmount, balanceDue: totalAmount,
    });
    return inv.save();
  }

  async recordPayment(invoiceId: string, schoolSlug: string, paymentData: any) {
    const invoice = await this.invoiceModel.findOne({ _id: invoiceId, schoolSlug, isDeleted: { $ne: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'paid') throw new BadRequestException('Invoice already paid');

    const payment = new this.paymentModel({
      ...paymentData,
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      studentId: invoice.studentId,
      studentName: invoice.studentName,
      paymentDate: new Date(paymentData.paymentDate || Date.now()),
      schoolSlug,
    });
    await payment.save();

    const newPaid = (invoice.paidAmount || 0) + paymentData.amount;
    const newBalance = invoice.totalAmount - newPaid;
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';

    await this.invoiceModel.findByIdAndUpdate(invoiceId, {
      $set: { paidAmount: newPaid, balanceDue: Math.max(0, newBalance), status: newStatus },
    });

    return payment;
  }

  async getPayments(schoolSlug: string) {
    return this.paymentModel.find({ schoolSlug }).sort({ paymentDate: -1 }).limit(100);
  }

  // ── Expenses ─────────────────────────────────────────────
  async getExpenses(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, category, academicYear, from, to } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (academicYear) filter.academicYear = academicYear;
    if (from || to) { filter.date = {}; if (from) filter.date.$gte = new Date(from); if (to) filter.date.$lte = new Date(to); }
    const [data, total] = await Promise.all([
      this.expenseModel.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
      this.expenseModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createExpense(data: any) {
    const exp = new this.expenseModel({
      ...data,
      title: data.title || data.description || 'Expense',
      date: new Date(data.date || data.expenseDate || Date.now()),
      paidTo: data.paidTo || data.vendorName,
      vendorName: data.vendorName || data.paidTo,
    });
    return exp.save();
  }

  async approveExpense(id: string, schoolSlug: string, approvedBy: string) {
    return this.expenseModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'approved', approvedBy, approvedDate: new Date() } },
      { new: true },
    );
  }

  async markExpensePaid(id: string, schoolSlug: string, data: any) {
    return this.expenseModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'paid', paidBy: data.paidBy, paymentMethod: data.paymentMethod, receiptNumber: data.receiptNumber } },
      { new: true },
    );
  }

  // ── Budgets ──────────────────────────────────────────────
  async getBudgets(schoolSlug: string, academicYear?: string) {
    const filter: any = { schoolSlug };
    if (academicYear) filter.academicYear = academicYear;
    return this.budgetModel.find(filter).sort({ createdAt: -1 });
  }

  async createBudget(data: any) {
    const total = (data.lines || []).reduce((a: number, l: any) => a + l.allocatedAmount, 0);
    const budget = new this.budgetModel({ ...data, totalAllocated: total });
    return budget.save();
  }

  async approveBudget(id: string, schoolSlug: string, approvedBy: string) {
    return this.budgetModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'approved', approvedBy } },
      { new: true },
    );
  }

  // ── Bank Accounts ────────────────────────────────────────
  async getBankAccounts(schoolSlug: string) {
    return this.bankModel.find({ schoolSlug, isActive: true }).sort({ isPrimary: -1, bankName: 1 });
  }

  async createBankAccount(data: any) {
    if (data.isPrimary) {
      await this.bankModel.updateMany({ schoolSlug: data.schoolSlug }, { $set: { isPrimary: false } });
    }
    const acc = new this.bankModel(data);
    return acc.save();
  }

  async updateBankBalance(id: string, schoolSlug: string, balance: number) {
    return this.bankModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { currentBalance: balance } }, { new: true },
    );
  }

  // ── Reports ──────────────────────────────────────────────
  async getIncomeStatement(schoolSlug: string, academicYear: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const [revenue, expenses] = await Promise.all([
      this.paymentModel.aggregate([
        { $match: { schoolSlug, ...(Object.keys(dateFilter).length ? { paymentDate: dateFilter } : {}) } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.expenseModel.aggregate([
        { $match: { schoolSlug, academicYear, status: 'paid', ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
      ]),
    ]);

    const totalRevenue = revenue[0]?.total || 0;
    const totalExpenses = expenses.reduce((a: number, e: any) => a + e.total, 0);

    return {
      totalRevenue, totalExpenses,
      netIncome: totalRevenue - totalExpenses,
      expenseBreakdown: expenses,
    };
  }

  async getFeeCollection(schoolSlug: string, month: string) {
    const [collected, outstanding, byGrade] = await Promise.all([
      this.invoiceModel.aggregate([
        { $match: { schoolSlug, month, isDeleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { schoolSlug, month, status: { $in: ['sent', 'partial', 'overdue'] }, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$balanceDue' } } },
      ]),
      this.invoiceModel.aggregate([
        { $match: { schoolSlug, month, isDeleted: { $ne: true } } },
        { $group: { _id: '$grade', invoiced: { $sum: '$totalAmount' }, collected: { $sum: '$paidAmount' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return { collected, outstanding: outstanding[0]?.total || 0, byGrade };
  }

  // ============================================================
  // REPORTS — Collection & Outstanding
  // ============================================================

  async getCollectionReport(schoolSlug: string, params: {
    groupBy: string; from?: string; to?: string; month?: string;
    grade?: string; academicYear?: string;
  }) {
    const { groupBy, from, to, month, grade, academicYear } = params;

    const paymentMatch: any = { schoolSlug };
    if (from || to) {
      paymentMatch.paymentDate = {};
      if (from) paymentMatch.paymentDate.$gte = new Date(from);
      if (to) paymentMatch.paymentDate.$lte = new Date(to);
    }

    const invoiceMatch: any = { schoolSlug, isDeleted: { $ne: true } };
    if (month) invoiceMatch.month = month;
    if (grade) invoiceMatch.grade = grade;
    if (academicYear) invoiceMatch.academicYear = academicYear;

    switch (groupBy) {
      case 'slip': {
        return this.paymentModel.find(paymentMatch)
          .sort({ paymentDate: -1 })
          .select('receiptNumber studentName invoiceNumber amount paymentMethod paymentDate collectedBy')
          .lean();
      }

      case 'slipRange': {
        const { fromSlip, toSlip } = params as any;
        const rangeMatch: any = { ...paymentMatch };
        if (fromSlip && toSlip) {
          rangeMatch.receiptNumber = { $gte: fromSlip, $lte: toSlip };
        }
        return this.paymentModel.find(rangeMatch).sort({ receiptNumber: 1 }).lean();
      }

      case 'class': {
        return this.paymentModel.aggregate([
          { $match: paymentMatch },
          { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'inv' } },
          { $unwind: { path: '$inv', preserveNullAndEmptyArrays: true } },
          { $group: {
            _id: { $ifNull: ['$inv.grade', 'Unknown'] },
            totalCollected: { $sum: '$amount' },
            paymentCount: { $sum: 1 },
          } },
          { $sort: { _id: 1 } },
        ]);
      }

      case 'month': {
        return this.paymentModel.aggregate([
          { $match: paymentMatch },
          { $project: {
            amount: 1,
            yearMonth: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
          } },
          { $group: { _id: '$yearMonth', totalCollected: { $sum: '$amount' }, paymentCount: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]);
      }

      case 'classMonth': {
        return this.paymentModel.aggregate([
          { $match: paymentMatch },
          { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'inv' } },
          { $unwind: { path: '$inv', preserveNullAndEmptyArrays: true } },
          { $project: {
            amount: 1,
            grade: { $ifNull: ['$inv.grade', 'Unknown'] },
            yearMonth: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
          } },
          { $group: {
            _id: { grade: '$grade', month: '$yearMonth' },
            totalCollected: { $sum: '$amount' },
            paymentCount: { $sum: 1 },
          } },
          { $sort: { '_id.grade': 1, '_id.month': 1 } },
        ]);
      }

      case 'feeCategory': {
        return this.paymentModel.aggregate([
          { $match: paymentMatch },
          { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'inv' } },
          { $unwind: { path: '$inv', preserveNullAndEmptyArrays: true } },
          { $group: {
            _id: { $ifNull: ['$inv.type', 'other'] },
            totalCollected: { $sum: '$amount' },
            paymentCount: { $sum: 1 },
          } },
          { $sort: { totalCollected: -1 } },
        ]);
      }

      case 'wing': {
        return this.paymentModel.aggregate([
          { $match: paymentMatch },
          { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'inv' } },
          { $unwind: { path: '$inv', preserveNullAndEmptyArrays: true } },
          { $lookup: { from: 'grades', let: { g: '$inv.grade', slug: '$schoolSlug' },
            pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$name', '$$g'] }, { $eq: ['$schoolSlug', '$$slug'] }] } } }],
            as: 'gradeDoc' } },
          { $unwind: { path: '$gradeDoc', preserveNullAndEmptyArrays: true } },
          { $group: {
            _id: { $ifNull: ['$gradeDoc.wing', 'Unassigned'] },
            totalCollected: { $sum: '$amount' },
            paymentCount: { $sum: 1 },
          } },
          { $sort: { _id: 1 } },
        ]);
      }

      case 'family': {
        return this.paymentModel.aggregate([
          { $match: paymentMatch },
          { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 'student' } },
          { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
          { $project: {
            amount: 1, studentName: 1,
            familyKey: { $ifNull: [{ $arrayElemAt: ['$student.guardians.phone', 0] }, 'Unknown Family'] },
          } },
          { $group: {
            _id: '$familyKey',
            totalCollected: { $sum: '$amount' },
            paymentCount: { $sum: 1 },
            students: { $addToSet: '$studentName' },
          } },
          { $sort: { totalCollected: -1 } },
        ]);
      }

      case 'exemptions': {
        return this.invoiceModel.find({ ...invoiceMatch, status: 'waived' })
          .select('invoiceNumber studentName grade totalAmount totalDiscount month')
          .lean();
      }

      case 'summary':
      default: {
        const [totals, byStatus] = await Promise.all([
          this.paymentModel.aggregate([
            { $match: paymentMatch },
            { $group: { _id: null, totalCollected: { $sum: '$amount' }, paymentCount: { $sum: 1 } } },
          ]),
          this.invoiceModel.aggregate([
            { $match: invoiceMatch },
            { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
          ]),
        ]);
        return { totals: totals[0] || { totalCollected: 0, paymentCount: 0 }, byStatus };
      }
    }
  }

  async getOutstandingReport(schoolSlug: string, params: {
    groupBy: string; grade?: string; academicYear?: string;
  }) {
    const { groupBy, grade, academicYear } = params;
    const match: any = {
      schoolSlug, isDeleted: { $ne: true },
      status: { $in: ['sent', 'partial', 'overdue'] },
      balanceDue: { $gt: 0 },
    };
    if (grade) match.grade = grade;
    if (academicYear) match.academicYear = academicYear;

    switch (groupBy) {
      case 'class': {
        return this.invoiceModel.aggregate([
          { $match: match },
          { $group: { _id: '$grade', totalOutstanding: { $sum: '$balanceDue' }, invoiceCount: { $sum: 1 } } },
          { $sort: { totalOutstanding: -1 } },
        ]);
      }

      case 'wing': {
        return this.invoiceModel.aggregate([
          { $match: match },
          { $lookup: { from: 'grades', let: { g: '$grade', slug: '$schoolSlug' },
            pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$name', '$$g'] }, { $eq: ['$schoolSlug', '$$slug'] }] } } }],
            as: 'gradeDoc' } },
          { $unwind: { path: '$gradeDoc', preserveNullAndEmptyArrays: true } },
          { $group: {
            _id: { $ifNull: ['$gradeDoc.wing', 'Unassigned'] },
            totalOutstanding: { $sum: '$balanceDue' },
            invoiceCount: { $sum: 1 },
          } },
          { $sort: { _id: 1 } },
        ]);
      }

      case 'family':
      case 'familyHead': {
        return this.invoiceModel.aggregate([
          { $match: match },
          { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 'student' } },
          { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
          { $project: {
            balanceDue: 1, studentName: 1,
            familyKey: { $ifNull: [{ $arrayElemAt: ['$student.guardians.phone', 0] }, 'Unknown Family'] },
            guardianName: { $ifNull: [{ $arrayElemAt: ['$student.guardians.name', 0] }, 'Unknown'] },
          } },
          { $group: {
            _id: '$familyKey',
            guardianName: { $first: '$guardianName' },
            totalOutstanding: { $sum: '$balanceDue' },
            invoiceCount: { $sum: 1 },
            students: { $addToSet: '$studentName' },
          } },
          { $sort: { totalOutstanding: -1 } },
        ]);
      }

      case 'hold': {
        return this.invoiceModel.find({ schoolSlug, status: 'hold', isDeleted: { $ne: true } })
          .select('invoiceNumber studentName grade totalAmount balanceDue month')
          .lean();
      }

      case 'deleted': {
        return this.invoiceModel.find({ schoolSlug, isDeleted: true })
          .select('invoiceNumber studentName grade totalAmount deletedAt deletedBy deleteReason')
          .lean();
      }

      case 'summary':
      default: {
        const [total, byStatus] = await Promise.all([
          this.invoiceModel.aggregate([
            { $match: match },
            { $group: { _id: null, totalOutstanding: { $sum: '$balanceDue' }, invoiceCount: { $sum: 1 } } },
          ]),
          this.invoiceModel.aggregate([
            { $match: { schoolSlug, isDeleted: { $ne: true }, balanceDue: { $gt: 0 } } },
            { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$balanceDue' } } },
          ]),
        ]);
        return { total: total[0] || { totalOutstanding: 0, invoiceCount: 0 }, byStatus };
      }
    }
  }

  async softDeleteInvoice(id: string, schoolSlug: string, deletedBy: string, reason?: string) {
    const invoice = await this.invoiceModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedBy, deleteReason: reason } },
      { new: true },
    );
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }
}
