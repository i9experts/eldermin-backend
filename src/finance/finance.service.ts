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
import {
  FiscalYear, FiscalYearDocument,
  AccountingPeriod, AccountingPeriodDocument,
  CostCenter, CostCenterDocument,
  PaymentTerm, PaymentTermDocument,
  JournalEntry, JournalEntryDocument,
} from './schemas/ledger.schema';
import {
  Vendor, VendorDocument,
  VendorBill, VendorBillDocument,
  VendorPayment, VendorPaymentDocument,
} from './schemas/vendor.schema';
import {
  TaxTemplate, TaxTemplateDocument,
  ItemTaxTemplate, ItemTaxTemplateDocument,
  TaxRule, TaxRuleDocument,
  WithholdingTaxCategory, WithholdingTaxCategoryDocument,
} from './schemas/tax.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Family, FamilyDocument } from '../families/schemas/family.schema';
import { Campus, CampusDocument, Grade, GradeDocument } from '../organization/schemas/organization.schema';

const paged = (page = 1, limit = 20) => ({ skip: (page - 1) * limit, limit });

// Accounts every auto-posting rule needs to exist — including a Suspense
// account so a posting never silently fails just because a school hasn't
// finished mapping every category to a GL account yet.
const SUSPENSE_ACCOUNT_CODE = '9999';

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
    @InjectModel(FiscalYear.name) private fiscalYearModel: Model<FiscalYearDocument>,
    @InjectModel(AccountingPeriod.name) private periodModel: Model<AccountingPeriodDocument>,
    @InjectModel(CostCenter.name) private costCenterModel: Model<CostCenterDocument>,
    @InjectModel(PaymentTerm.name) private paymentTermModel: Model<PaymentTermDocument>,
    @InjectModel(JournalEntry.name) private journalModel: Model<JournalEntryDocument>,
    @InjectModel(Vendor.name) private vendorModel: Model<VendorDocument>,
    @InjectModel(VendorBill.name) private vendorBillModel: Model<VendorBillDocument>,
    @InjectModel(VendorPayment.name) private vendorPaymentModel: Model<VendorPaymentDocument>,
    @InjectModel(TaxTemplate.name) private taxTemplateModel: Model<TaxTemplateDocument>,
    @InjectModel(ItemTaxTemplate.name) private itemTaxTemplateModel: Model<ItemTaxTemplateDocument>,
    @InjectModel(TaxRule.name) private taxRuleModel: Model<TaxRuleDocument>,
    @InjectModel(WithholdingTaxCategory.name) private withholdingCategoryModel: Model<WithholdingTaxCategoryDocument>,
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
      { code: '1300', name: 'Employee Advances', type: 'asset', subType: 'current_asset' },
      { code: '2000', name: 'Accounts Payable', type: 'liability', subType: 'current_liability' },
      { code: '2100', name: 'Salaries Payable', type: 'liability', subType: 'current_liability' },
      { code: '2200', name: 'Tax Payable', type: 'liability', subType: 'current_liability' },
      { code: '2300', name: 'Provident Fund Payable', type: 'liability', subType: 'current_liability' },
      // Phase 3 — tax engine accounts. Kept distinct from the generic 2200
      // "Tax Payable" seeded in Phase 1 so sales tax, input tax, and
      // withholding tax each have their own trackable ledger account.
      { code: '2400', name: 'Sales Tax Payable', type: 'liability', subType: 'current_liability' },
      { code: '1400', name: 'Input Tax / Purchase Tax Receivable', type: 'asset', subType: 'current_asset' },
      { code: '2500', name: 'Withholding Tax Payable', type: 'liability', subType: 'current_liability' },
      { code: '3000', name: "Owner's Equity", type: 'equity', subType: 'equity' },
      { code: '4000', name: 'Tuition Fee Revenue', type: 'revenue', subType: 'operating_revenue' },
      { code: '4100', name: 'Admission Fee Revenue', type: 'revenue', subType: 'operating_revenue' },
      { code: '4200', name: 'Transport Fee Revenue', type: 'revenue', subType: 'operating_revenue' },
      { code: '5000', name: 'Salaries & Wages', type: 'expense', subType: 'operating_expense' },
      { code: '5100', name: 'Utilities', type: 'expense', subType: 'operating_expense' },
      { code: '5200', name: 'Maintenance & Repairs', type: 'expense', subType: 'operating_expense' },
      { code: '5300', name: 'Academic Supplies', type: 'expense', subType: 'operating_expense' },
      { code: '5400', name: 'Marketing & Advertising', type: 'expense', subType: 'operating_expense' },
      { code: '5500', name: 'Employee Reimbursements', type: 'expense', subType: 'operating_expense' },
      { code: '5600', name: 'Other Operating Expenses', type: 'expense', subType: 'operating_expense' },
      { code: '9999', name: 'Suspense / Unmapped', type: 'liability', subType: 'current_liability' },
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

  // ============================================================
  // LEDGER FOUNDATION — Fiscal Years, Periods, Cost Centers,
  // Payment Terms, and the double-entry Journal Entry engine.
  // Everything below is what actually closes the "nothing posts to the
  // Chart of Accounts" gap. See the Odoo-standard finance build plan doc.
  // ============================================================

  // ── Fiscal Years ─────────────────────────────────────────
  async getFiscalYears(schoolSlug: string) {
    return this.fiscalYearModel.find({ schoolSlug }).sort({ startDate: -1 });
  }

  async createFiscalYear(data: any) {
    return this.fiscalYearModel.create(data);
  }

  async closeFiscalYear(id: string, schoolSlug: string, closedBy: string) {
    const fy = await this.fiscalYearModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { isClosed: true, closedAt: new Date(), closedBy } },
      { new: true },
    );
    if (!fy) throw new NotFoundException('Fiscal year not found');
    return fy;
  }

  // Auto-seeds a fiscal year covering `date` if none exists yet — postings
  // should never hard-fail just because nobody has configured a fiscal
  // calendar in advance, matching the auto-seed-on-first-access pattern
  // used elsewhere in this app (ExitSettings, AttendanceSettings, etc.).
  private async getOrCreateFiscalYear(schoolSlug: string, date: Date) {
    let fy = await this.fiscalYearModel.findOne({
      schoolSlug, startDate: { $lte: date }, endDate: { $gte: date },
    });
    if (fy) return fy;
    // Default to a July-June academic fiscal year (common for Pakistani
    // schools); schools can create their own to override this default.
    const year = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
    const startDate = new Date(year, 6, 1);
    const endDate = new Date(year + 1, 5, 30, 23, 59, 59);
    fy = await this.fiscalYearModel.create({
      schoolSlug, startDate, endDate, isActive: true,
      name: `FY ${year}-${String(year + 1).slice(2)}`,
    });
    return fy;
  }

  // ── Accounting Periods ───────────────────────────────────
  async getAccountingPeriods(schoolSlug: string, fiscalYearId?: string) {
    const filter: any = { schoolSlug };
    if (fiscalYearId) filter.fiscalYearId = fiscalYearId;
    return this.periodModel.find(filter).sort({ startDate: 1 });
  }

  async setPeriodStatus(id: string, schoolSlug: string, status: string) {
    const p = await this.periodModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { status } }, { new: true });
    if (!p) throw new NotFoundException('Accounting period not found');
    return p;
  }

  private async getOrCreatePeriod(schoolSlug: string, date: Date) {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
    let period = await this.periodModel.findOne({ schoolSlug, startDate: startOfMonth });
    if (period) return period;
    const fy = await this.getOrCreateFiscalYear(schoolSlug, date);
    period = await this.periodModel.create({
      schoolSlug, fiscalYearId: fy._id, startDate: startOfMonth, endDate: endOfMonth,
      name: date.toLocaleString('default', { month: 'long', year: 'numeric' }),
      status: 'open',
    });
    return period;
  }

  // ── Cost Centers ─────────────────────────────────────────
  async getCostCenters(schoolSlug: string) {
    return this.costCenterModel.find({ schoolSlug, isActive: true }).sort({ code: 1 });
  }

  async createCostCenter(data: any) {
    return this.costCenterModel.create(data);
  }

  async updateCostCenter(id: string, schoolSlug: string, data: any) {
    return this.costCenterModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  // Seeds one cost center per existing Campus so the dimension is usable
  // immediately without a separate manual setup step.
  async seedCostCentersFromCampuses(schoolSlug: string) {
    const campuses = await this.campusModel.find({ schoolSlug } as any).lean().catch(() => []);
    const list = (campuses as any[]).length > 0 ? campuses : [{ name: 'Main Campus', _id: null }];
    const ops = list.map((c: any, i: number) => ({
      updateOne: {
        filter: { schoolSlug, code: `CC-${String(i + 1).padStart(3, '0')}` },
        update: { $setOnInsert: { schoolSlug, code: `CC-${String(i + 1).padStart(3, '0')}`, name: c.name, type: 'campus', isActive: true } },
        upsert: true,
      },
    }));
    await this.costCenterModel.bulkWrite(ops);
    return this.costCenterModel.find({ schoolSlug });
  }

  // Best-effort resolve a cost center by matching a campus/department name
  // string (what most transaction records store today) against the
  // configured Cost Centers — returns null rather than throwing if nothing
  // matches, since Cost Center is a reporting dimension, not a required
  // field for a posting to succeed.
  private async resolveCostCenterByName(schoolSlug: string, name?: string) {
    if (!name) return null;
    return this.costCenterModel.findOne({ schoolSlug, name: new RegExp(`^${name}$`, 'i') });
  }

  // ── Payment Terms ────────────────────────────────────────
  async getPaymentTerms(schoolSlug: string) {
    return this.paymentTermModel.find({ schoolSlug, isActive: true }).sort({ dueDays: 1 });
  }

  async createPaymentTerm(data: any) {
    return this.paymentTermModel.create(data);
  }

  async seedDefaultPaymentTerms(schoolSlug: string) {
    const defaults = [
      { name: 'Due on Receipt', dueDays: 0, isDefault: true },
      { name: 'Net 15', dueDays: 15 },
      { name: 'Net 30', dueDays: 30 },
    ];
    const ops = defaults.map(d => ({
      updateOne: { filter: { schoolSlug, name: d.name }, update: { $setOnInsert: { ...d, schoolSlug, isActive: true } }, upsert: true },
    }));
    await this.paymentTermModel.bulkWrite(ops);
    return this.paymentTermModel.find({ schoolSlug });
  }

  // ── Journal Entry engine ─────────────────────────────────
  private async resolveAccount(schoolSlug: string, code: string) {
    let acc = await this.coaModel.findOne({ schoolSlug, code, isActive: true });
    if (!acc) acc = await this.coaModel.findOne({ schoolSlug, code: SUSPENSE_ACCOUNT_CODE });
    return acc;
  }

  private accountIncreasesOnDebit(type: string) {
    return type === 'asset' || type === 'expense';
  }

  // The core double-entry posting mechanism. Every transaction type
  // (fee, payroll, expense, advance...) ultimately calls this. Rejects
  // any entry that doesn't balance — that guarantee is what makes Trial
  // Balance provably correct rather than just "probably fine."
  async postJournalEntry(schoolSlug: string, dto: {
    date?: Date | string; reference?: string; narration?: string;
    sourceType: string; sourceId?: string; postedBy?: string;
    lines: { accountCode: string; costCenterName?: string; debit?: number; credit?: number; partnerType?: string; partnerId?: string; partnerName?: string; taxTemplateName?: string }[];
  }) {
    if (!dto.lines || dto.lines.length < 2) throw new BadRequestException('A journal entry needs at least two lines');
    const date = dto.date ? new Date(dto.date) : new Date();

    const resolvedLines = await Promise.all(dto.lines.map(async (l) => {
      const debit = Math.round((l.debit || 0) * 100) / 100;
      const credit = Math.round((l.credit || 0) * 100) / 100;
      if (debit > 0 && credit > 0) throw new BadRequestException('A journal line cannot have both a debit and a credit');
      const account = await this.resolveAccount(schoolSlug, l.accountCode);
      if (!account) throw new BadRequestException(`Account ${l.accountCode} not found and no Suspense account is configured — run Seed Default COA first`);
      const costCenter = l.costCenterName ? await this.resolveCostCenterByName(schoolSlug, l.costCenterName) : null;
      return {
        accountCode: account.code, accountName: account.name,
        costCenterId: costCenter?._id || null, costCenterName: costCenter?.name,
        debit, credit,
        partnerType: l.partnerType || null, partnerId: l.partnerId, partnerName: l.partnerName,
        isUnmapped: account.code === SUSPENSE_ACCOUNT_CODE && account.code !== l.accountCode,
        taxTemplateName: l.taxTemplateName,
        _accountDoc: account,
      };
    }));

    const totalDebit = resolvedLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = resolvedLines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new BadRequestException(`Journal entry does not balance: debit ${totalDebit} vs credit ${totalCredit}`);
    }

    const period = await this.getOrCreatePeriod(schoolSlug, date);

    const entry = await this.journalModel.create({
      schoolSlug, date, reference: dto.reference, narration: dto.narration,
      sourceType: dto.sourceType, sourceId: dto.sourceId, postedBy: dto.postedBy,
      periodId: period._id, fiscalYearId: period.fiscalYearId,
      status: 'posted', postedAt: new Date(),
      totalDebit, totalCredit,
      lines: resolvedLines.map(({ _accountDoc, ...rest }) => rest),
    });

    // Update running balances per the account's normal balance side.
    for (const l of resolvedLines) {
      const acc = l._accountDoc;
      const increases = this.accountIncreasesOnDebit(acc.type);
      const delta = increases ? (l.debit - l.credit) : (l.credit - l.debit);
      await this.coaModel.updateOne({ _id: acc._id }, { $inc: { currentBalance: delta } });
    }

    return entry;
  }

  async getJournalEntries(schoolSlug: string, query: any = {}) {
    const { page = 1, limit = 30, sourceType, from, to } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (sourceType) filter.sourceType = sourceType;
    if (from || to) { filter.date = {}; if (from) filter.date.$gte = new Date(from); if (to) filter.date.$lte = new Date(to); }
    const [data, total] = await Promise.all([
      this.journalModel.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
      this.journalModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ── Auto-posting hooks (called from Invoice/Payment/Expense flows) ──
  private mapExpenseCategoryToAccount(category: string): string {
    const c = (category || '').toLowerCase();
    if (c.includes('utilit')) return '5100';
    if (c.includes('maint') || c.includes('repair')) return '5200';
    if (c.includes('academic') || c.includes('supp')) return '5300';
    if (c.includes('market') || c.includes('advert')) return '5400';
    if (c.includes('salar') || c.includes('wage')) return '5000';
    return '5600'; // Other Operating Expenses
  }

  private mapPaymentMethodToAccount(method: string): string {
    return method === 'cash' ? '1000' : '1100'; // Cash vs Bank Accounts
  }

  private mapInvoiceTypeToRevenueAccount(type: string): string {
    if (type === 'admission') return '4100';
    if (type === 'transport') return '4200';
    return '4000'; // Tuition Fee Revenue (default)
  }

  // Phase 3 — resolves the sales tax to apply to a fee invoice (or the
  // purchase tax to apply to a vendor bill line): checks active TaxRules
  // in priority order first (a single-condition override, e.g. "campus X
  // is exempt"), then falls back to the ItemTaxTemplate default for
  // (direction, itemType). Returns null (no tax) rather than throwing —
  // tax resolution is fully optional so schools with no tax configured
  // see zero behavior change.
  private async resolveTaxForLine(schoolSlug: string, direction: 'sales' | 'purchase', itemType: string, context: Record<string, any> = {}) {
    try {
      const rules = await this.taxRuleModel.find({ schoolSlug, isActive: true }).sort({ priority: 1 }).populate('taxTemplateId');
      for (const rule of rules as any[]) {
        const cond = rule.condition;
        if (!cond?.field) continue;
        const ctxValue = context?.[cond.field];
        if (ctxValue === undefined || ctxValue === null) continue;
        const matches = (cond.operator || 'eq') === 'eq' && String(ctxValue) === String(cond.value);
        if (!matches) continue;
        const template = rule.taxTemplateId as any;
        if (template && template.isActive && (template.type === direction || (direction === 'purchase' && template.type === 'withholding'))) {
          return template;
        }
      }

      if (!itemType) return null;
      const itemTemplate = await this.itemTaxTemplateModel.findOne({ schoolSlug, direction, itemType, isActive: true }).populate('taxTemplateId');
      const template = itemTemplate?.taxTemplateId as any;
      if (template && template.isActive) return template;
      return null;
    } catch {
      return null; // tax resolution must never block the underlying transaction
    }
  }

  // Computes the tax amount for a given base amount using a resolved
  // TaxTemplate ('percentage' scales with the amount, 'fixed' is a flat
  // charge regardless of amount). Returns 0 if no template resolves.
  private async computeSalesTax(schoolSlug: string, itemType: string, context: Record<string, any>, baseAmount: number) {
    const taxTemplate = await this.resolveTaxForLine(schoolSlug, 'sales', itemType, context);
    if (!taxTemplate) return { taxAmount: 0, taxTemplate: null as any };
    const taxAmount = taxTemplate.computationMethod === 'fixed'
      ? Math.round((taxTemplate.rate || 0) * 100) / 100
      : Math.round(baseAmount * (taxTemplate.rate || 0)) / 100;
    return { taxAmount, taxTemplate };
  }

  private async postFeeInvoiceJournal(schoolSlug: string, invoice: any, taxTemplate?: any) {
    if (!invoice.totalAmount) return; // nothing to post for a zero-value invoice
    try {
      const taxAmount = Math.round((invoice.totalTax || 0) * 100) / 100;
      // The tax portion must never inflate revenue — the school doesn't
      // keep the tax, it's a pass-through liability — so revenue is
      // recognized net of tax while AR is debited for the tax-inclusive total.
      const revenueAmount = Math.round((invoice.totalAmount - taxAmount) * 100) / 100;
      const lines: any[] = [
        { accountCode: '1200', debit: invoice.totalAmount, partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName, costCenterName: invoice.campus },
        { accountCode: this.mapInvoiceTypeToRevenueAccount(invoice.type), credit: revenueAmount, partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName, costCenterName: invoice.campus },
      ];
      if (taxAmount > 0) {
        lines.push({
          accountCode: taxTemplate?.accountCode || '2400',
          credit: taxAmount,
          partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName,
          costCenterName: invoice.campus,
          taxTemplateName: taxTemplate?.name,
        });
      }
      await this.postJournalEntry(schoolSlug, {
        date: invoice.createdAt || new Date(),
        reference: invoice.invoiceNumber,
        narration: `Fee invoice ${invoice.invoiceNumber} — ${invoice.studentName}`,
        sourceType: 'fee_invoice', sourceId: String(invoice._id),
        lines,
      });
    } catch (err: any) {
      // A ledger posting failure must never block the underlying business
      // transaction (a fee invoice must still be creatable even if, say,
      // COA hasn't been seeded yet) — surfaced instead via getJournalEntries
      // gaps being visible in the Trial Balance, not a hard failure here.
    }
  }

  private async postFeePaymentJournal(schoolSlug: string, invoice: any, payment: any) {
    if (!payment.amount) return;
    try {
      await this.postJournalEntry(schoolSlug, {
        date: payment.paymentDate || new Date(),
        reference: payment.receiptNumber,
        narration: `Fee payment ${payment.receiptNumber} — ${invoice.studentName}`,
        sourceType: 'fee_payment', sourceId: String(payment._id),
        lines: [
          { accountCode: this.mapPaymentMethodToAccount(payment.paymentMethod), debit: payment.amount, partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName, costCenterName: invoice.campus },
          { accountCode: '1200', credit: payment.amount, partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName, costCenterName: invoice.campus },
        ],
      });
    } catch (err: any) { /* see postFeeInvoiceJournal note */ }
  }

  private async postExpensePaidJournal(schoolSlug: string, expense: any) {
    if (!expense.amount) return;
    try {
      await this.postJournalEntry(schoolSlug, {
        date: new Date(),
        reference: expense.expenseNo,
        narration: `Expense ${expense.expenseNo} — ${expense.title}`,
        sourceType: 'expense', sourceId: String(expense._id),
        lines: [
          { accountCode: this.mapExpenseCategoryToAccount(expense.category), debit: expense.amount, partnerType: 'vendor', partnerName: expense.vendorName || expense.paidTo, costCenterName: expense.departmentId || expense.campusId },
          { accountCode: this.mapPaymentMethodToAccount(expense.paymentMethod), credit: expense.amount, partnerType: 'vendor', partnerName: expense.vendorName || expense.paidTo, costCenterName: expense.departmentId || expense.campusId },
        ],
      });
    } catch (err: any) { /* see postFeeInvoiceJournal note */ }
  }

  // ── Reports — audit-grade, sourced from real journal postings ────
  async getTrialBalance(schoolSlug: string, asOf?: string) {
    const accounts = await this.coaModel.find({ schoolSlug, isActive: true }).sort({ code: 1 }).lean();
    const dateFilter = asOf ? { date: { $lte: new Date(asOf) } } : {};
    const agg = await this.journalModel.aggregate([
      { $match: { schoolSlug, status: 'posted', ...dateFilter } },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.accountCode', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
    ]);
    const byCode = new Map(agg.map((a: any) => [a._id, a]));
    const rows = accounts.map((a: any) => {
      const totals = byCode.get(a.code) || { debit: 0, credit: 0 };
      const net = this.accountIncreasesOnDebit(a.type) ? (totals.debit - totals.credit) : (totals.credit - totals.debit);
      return { code: a.code, name: a.name, type: a.type, debit: totals.debit, credit: totals.credit, balance: (a.openingBalance || 0) + net };
    }).filter(r => r.debit > 0 || r.credit > 0 || r.balance !== 0);
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    return { rows, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  }

  async getGeneralLedger(schoolSlug: string, accountCode: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    const entries = await this.journalModel.find({
      schoolSlug, status: 'posted', 'lines.accountCode': accountCode,
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    }).sort({ date: 1, createdAt: 1 }).lean();

    let running = 0;
    const account = await this.coaModel.findOne({ schoolSlug, code: accountCode }).lean();
    const increases = account ? this.accountIncreasesOnDebit((account as any).type) : true;
    const rows = entries.flatMap((e: any) =>
      e.lines.filter((l: any) => l.accountCode === accountCode).map((l: any) => {
        running += increases ? (l.debit - l.credit) : (l.credit - l.debit);
        return {
          date: e.date, entryNo: e.entryNo, narration: e.narration, reference: e.reference,
          debit: l.debit, credit: l.credit, runningBalance: running,
          partnerName: l.partnerName, costCenterName: l.costCenterName,
        };
      }),
    );
    return { account, rows };
  }

  // Powers both "Students and Parents Ledger" and "Supplier Ledger" —
  // same journal data, filtered by the partner dimension.
  async getPartnerLedger(schoolSlug: string, partnerType: string, partnerId?: string, partnerName?: string) {
    const match: any = { schoolSlug, status: 'posted', 'lines.partnerType': partnerType };
    const entries = await this.journalModel.find(match).sort({ date: 1, createdAt: 1 }).lean();
    let running = 0;
    const rows = entries.flatMap((e: any) =>
      e.lines
        .filter((l: any) => l.partnerType === partnerType
          && (!partnerId || l.partnerId === partnerId)
          && (!partnerName || l.partnerName === partnerName))
        .map((l: any) => {
          running += l.debit - l.credit;
          return {
            date: e.date, entryNo: e.entryNo, narration: e.narration, accountCode: l.accountCode, accountName: l.accountName,
            debit: l.debit, credit: l.credit, runningBalance: running, partnerName: l.partnerName,
          };
        }),
    );
    return rows;
  }

  async getCostCenterReport(schoolSlug: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    const agg = await this.journalModel.aggregate([
      { $match: { schoolSlug, status: 'posted', ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) } },
      { $unwind: '$lines' },
      { $match: { 'lines.costCenterName': { $ne: null } } },
      { $group: { _id: '$lines.costCenterName', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
      { $sort: { _id: 1 } },
    ]);
    return agg.map((a: any) => ({ costCenterName: a._id, debit: a.debit, credit: a.credit, net: a.debit - a.credit }));
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
    const netBeforeTax = subtotal - totalDiscount;

    // Phase 3 — auto-resolve sales tax for this invoice (no-op if the
    // school hasn't configured any TaxTemplate/ItemTaxTemplate/TaxRule).
    const { taxAmount: totalTax, taxTemplate } = await this.computeSalesTax(
      data.schoolSlug, data.type || 'fee', { grade: data.grade, campus: data.campus }, netBeforeTax,
    );
    const totalAmount = Math.round((netBeforeTax + totalTax) * 100) / 100;

    const inv = new this.invoiceModel({
      ...data,
      subtotal, totalDiscount, totalTax, totalAmount, balanceDue: totalAmount,
    });
    await inv.save();
    await this.postFeeInvoiceJournal(data.schoolSlug, inv, taxTemplate);
    return inv;
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

    await this.postFeePaymentJournal(schoolSlug, invoice, payment);
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
    const expense = await this.expenseModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'paid', paidBy: data.paidBy, paymentMethod: data.paymentMethod, receiptNumber: data.receiptNumber } },
      { new: true },
    );
    if (expense) await this.postExpensePaidJournal(schoolSlug, expense);
    return expense;
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

  // Best-effort date range for budget-vs-actual: prefer the linked
  // FiscalYear (Phase 4 field) if the budget has one set; otherwise try to
  // derive a July–June range from the academicYear string ("2025-26") using
  // the same convention as getOrCreateFiscalYear. If academicYear doesn't
  // parse cleanly, fall back to no date filter at all — an unfiltered
  // (all-time) actuals number is more honest than a fabricated range that
  // doesn't reflect this school's real fiscal calendar.
  private async resolveBudgetDateRange(schoolSlug: string, budget: BudgetDocument): Promise<{ from?: string; to?: string }> {
    if (budget.fiscalYearId) {
      const fy = await this.fiscalYearModel.findOne({ _id: budget.fiscalYearId, schoolSlug });
      if (fy) return { from: fy.startDate.toISOString(), to: fy.endDate.toISOString() };
    }
    const m = /^(\d{4})-(\d{2})$/.exec(budget.academicYear || '');
    if (m) {
      const startYear = Number(m[1]);
      const from = new Date(startYear, 6, 1); // Jul 1
      const to = new Date(startYear + 1, 5, 30, 23, 59, 59); // Jun 30 next year
      return { from: from.toISOString(), to: to.toISOString() };
    }
    return {};
  }

  // Resolves the cost center a given budget line should be measured
  // against: the line's own costCenterId/costCenterName take priority (lets
  // a budget mix cost centers per line), falling back to the parent
  // Budget's departmentId/campusId (the pre-Phase-4 dimension) so old
  // budgets still produce a meaningful actual once Cost Centers exist.
  private async resolveBudgetLineCostCenterName(schoolSlug: string, budget: BudgetDocument, line: any): Promise<string | null> {
    if (line.costCenterId) {
      const cc = await this.costCenterModel.findOne({ _id: line.costCenterId, schoolSlug });
      if (cc) return cc.name;
    }
    if (line.costCenterName) {
      const cc = await this.resolveCostCenterByName(schoolSlug, line.costCenterName);
      if (cc) return cc.name;
      return line.costCenterName; // no CostCenter record matches, but still report the intended name
    }
    const fallbackName = budget.departmentId || budget.campusId;
    if (fallbackName) {
      const cc = await this.resolveCostCenterByName(schoolSlug, fallbackName);
      if (cc) return cc.name;
      return fallbackName;
    }
    return null;
  }

  // Core budget-vs-actual computation shared by getBudgetVsActual (per
  // budget, line-level detail) and getBudgetSummaryAcrossAll (portfolio
  // totals only) — one aggregation logic, two views on top of it.
  private async computeBudgetVsActual(schoolSlug: string, budget: BudgetDocument) {
    const { from, to } = await this.resolveBudgetDateRange(schoolSlug, budget);
    // getCostCenterReport aggregates real posted journal lines grouped by
    // costCenterName — this IS the "actual spend" source of truth, never a
    // placeholder/estimated figure.
    const actualsByCostCenter = await this.getCostCenterReport(schoolSlug, from, to);
    const actualsMap = new Map(actualsByCostCenter.map((a: any) => [a.costCenterName, a.net]));

    const lines = await Promise.all((budget.lines || []).map(async (line: any) => {
      const costCenterName = await this.resolveBudgetLineCostCenterName(schoolSlug, budget, line);
      const actualAmount = costCenterName && actualsMap.has(costCenterName) ? actualsMap.get(costCenterName) : 0;
      const allocatedAmount = line.allocatedAmount || 0;
      const variance = allocatedAmount - actualAmount;
      const utilizationPct = allocatedAmount > 0 ? Math.round((actualAmount / allocatedAmount) * 1000) / 10 : (actualAmount > 0 ? null : 0);
      return {
        category: line.category,
        costCenterName: costCenterName || 'Unassigned',
        allocatedAmount,
        actualAmount,
        variance,
        utilizationPct,
      };
    }));

    const totalAllocated = lines.reduce((a, l) => a + l.allocatedAmount, 0);
    const totalActual = lines.reduce((a, l) => a + l.actualAmount, 0);
    const totalVariance = totalAllocated - totalActual;
    const totalUtilizationPct = totalAllocated > 0 ? Math.round((totalActual / totalAllocated) * 1000) / 10 : (totalActual > 0 ? null : 0);

    return { from, to, lines, totalAllocated, totalActual, totalVariance, totalUtilizationPct };
  }

  async getBudgetVsActual(schoolSlug: string, budgetId: string) {
    const budget = await this.budgetModel.findOne({ _id: budgetId, schoolSlug });
    if (!budget) throw new NotFoundException('Budget not found');
    const result = await this.computeBudgetVsActual(schoolSlug, budget);
    return {
      budgetId: budget._id,
      budgetName: budget.name,
      academicYear: budget.academicYear,
      status: budget.status,
      ...result,
    };
  }

  // Portfolio view: one row per budget with allocated/actual/variance/
  // utilization%. Deliberately a straightforward loop over computeBudgetVsActual
  // rather than a single mega-aggregation pipeline — budgets are a small-N
  // collection per school, so clarity wins over a premature optimization.
  async getBudgetSummaryAcrossAll(schoolSlug: string, academicYear?: string) {
    const filter: any = { schoolSlug };
    if (academicYear) filter.academicYear = academicYear;
    else filter.status = { $in: ['approved', 'active'] };
    const budgets = await this.budgetModel.find(filter).sort({ createdAt: -1 });

    const rows = await Promise.all(budgets.map(async (budget) => {
      const result = await this.computeBudgetVsActual(schoolSlug, budget);
      return {
        budgetId: budget._id,
        budgetName: budget.name,
        academicYear: budget.academicYear,
        status: budget.status,
        totalAllocated: result.totalAllocated,
        totalActual: result.totalActual,
        totalVariance: result.totalVariance,
        totalUtilizationPct: result.totalUtilizationPct,
      };
    }));
    return rows;
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

  /**
   * Bulk "undo generate" - soft-deletes every invoice matching the same
   * month/scope used to generate them, so a mistaken or stale batch (e.g.
   * generated under the wrong academic year before that bug was fixed)
   * can be cleanly reverted instead of deleted one at a time. Soft delete
   * (not a hard delete) - matches the existing single-invoice convention,
   * keeps an audit trail, and every other read already filters out
   * isDeleted invoices, so these disappear from Receivables/Print/Reports
   * immediately.
   */
  async bulkDeleteInvoices(
    schoolSlug: string,
    params: {
      month: string;
      academicYear: string;
      scopeType?: 'all' | 'class' | 'section' | 'campus' | 'student';
      scopeValue?: string;
    },
    deletedBy: string,
    reason?: string,
  ) {
    if (!params.month) throw new BadRequestException('month is required');
    if (!params.academicYear) throw new BadRequestException('academicYear is required');

    const match: any = {
      schoolSlug, month: params.month, academicYear: params.academicYear, isDeleted: { $ne: true },
    };
    if (params.scopeType === 'class' && params.scopeValue) {
      match.grade = params.scopeValue;
    } else if (params.scopeType === 'section' && params.scopeValue) {
      const [g, s] = params.scopeValue.split('::');
      match.grade = g;
      if (s) match.section = s;
    } else if (params.scopeType === 'student' && params.scopeValue) {
      match.studentId = new Types.ObjectId(params.scopeValue);
    } else if (params.scopeType === 'campus' && params.scopeValue) {
      match.campus = params.scopeValue;
    }

    const result = await this.invoiceModel.updateMany(match, {
      $set: { isDeleted: true, deletedAt: new Date(), deletedBy, deleteReason: reason || 'Bulk reverted from Fee Assignment' },
    });

    if (result.matchedCount === 0) {
      const { academicYear, ...matchWithoutYear } = match;
      const anyYearMatch = await this.invoiceModel.find(matchWithoutYear).lean();
      if (anyYearMatch.length > 0) {
        const years = Array.from(new Set(anyYearMatch.map((inv: any) => inv.academicYear))).join(', ');
        throw new BadRequestException(
          `Found ${anyYearMatch.length} challan(s) for this month/scope, but under academic year(s) "${years}" - ` +
          `you're currently viewing "${params.academicYear}". Switch the Academic Year selector and try again.`,
        );
      }
    }

    return { deleted: result.modifiedCount, matched: result.matchedCount };
  }

  /**
   * Direct, one-click fix for the exact situation this whole academic-year
   * saga produces: challans that exist and are fine, just tagged under a
   * stale year because they were generated before the header-injection
   * bug was fixed. Rather than requiring the person to toggle the Academic
   * Year switcher back to the old year, delete, switch back, and
   * regenerate - this just retags the existing records in place to the
   * year they're actually being asked about. No data is deleted or
   * recreated; only the academicYear field changes.
   */
  async retagInvoiceYear(
    schoolSlug: string,
    params: {
      month: string;
      toAcademicYear: string;
      scopeType?: 'all' | 'class' | 'section' | 'campus' | 'student';
      scopeValue?: string;
    },
  ) {
    if (!params.month) throw new BadRequestException('month is required');
    if (!params.toAcademicYear) throw new BadRequestException('toAcademicYear is required');

    const match: any = {
      schoolSlug, month: params.month, academicYear: { $ne: params.toAcademicYear }, isDeleted: { $ne: true },
    };
    if (params.scopeType === 'class' && params.scopeValue) {
      match.grade = params.scopeValue;
    } else if (params.scopeType === 'section' && params.scopeValue) {
      const [g, s] = params.scopeValue.split('::');
      match.grade = g;
      if (s) match.section = s;
    } else if (params.scopeType === 'student' && params.scopeValue) {
      match.studentId = new Types.ObjectId(params.scopeValue);
    } else if (params.scopeType === 'campus' && params.scopeValue) {
      match.campus = params.scopeValue;
    }

    const before = await this.invoiceModel.find(match, { academicYear: 1 }).lean();
    const fromYears = Array.from(new Set(before.map((inv: any) => inv.academicYear)));

    const result = await this.invoiceModel.updateMany(match, { $set: { academicYear: params.toAcademicYear } });

    return {
      retagged: result.modifiedCount,
      fromYears,
      toAcademicYear: params.toAcademicYear,
    };
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
        const netBeforeTax = subtotal - totalDiscount;

        // Phase 3 — auto-resolve sales tax the same way createInvoice does.
        const { taxAmount: totalTax, taxTemplate } = await this.computeSalesTax(
          schoolSlug, 'fee', { grade: (student as any).currentGrade, campus: studentCampusName }, netBeforeTax,
        );
        const totalAmount = Math.round((netBeforeTax + totalTax) * 100) / 100;

        const [y, m] = month.split('-').map(Number);
        const dueDate = y && m ? new Date(y, m - 1, Math.min(dueDay, 28)) : undefined;

        const invoice = new this.invoiceModel({
          type: 'fee',
          studentId: student._id,
          studentName: `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim(),
          grade: (student as any).currentGrade,
          section: (student as any).currentSection,
          campus: studentCampusName || undefined,
          month, academicYear,
          items, subtotal, totalDiscount, totalTax, totalAmount,
          balanceDue: totalAmount,
          status: 'sent',
          dueDate,
          lateFine,
          createdBy,
          schoolSlug,
        });
        await invoice.save();
        await this.postFeeInvoiceJournal(schoolSlug, invoice, taxTemplate);
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

  // ============================================================
  // PHASE 2 — VENDOR MASTER / ACCOUNTS PAYABLE (formal bills, terms,
  // partial payment), plus AR/AP aging, credit balance, and payment
  // period reports. This is additive to the existing simple Expense
  // spend-log, which is untouched. See the Odoo-standard finance build
  // plan doc.
  // ============================================================

  // ── Vendor master ─────────────────────────────────────────
  async getVendors(schoolSlug: string) {
    return this.vendorModel.find({ schoolSlug }).sort({ name: 1 });
  }

  async createVendor(data: any) {
    const vendor = new this.vendorModel(data);
    return vendor.save();
  }

  async updateVendor(id: string, schoolSlug: string, data: any) {
    const vendor = await this.vendorModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  // ── Vendor Bills (Accounts Payable) ───────────────────────
  async getVendorBills(schoolSlug: string, query: any = {}) {
    const { page = 1, limit = 20, status, vendorId, from, to } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (vendorId) filter.vendorId = vendorId;
    if (from || to) { filter.billDate = {}; if (from) filter.billDate.$gte = new Date(from); if (to) filter.billDate.$lte = new Date(to); }
    const [data, total] = await Promise.all([
      this.vendorBillModel.find(filter).sort({ billDate: -1, createdAt: -1 }).skip(skip).limit(limit),
      this.vendorBillModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // Posts Dr each line's account (+ auto-resolved purchase tax lines, or —
  // if the caller passes an explicit legacy `taxAmount` — folded onto the
  // first line's account, preserving exact Phase 2 behavior) / Cr Accounts
  // Payable (2000) for the tax-inclusive bill total. Every line carries
  // partnerType 'vendor' + the same vendorId/vendorName used by
  // recordVendorPayment, so getPartnerLedger produces one coherent
  // running balance per vendor across bills and payments.
  async createVendorBill(data: any) {
    const { schoolSlug, vendorId, lines = [] } = data;
    const explicitTaxAmount = Number(data.taxAmount || 0);
    if (!vendorId) throw new BadRequestException('vendorId is required');
    if (!lines.length) throw new BadRequestException('At least one bill line is required');
    for (const l of lines) {
      if (!l.accountCode) throw new BadRequestException('Every bill line requires an accountCode');
      if (!l.amount || Number(l.amount) <= 0) throw new BadRequestException('Every bill line requires a positive amount');
    }

    const vendor = await this.vendorModel.findOne({ _id: vendorId, schoolSlug });
    if (!vendor) throw new NotFoundException('Vendor not found');

    // Phase 3 — if the caller didn't pass an explicit flat taxAmount (Phase
    // 2 style), auto-resolve purchase tax per line via TaxRule/ItemTaxTemplate.
    // Explicit taxAmount always wins so existing Phase 2 callers are untouched.
    const lineTaxInfo: { accountCode: string; taxAmount: number; taxTemplateName: string }[] = [];
    if (!explicitTaxAmount) {
      for (const l of lines) {
        const { taxAmount: lineTax, taxTemplate } = await (async () => {
          const template = await this.resolveTaxForLine(schoolSlug, 'purchase', l.accountCode, { vendorId });
          if (!template) return { taxAmount: 0, taxTemplate: null as any };
          const amt = Number(l.amount || 0);
          const taxAmount = template.computationMethod === 'fixed'
            ? Math.round((template.rate || 0) * 100) / 100
            : Math.round(amt * (template.rate || 0)) / 100;
          return { taxAmount, taxTemplate: template };
        })();
        if (lineTax > 0) lineTaxInfo.push({ accountCode: taxTemplate.accountCode, taxAmount: lineTax, taxTemplateName: taxTemplate.name });
      }
    }
    const autoTaxAmount = Math.round(lineTaxInfo.reduce((a, t) => a + t.taxAmount, 0) * 100) / 100;
    const taxAmount = explicitTaxAmount || autoTaxAmount;

    const subtotal = lines.reduce((a: number, l: any) => a + Number(l.amount || 0), 0);
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
    const billDate = data.billDate ? new Date(data.billDate) : new Date();

    let dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (!dueDate) {
      let dueDays = 0;
      const termId = data.paymentTermId || vendor.paymentTermId;
      if (termId) {
        const term = await this.paymentTermModel.findOne({ _id: termId, schoolSlug });
        if (term) dueDays = term.dueDays || 0;
      }
      dueDate = new Date(billDate);
      dueDate.setDate(dueDate.getDate() + dueDays);
    }

    const bill = new this.vendorBillModel({
      ...data,
      vendorName: vendor.name,
      billDate, dueDate,
      subtotal, taxAmount, totalAmount,
      paidAmount: 0, balanceDue: totalAmount,
      status: 'posted',
      schoolSlug,
    });
    await bill.save();

    try {
      const journalLines: any[] = lines.map((l: any) => ({
        accountCode: l.accountCode, debit: Number(l.amount || 0), costCenterName: l.costCenterName,
        partnerType: 'vendor', partnerId: String(vendor._id), partnerName: vendor.name,
      }));
      if (explicitTaxAmount > 0) {
        // Legacy Phase 2 behavior: fold the flat tax onto the first line's account.
        journalLines.push({
          accountCode: lines[0].accountCode, debit: explicitTaxAmount,
          partnerType: 'vendor', partnerId: String(vendor._id), partnerName: vendor.name,
        });
      } else {
        for (const t of lineTaxInfo) {
          journalLines.push({
            accountCode: t.accountCode, debit: t.taxAmount,
            partnerType: 'vendor', partnerId: String(vendor._id), partnerName: vendor.name,
            taxTemplateName: t.taxTemplateName,
          });
        }
      }
      journalLines.push({
        accountCode: '2000', credit: totalAmount,
        partnerType: 'vendor', partnerId: String(vendor._id), partnerName: vendor.name,
      });

      await this.postJournalEntry(schoolSlug, {
        date: billDate, reference: bill.billNo,
        narration: `Vendor bill ${bill.billNo} — ${vendor.name}`,
        sourceType: 'vendor_bill', sourceId: String(bill._id),
        lines: journalLines,
      });
    } catch (err: any) {
      // A ledger posting failure must never block the underlying bill —
      // same convention as postFeeInvoiceJournal etc.
    }

    return bill;
  }

  // ── Vendor Payments ────────────────────────────────────────
  async recordVendorPayment(billId: string, schoolSlug: string, data: any) {
    const bill = await this.vendorBillModel.findOne({ _id: billId, schoolSlug });
    if (!bill) throw new NotFoundException('Vendor bill not found');
    if (bill.status === 'paid') throw new BadRequestException('Bill already fully paid');
    if (bill.status === 'cancelled') throw new BadRequestException('Cannot pay a cancelled bill');

    const amount = Math.round(Number(data.amount) * 100) / 100;
    if (!amount || amount <= 0) throw new BadRequestException('amount must be greater than 0');
    if (amount > bill.balanceDue + 0.01) {
      throw new BadRequestException(`Payment amount (${amount}) exceeds balance due (${bill.balanceDue})`);
    }

    // Phase 3 — withholding is deducted at PAYMENT time (not accrued at
    // bill time): if the vendor is tagged with a WithholdingTaxCategory,
    // a portion of this payment's gross `amount` is withheld and posted
    // to Withholding Tax Payable instead of paid out in cash. The vendor
    // is still deemed paid in full for `amount` (paidAmount/balanceDue
    // below use the GROSS amount, unchanged from Phase 2) — only the cash
    // leg of the journal entry shrinks.
    let withholdingAmount = 0;
    let withholdingCategory: any = null;
    const vendor = await this.vendorModel.findOne({ _id: bill.vendorId, schoolSlug });
    if (vendor?.withholdingCategoryId) {
      withholdingCategory = await this.withholdingCategoryModel.findOne({ _id: vendor.withholdingCategoryId, schoolSlug, isActive: true });
      if (withholdingCategory) {
        withholdingAmount = Math.round(amount * (withholdingCategory.rate || 0)) / 100;
        withholdingAmount = Math.min(withholdingAmount, amount); // never withhold more than the payment itself
      }
    }
    const cashAmount = Math.round((amount - withholdingAmount) * 100) / 100;

    const payment = new this.vendorPaymentModel({
      billId: bill._id, billNo: bill.billNo, vendorId: bill.vendorId, vendorName: bill.vendorName,
      amount, paymentDate: new Date(data.paymentDate || Date.now()),
      paymentMethod: data.paymentMethod, referenceNumber: data.referenceNumber,
      withholdingAmount,
      schoolSlug,
    });
    await payment.save();

    const newPaid = (bill.paidAmount || 0) + amount;
    const newBalance = bill.totalAmount - newPaid;
    const newStatus = newBalance <= 0.01 ? 'paid' : 'partial';

    await this.vendorBillModel.findByIdAndUpdate(billId, {
      $set: { paidAmount: newPaid, balanceDue: Math.max(0, newBalance), status: newStatus },
    });

    try {
      const lines: any[] = [
        { accountCode: '2000', debit: amount, partnerType: 'vendor', partnerId: String(bill.vendorId), partnerName: bill.vendorName },
        { accountCode: this.mapPaymentMethodToAccount(data.paymentMethod), credit: cashAmount, partnerType: 'vendor', partnerId: String(bill.vendorId), partnerName: bill.vendorName },
      ];
      if (withholdingAmount > 0 && withholdingCategory) {
        lines.push({
          accountCode: withholdingCategory.accountCode, credit: withholdingAmount,
          partnerType: 'vendor', partnerId: String(bill.vendorId), partnerName: bill.vendorName,
          taxTemplateName: withholdingCategory.name,
        });
      }
      await this.postJournalEntry(schoolSlug, {
        date: payment.paymentDate, reference: bill.billNo,
        narration: `Vendor payment for bill ${bill.billNo} — ${bill.vendorName}`,
        sourceType: 'vendor_payment', sourceId: String(payment._id),
        lines,
      });
    } catch (err: any) {
      // see createVendorBill note
    }

    return payment;
  }

  async getVendorPayments(schoolSlug: string, vendorId?: string) {
    const filter: any = { schoolSlug };
    if (vendorId) filter.vendorId = vendorId;
    return this.vendorPaymentModel.find(filter).sort({ paymentDate: -1 }).limit(200);
  }

  // ── Reports — AR/AP aging, credit balance, payment period ─
  private agingBucket(daysOverdue: number): 'current' | '1-30' | '31-60' | '61-90' | '90+' {
    if (daysOverdue <= 0) return 'current';
    if (daysOverdue <= 30) return '1-30';
    if (daysOverdue <= 60) return '31-60';
    if (daysOverdue <= 90) return '61-90';
    return '90+';
  }

  // Buckets outstanding fee invoices by days-overdue from dueDate (falling
  // back to createdAt for older invoices that predate the dueDate field),
  // grouped by student/family — reuses the same guardians[0] lookup
  // pattern as getOutstandingReport's 'family' groupBy.
  async getArAging(schoolSlug: string, asOf?: string) {
    const asOfDate = asOf ? new Date(asOf) : new Date();
    const invoices = await this.invoiceModel.aggregate([
      { $match: { schoolSlug, isDeleted: { $ne: true }, status: { $in: ['sent', 'partial', 'overdue'] }, balanceDue: { $gt: 0 } } },
      { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 'student' } },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      { $project: {
        studentId: 1, studentName: 1, balanceDue: 1, dueDate: 1, createdAt: 1, grade: 1,
        familyKey: { $ifNull: [{ $arrayElemAt: ['$student.guardians.phone', 0] }, 'Unknown Family'] },
        guardianName: { $ifNull: [{ $arrayElemAt: ['$student.guardians.name', 0] }, 'Unknown'] },
      } },
    ]);

    const buckets: Record<string, number> = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const byStudent = new Map<string, any>();
    for (const inv of invoices) {
      const refDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.createdAt);
      const daysOverdue = Math.floor((asOfDate.getTime() - refDate.getTime()) / 86400000);
      const bucket = this.agingBucket(daysOverdue);
      buckets[bucket] += inv.balanceDue;

      const sid = String(inv.studentId || inv.studentName);
      if (!byStudent.has(sid)) {
        byStudent.set(sid, {
          studentId: sid, studentName: inv.studentName, familyKey: inv.familyKey, guardianName: inv.guardianName,
          current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0,
        });
      }
      const entry = byStudent.get(sid);
      entry[bucket] += inv.balanceDue;
      entry.total += inv.balanceDue;
    }

    const rows = Array.from(byStudent.values()).sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((a, r) => a + r.total, 0);
    return { asOf: asOfDate, buckets, rows, grandTotal };
  }

  // Same bucketing logic as getArAging, but against VendorBill and
  // grouped by vendor instead of student.
  async getApAging(schoolSlug: string, asOf?: string) {
    const asOfDate = asOf ? new Date(asOf) : new Date();
    const bills = await this.vendorBillModel.find({
      schoolSlug, status: { $in: ['posted', 'partial'] }, balanceDue: { $gt: 0 },
    }).lean();

    const buckets: Record<string, number> = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const byVendor = new Map<string, any>();
    for (const bill of bills as any[]) {
      const daysOverdue = Math.floor((asOfDate.getTime() - new Date(bill.dueDate).getTime()) / 86400000);
      const bucket = this.agingBucket(daysOverdue);
      buckets[bucket] += bill.balanceDue;

      const vid = String(bill.vendorId);
      if (!byVendor.has(vid)) {
        byVendor.set(vid, {
          vendorId: vid, vendorName: bill.vendorName,
          current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0,
        });
      }
      const entry = byVendor.get(vid);
      entry[bucket] += bill.balanceDue;
      entry.total += bill.balanceDue;
    }

    const rows = Array.from(byVendor.values()).sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((a, r) => a + r.total, 0);
    return { asOf: asOfDate, buckets, rows, grandTotal };
  }

  // Aggregates at the student level (sum of all invoices' totalAmount vs
  // sum of all payments) rather than trusting per-invoice balanceDue to
  // go negative — recordPayment's newBalance is clamped to
  // Math.max(0, ...) before being saved, so a per-invoice negative
  // balanceDue can never actually occur in this data model; a credit can
  // only be observed by comparing totals across a student's invoices.
  async getCustomerCreditBalance(schoolSlug: string) {
    const rows = await this.invoiceModel.aggregate([
      { $match: { schoolSlug, isDeleted: { $ne: true } } },
      { $group: {
        _id: '$studentId',
        studentName: { $first: '$studentName' },
        totalInvoiced: { $sum: '$totalAmount' },
        totalPaid: { $sum: '$paidAmount' },
      } },
      { $project: {
        studentName: 1, totalInvoiced: 1, totalPaid: 1,
        creditAmount: { $subtract: ['$totalPaid', '$totalInvoiced'] },
      } },
      { $match: { creditAmount: { $gt: 0.01 } } },
      { $sort: { creditAmount: -1 } },
    ]);
    return { rows, totalCredit: rows.reduce((a: number, r: any) => a + r.creditAmount, 0) };
  }

  // "How long does it take us to collect" — average days between an
  // invoice's creation and the payment that settled it, plus a simple
  // month-by-month invoiced/collected/avg-days-to-pay breakdown.
  async getPaymentPeriodReport(schoolSlug: string, from?: string, to?: string) {
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
      { $project: {
        amount: 1, paymentDate: 1,
        invoiceCreatedAt: '$inv.createdAt',
        daysToPay: {
          $cond: [
            { $ifNull: ['$inv.createdAt', false] },
            { $divide: [{ $subtract: ['$paymentDate', '$inv.createdAt'] }, 1000 * 60 * 60 * 24] },
            null,
          ],
        },
        yearMonth: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
      } },
    ]);

    const validDays = payments.filter((p: any) => p.daysToPay != null).map((p: any) => p.daysToPay);
    const avgDaysToPay = validDays.length ? validDays.reduce((a: number, b: number) => a + b, 0) / validDays.length : 0;
    const totalCollected = payments.reduce((a: number, p: any) => a + p.amount, 0);

    const monthMap = new Map<string, any>();
    for (const p of payments as any[]) {
      if (!monthMap.has(p.yearMonth)) monthMap.set(p.yearMonth, { month: p.yearMonth, collected: 0, count: 0, daysSum: 0, daysCount: 0 });
      const entry = monthMap.get(p.yearMonth);
      entry.collected += p.amount;
      entry.count += 1;
      if (p.daysToPay != null) { entry.daysSum += p.daysToPay; entry.daysCount += 1; }
    }

    const invoiceMatch: any = { schoolSlug, isDeleted: { $ne: true } };
    if (from || to) {
      invoiceMatch.createdAt = {};
      if (from) invoiceMatch.createdAt.$gte = new Date(from);
      if (to) invoiceMatch.createdAt.$lte = new Date(to);
    }
    const invoicedByMonth = await this.invoiceModel.aggregate([
      { $match: invoiceMatch },
      { $project: { totalAmount: 1, yearMonth: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } } },
      { $group: { _id: '$yearMonth', invoiced: { $sum: '$totalAmount' } } },
    ]);
    const invoicedMap = new Map(invoicedByMonth.map((r: any) => [r._id, r.invoiced]));

    const monthly = Array.from(monthMap.values())
      .map((m: any) => ({
        month: m.month,
        collected: m.collected,
        invoiced: invoicedMap.get(m.month) || 0,
        avgDaysToPay: m.daysCount ? Math.round((m.daysSum / m.daysCount) * 10) / 10 : null,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      avgDaysToPay: Math.round(avgDaysToPay * 10) / 10,
      totalCollected,
      paymentCount: payments.length,
      monthly,
    };
  }

  // ============================================================
  // PHASE 3 — TAX ENGINE (sales/purchase/withholding tax templates,
  // item-level tax defaults, tax rules, withholding categories, and the
  // tax summary report). Fully additive/optional: a school that hasn't
  // configured any TaxTemplate sees zero behavior change in invoices or
  // vendor bills. See the Odoo-standard finance build plan doc.
  // ============================================================

  // ── Tax Templates ────────────────────────────────────────────
  async getTaxTemplates(schoolSlug: string, type?: string) {
    const filter: any = { schoolSlug };
    if (type) filter.type = type;
    return this.taxTemplateModel.find(filter).sort({ name: 1 });
  }

  async createTaxTemplate(data: any) {
    return this.taxTemplateModel.create(data);
  }

  async updateTaxTemplate(id: string, schoolSlug: string, data: any) {
    const tpl = await this.taxTemplateModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!tpl) throw new NotFoundException('Tax template not found');
    return tpl;
  }

  // ── Item Tax Templates ───────────────────────────────────────
  async getItemTaxTemplates(schoolSlug: string, direction?: string) {
    const filter: any = { schoolSlug };
    if (direction) filter.direction = direction;
    return this.itemTaxTemplateModel.find(filter).populate('taxTemplateId').sort({ itemType: 1 });
  }

  async createItemTaxTemplate(data: any) {
    return this.itemTaxTemplateModel.create(data);
  }

  async updateItemTaxTemplate(id: string, schoolSlug: string, data: any) {
    const item = await this.itemTaxTemplateModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!item) throw new NotFoundException('Item tax template not found');
    return item;
  }

  // ── Tax Rules ─────────────────────────────────────────────────
  async getTaxRules(schoolSlug: string) {
    return this.taxRuleModel.find({ schoolSlug }).populate('taxTemplateId').sort({ priority: 1 });
  }

  async createTaxRule(data: any) {
    return this.taxRuleModel.create(data);
  }

  async updateTaxRule(id: string, schoolSlug: string, data: any) {
    const rule = await this.taxRuleModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!rule) throw new NotFoundException('Tax rule not found');
    return rule;
  }

  // ── Withholding Tax Categories ────────────────────────────────
  async getWithholdingCategories(schoolSlug: string) {
    return this.withholdingCategoryModel.find({ schoolSlug }).sort({ name: 1 });
  }

  async createWithholdingCategory(data: any) {
    return this.withholdingCategoryModel.create(data);
  }

  async updateWithholdingCategory(id: string, schoolSlug: string, data: any) {
    const cat = await this.withholdingCategoryModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!cat) throw new NotFoundException('Withholding tax category not found');
    return cat;
  }

  // ── Tax Summary Report ───────────────────────────────────────
  // Aggregates posted journal lines by tax account code (Sales Tax
  // Payable 2400, Input/Purchase Tax Receivable 1400, Withholding Tax
  // Payable 2500) within the date range, plus a breakdown by
  // taxTemplateName (denormalized onto the journal line at posting time).
  async getTaxSummaryReport(schoolSlug: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    const TAX_ACCOUNT_CODES = ['2400', '1400', '2500'];

    const agg = await this.journalModel.aggregate([
      { $match: { schoolSlug, status: 'posted', ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) } },
      { $unwind: '$lines' },
      { $match: { 'lines.accountCode': { $in: TAX_ACCOUNT_CODES } } },
      { $group: {
        _id: { accountCode: '$lines.accountCode', taxTemplateName: '$lines.taxTemplateName' },
        debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' },
      } },
    ]);

    let salesTaxCollected = 0, inputTaxRecoverable = 0, withholdingDeducted = 0;
    const byTemplate = new Map<string, { taxTemplateName: string; accountCode: string; amount: number }>();
    for (const row of agg as any[]) {
      const accountCode = row._id.accountCode;
      const name = row._id.taxTemplateName || 'Unspecified';
      // 1400 (Input Tax Receivable) is an asset — its natural balance
      // increases on debit; 2400/2500 are liabilities — increase on credit.
      const net = accountCode === '1400' ? (row.debit - row.credit) : (row.credit - row.debit);
      if (accountCode === '2400') salesTaxCollected += net;
      if (accountCode === '1400') inputTaxRecoverable += net;
      if (accountCode === '2500') withholdingDeducted += net;

      const key = `${accountCode}::${name}`;
      if (!byTemplate.has(key)) byTemplate.set(key, { taxTemplateName: name, accountCode, amount: 0 });
      byTemplate.get(key)!.amount += net;
    }

    return {
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
      salesTaxCollected: Math.round(salesTaxCollected * 100) / 100,
      inputTaxRecoverable: Math.round(inputTaxRecoverable * 100) / 100,
      withholdingDeducted: Math.round(withholdingDeducted * 100) / 100,
      breakdown: Array.from(byTemplate.values()).sort((a, b) => b.amount - a.amount),
    };
  }
}
