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
  DiscountProgram, DiscountProgramDocument,
  FeeAssignment, FeeAssignmentDocument,
} from './schemas/finance.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Family, FamilyDocument } from '../families/schemas/family.schema';
import { Campus, CampusDocument, Grade, GradeDocument } from '../organization/schemas/organization.schema';

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
    @InjectModel(DiscountProgram.name) private discountProgramModel: Model<DiscountProgramDocument>,
    @InjectModel(FeeAssignment.name) private feeAssignmentModel: Model<FeeAssignmentDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Family.name) private familyModel: Model<FamilyDocument>,
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
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
    const acc = new this.bankModel({
      ...data,
      // currentBalance must start equal to openingBalance, otherwise it silently
      // defaults to 0 and the UI's `currentBalance ?? openingBalance` fallback
      // never kicks in (0 is not null/undefined, so ?? short-circuits on it).
      currentBalance: data.openingBalance ?? 0,
    });
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

  private formatInvoiceMonth(month: string): string {
    if (!month) return '';
    const [y, m] = month.split('-');
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const idx = parseInt(m, 10) - 1;
    return (names[idx] || m) + ' ' + y;
  }

  async getOutstandingDetailReport(schoolSlug: string, params: { grade?: string; academicYear?: string }) {
    const { grade, academicYear } = params;
    const match: any = {
      schoolSlug, isDeleted: { $ne: true },
      status: { $in: ['sent', 'partial', 'overdue'] },
      balanceDue: { $gt: 0 },
    };
    if (grade) match.grade = grade;
    if (academicYear) match.academicYear = academicYear;

    const invoices = await this.invoiceModel.aggregate([
      { $match: match },
      { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 'student' } },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      { $project: {
        studentId: 1, studentName: 1, balanceDue: 1, month: 1, items: 1,
        admissionNumber: '$student.admissionNumber',
        gender: '$student.gender',
        currentGrade: { $ifNull: ['$student.currentGrade', '$grade'] },
        currentSection: '$student.currentSection',
        contact: { $ifNull: [{ $arrayElemAt: ['$student.guardians.phone', 0] }, '$student.personalPhone'] },
      } },
    ]);

    // Build per-student rows
    const studentMap = new Map<string, any>();
    for (const inv of invoices) {
      const sid = String(inv.studentId || inv.studentName);
      if (!studentMap.has(sid)) {
        studentMap.set(sid, {
          studentId: sid,
          studentName: inv.studentName,
          admissionNumber: inv.admissionNumber || '',
          gender: inv.gender || '',
          grade: inv.currentGrade || 'Unassigned',
          section: inv.currentSection || '',
          contact: inv.contact || '',
          items: [],
          subtotal: 0,
        });
      }
      const entry = studentMap.get(sid);
      const descriptions = (inv.items || []).map((i: any) => i.description).filter(Boolean).join(', ') || 'Fee';
      const particular = descriptions + ' - ' + this.formatInvoiceMonth(inv.month);
      entry.items.push({ particular, balance: inv.balanceDue });
      entry.subtotal += inv.balanceDue;
    }

    // Group students by grade + section
    const groupMap = new Map<string, any>();
    for (const student of studentMap.values()) {
      const groupKey = student.grade + '||' + student.section;
      if (!groupMap.has(groupKey)) {
        const groupLabel = student.section ? (student.grade + ' - ' + student.section) : student.grade;
        groupMap.set(groupKey, {
          grade: student.grade, section: student.section, groupLabel,
          students: [], studentCount: 0, maleCount: 0, femaleCount: 0, totalBalance: 0,
        });
      }
      const group = groupMap.get(groupKey);
      group.students.push(student);
      group.studentCount += 1;
      if (student.gender === 'male') group.maleCount += 1;
      if (student.gender === 'female') group.femaleCount += 1;
      group.totalBalance += student.subtotal;
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
    const grandTotal = {
      studentCount: groups.reduce((a, g) => a + g.studentCount, 0),
      totalBalance: groups.reduce((a, g) => a + g.totalBalance, 0),
    };

    return { groups, grandTotal };
  }

  async getCollectionDetailReport(schoolSlug: string, params: {
    from?: string; to?: string; month?: string; grade?: string; academicYear?: string;
  }) {
    const { from, to, month, grade, academicYear } = params;

    const paymentMatch: any = { schoolSlug };
    if (from || to) {
      paymentMatch.paymentDate = {};
      if (from) paymentMatch.paymentDate.$gte = new Date(from);
      if (to) paymentMatch.paymentDate.$lte = new Date(to);
    }

    const payments = await this.paymentModel.aggregate([
      { $match: paymentMatch },
      { $lookup: { from: 'invoices', localField: 'invoiceId', foreignField: '_id', as: 'inv' } },
      { $unwind: { path: '$inv', preserveNullAndEmptyArrays: true } },
      ...(month ? [{ $match: { 'inv.month': month } }] : []),
      ...(grade ? [{ $match: { 'inv.grade': grade } }] : []),
      ...(academicYear ? [{ $match: { 'inv.academicYear': academicYear } }] : []),
      { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 'student' } },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      { $project: {
        studentId: 1, studentName: 1, amount: 1, paymentDate: 1,
        month: '$inv.month', items: '$inv.items',
        admissionNumber: '$student.admissionNumber',
        gender: '$student.gender',
        currentGrade: { $ifNull: ['$student.currentGrade', '$inv.grade'] },
        currentSection: '$student.currentSection',
        contact: { $ifNull: [{ $arrayElemAt: ['$student.guardians.phone', 0] }, '$student.personalPhone'] },
      } },
    ]);

    const studentMap = new Map<string, any>();
    for (const p of payments) {
      const sid = String(p.studentId || p.studentName);
      if (!studentMap.has(sid)) {
        studentMap.set(sid, {
          studentId: sid,
          studentName: p.studentName,
          admissionNumber: p.admissionNumber || '',
          gender: p.gender || '',
          grade: p.currentGrade || 'Unassigned',
          section: p.currentSection || '',
          contact: p.contact || '',
          items: [],
          subtotal: 0,
        });
      }
      const entry = studentMap.get(sid);
      const descriptions = (p.items || []).map((i: any) => i.description).filter(Boolean).join(', ') || 'Fee';
      const particular = descriptions + ' - ' + this.formatInvoiceMonth(p.month);
      entry.items.push({ particular, balance: p.amount });
      entry.subtotal += p.amount;
    }

    const groupMap = new Map<string, any>();
    for (const student of studentMap.values()) {
      const groupKey = student.grade + '||' + student.section;
      if (!groupMap.has(groupKey)) {
        const groupLabel = student.section ? (student.grade + ' - ' + student.section) : student.grade;
        groupMap.set(groupKey, {
          grade: student.grade, section: student.section, groupLabel,
          students: [], studentCount: 0, maleCount: 0, femaleCount: 0, totalBalance: 0,
        });
      }
      const group = groupMap.get(groupKey);
      group.students.push(student);
      group.studentCount += 1;
      if (student.gender === 'male') group.maleCount += 1;
      if (student.gender === 'female') group.femaleCount += 1;
      group.totalBalance += student.subtotal;
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
    const grandTotal = {
      studentCount: groups.reduce((a, g) => a + g.studentCount, 0),
      totalBalance: groups.reduce((a, g) => a + g.totalBalance, 0),
    };

    return { groups, grandTotal };
  }

  // ============================================================
  // DISCOUNT / SCHOLARSHIP PROGRAMS
  // ============================================================
  async getDiscountPrograms(schoolSlug: string) {
    return this.discountProgramModel.find({ schoolSlug }).sort({ name: 1 }).lean();
  }

  async createDiscountProgram(data: any) {
    const program = new this.discountProgramModel(data);
    return program.save();
  }

  async updateDiscountProgram(id: string, schoolSlug: string, data: any) {
    const program = await this.discountProgramModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!program) throw new NotFoundException('Discount program not found');
    return program;
  }

  async deleteDiscountProgram(id: string, schoolSlug: string) {
    const program = await this.discountProgramModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { isActive: false } });
    if (!program) throw new NotFoundException('Discount program not found');
    return { message: 'Discount program deactivated' };
  }

  // ============================================================
  // FEE ASSIGNMENTS (assign a discount/scholarship to a student,
  // family, class, section, or campus)
  // ============================================================
  async getFeeAssignments(schoolSlug: string) {
    return this.feeAssignmentModel.find({ schoolSlug, isActive: true }).sort({ createdAt: -1 }).lean();
  }

  async createFeeAssignment(data: any) {
    if (data.discountProgramId) {
      const program = await this.discountProgramModel.findOne({ _id: data.discountProgramId, schoolSlug: data.schoolSlug });
      if (!program) throw new BadRequestException('Discount program not found');
      data.discountProgramName = program.name;
    } else if (!data.overrideValueType || data.overrideValue == null) {
      throw new BadRequestException('Either a discount program or an override value/type is required');
    }
    const assignment = new this.feeAssignmentModel(data);
    return assignment.save();
  }

  async deleteFeeAssignment(id: string, schoolSlug: string) {
    const assignment = await this.feeAssignmentModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { isActive: false } });
    if (!assignment) throw new NotFoundException('Fee assignment not found');
    return { message: 'Fee assignment removed' };
  }

  // ============================================================
  // CHALLAN / INVOICE GENERATION ENGINE
  // Bridges Fee Structure (pricing per class/section) + Fee Assignments
  // (discounts/scholarships per student/family/class/section/campus)
  // into real, per-student Invoice (challan) records for a given month.
  // Idempotent: re-running for the same student+month+academicYear will
  // not create duplicates.
  // ============================================================
  async generateInvoices(schoolSlug: string, params: {
    month: string;
    academicYear: string;
    scopeType?: 'all' | 'class' | 'section' | 'campus' | 'student';
    scopeValue?: string;
    createdBy?: string;
  }) {
    const { month, academicYear, scopeType = 'all', scopeValue, createdBy } = params;
    if (!month) throw new BadRequestException('month is required (e.g. 2026-03)');
    if (!academicYear) throw new BadRequestException('academicYear is required');

    const studentMatch: any = { schoolSlug, status: 'active' };
    if (scopeType === 'class' && scopeValue) {
      studentMatch.currentGrade = scopeValue;
    } else if (scopeType === 'section' && scopeValue) {
      const [g, s] = scopeValue.split('::');
      studentMatch.currentGrade = g;
      if (s) studentMatch.currentSection = s;
    } else if (scopeType === 'student' && scopeValue) {
      studentMatch._id = new Types.ObjectId(scopeValue);
    } else if (scopeType === 'campus' && scopeValue) {
      const campus = await this.campusModel.findOne({ schoolSlug, name: scopeValue }).lean();
      if (!campus) return { created: 0, skipped: 0, errors: [`Campus "${scopeValue}" not found`] };
      studentMatch.campusId = String((campus as any)._id);
    }

    const students = await this.studentModel.find(studentMatch).lean();
    if (students.length === 0) return { created: 0, skipped: 0, errors: ['No matching active students found for this scope'] };

    const [feeStructures, assignments, discountPrograms, campuses] = await Promise.all([
      // Match on isActive + grade/section/campus only, not academicYear.
      // FeeStructure.academicYear reflects whatever year happened to be
      // "current" at creation time (which, for structures made before the
      // Academic Year system existed, is stale) - a class's pricing is a
      // current-state catalog, not something that needs a fresh record
      // every year, so requiring an exact year match here just silently
      // produced zero matches.
      this.feeStructModel.find({ schoolSlug, isActive: true }).lean(),
      this.feeAssignmentModel.find({ schoolSlug, isActive: true }).lean(),
      this.discountProgramModel.find({ schoolSlug, isActive: true }).lean(),
      this.campusModel.find({ schoolSlug }).lean(),
    ]);
    const programById = new Map(discountPrograms.map((p: any) => [String(p._id), p]));
    const campusIdToName = new Map(campuses.map((c: any) => [String(c._id), c.name]));
    const now = new Date();

    // Batch-fetch which students already have an invoice for this month -
    // one query for the whole run instead of one findOne() per student.
    // With ~179 students, the per-student version meant ~179 sequential
    // DB round-trips, easily timing out the request (the same class of
    // bug already found once before in the bulk student import).
    const existingInvoices = await this.invoiceModel
      .find({ schoolSlug, month, academicYear, isDeleted: { $ne: true } }, { studentId: 1 })
      .lean();
    const alreadyInvoiced = new Set(existingInvoices.map((inv: any) => String(inv.studentId)));

    let created = 0, skippedAlreadyBilled = 0, skippedNoMatch = 0;
    const errors: string[] = [];
    const gradesWithNoMatch = new Map<string, number>(); // grade/section -> count of students affected

    for (const student of students) {
      try {
        if (alreadyInvoiced.has(String(student._id))) { skippedAlreadyBilled++; continue; }

        const studentCampusName = campusIdToName.get(String((student as any).campusId)) || '';

        const applicableStructures = feeStructures.filter((fs: any) =>
          fs.grade === (student as any).currentGrade &&
          (!fs.section || fs.section === (student as any).currentSection) &&
          (!fs.campus || fs.campus === studentCampusName)
        );
        if (applicableStructures.length === 0) {
          skippedNoMatch++;
          const key = `${(student as any).currentGrade || 'Unknown'}${(student as any).currentSection ? ' - ' + (student as any).currentSection : ''}`;
          gradesWithNoMatch.set(key, (gradesWithNoMatch.get(key) || 0) + 1);
          continue;
        }

        const studentAssignments = assignments.filter((a: any) => {
          if (a.effectiveFrom && new Date(a.effectiveFrom) > now) return false;
          if (a.effectiveTo && new Date(a.effectiveTo) < now) return false;
          if (a.targetType === 'student') return a.targetValue === String(student._id);
          if (a.targetType === 'family') return (student as any).familyId && a.targetValue === String((student as any).familyId);
          if (a.targetType === 'class') return a.targetValue === (student as any).currentGrade;
          if (a.targetType === 'section') return a.targetValue === `${(student as any).currentGrade}::${(student as any).currentSection}`;
          if (a.targetType === 'campus') return a.targetValue === studentCampusName;
          return false;
        });

        const items: any[] = [];
        let dueDay = 10;
        let lateFine = 0;

        for (const fs of applicableStructures) {
          if (fs.dueDay) dueDay = fs.dueDay;
          if (fs.lateFeeAmount) lateFine += fs.lateFeeAmount;
          for (const item of (fs.items || [])) {
            const baseAmount = item.amount || 0;
            let discount = 0;
            for (const a of studentAssignments) {
              if (a.feeHeadName && a.feeHeadName !== item.feeHead) continue;
              let valueType = a.overrideValueType, value = a.overrideValue, maxAmount: number | undefined;
              if (a.discountProgramId) {
                const program = programById.get(String(a.discountProgramId));
                if (!program) continue;
                valueType = program.valueType; value = program.value; maxAmount = program.maxAmount;
              }
              let thisDiscount = valueType === 'percentage' ? (baseAmount * (value || 0)) / 100 : (value || 0);
              if (maxAmount != null) thisDiscount = Math.min(thisDiscount, maxAmount);
              discount += thisDiscount;
            }
            discount = Math.min(discount, baseAmount); // never let stacked discounts exceed the item itself
            items.push({
              description: `${fs.name}${fs.section ? ` (${fs.grade} - ${fs.section})` : ` (${fs.grade})`}`,
              amount: baseAmount,
              discount: Math.round(discount),
              netAmount: Math.round(baseAmount - discount),
            });
          }
        }

        const subtotal = items.reduce((a, i) => a + i.amount, 0);
        const totalDiscount = items.reduce((a, i) => a + i.discount, 0);
        const totalAmount = subtotal - totalDiscount;

        const [y, m] = month.split('-').map(Number);
        const dueDate = y && m ? new Date(y, m - 1, Math.min(dueDay, 28)) : undefined;

        const invoice = new this.invoiceModel({
          type: 'fee',
          studentId: student._id,
          studentName: `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim(),
          grade: (student as any).currentGrade,
          section: (student as any).currentSection,
          month, academicYear,
          items, subtotal, totalDiscount, totalAmount,
          balanceDue: totalAmount,
          status: 'sent',
          dueDate,
          lateFine,
          createdBy,
          schoolSlug,
        });
        await invoice.save();
        created++;
      } catch (err: any) {
        errors.push(`${(student as any).firstName || ''} ${(student as any).lastName || ''}: ${err.message}`);
      }
    }

    return {
      created,
      skipped: skippedAlreadyBilled + skippedNoMatch,
      skippedAlreadyBilled,
      skippedNoMatch,
      noMatchBreakdown: Array.from(gradesWithNoMatch.entries()).map(([grade, count]) => ({ grade, count })),
      errors,
      totalStudents: students.length,
    };
  }
}
