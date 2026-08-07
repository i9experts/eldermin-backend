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
  OpeningBalance, OpeningBalanceDocument,
} from './schemas/ledger.schema';
import {
  AccountingDimension, AccountingDimensionDocument,
  DimensionValue, DimensionValueDocument,
} from './schemas/dimension.schema';
import { TermsTemplate, TermsTemplateDocument } from './schemas/terms-template.schema';
import { PaymentGatewayConfig, PaymentGatewayConfigDocument } from './schemas/payment-gateway.schema';
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
import {
  Currency, CurrencyDocument,
  ExchangeRate, ExchangeRateDocument,
} from './schemas/currency.schema';
import {
  BankStatementLine, BankStatementLineDocument,
  BankReconciliation, BankReconciliationDocument,
} from './schemas/bank-reconciliation.schema';
import { PaymentVoucher, PaymentVoucherDocument } from './schemas/voucher.schema';
import {
  SalesCommissionRule, SalesCommissionRuleDocument,
  CommissionAssignment, CommissionAssignmentDocument,
} from './schemas/commission.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Family, FamilyDocument } from '../families/schemas/family.schema';
import { Campus, CampusDocument, Grade, GradeDocument } from '../organization/schemas/organization.schema';

const paged = (page = 1, limit = 20) => ({ skip: (page - 1) * limit, limit });

// Accounts every auto-posting rule needs to exist — including a Suspense
// account so a posting never silently fails just because a school hasn't
// finished mapping every category to a GL account yet.
const SUSPENSE_ACCOUNT_CODE = '9999';

// Phase 5 — multi-currency: single account absorbing realized FX rate
// movement between a foreign-currency document's booked rate and the rate
// in effect at settlement. Convention (see recordPayment/recordVendorPayment):
// modeled as type 'expense' — a DEBIT to this account records a realized
// loss (increases the expense balance), a CREDIT records a realized gain
// (decreases it, i.e. a negative expense). Shared by both the AR side
// (fee payments) and the AP side (vendor payments).
const FX_GAIN_LOSS_ACCOUNT_CODE = '7000';

// Phase 8 — year-end closing: net income/loss for the fiscal year lands
// here (see closeFiscalYear / computeYearEndClosingLines).
const RETAINED_EARNINGS_ACCOUNT_CODE = '3100';

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
    @InjectModel(Currency.name) private currencyModel: Model<CurrencyDocument>,
    @InjectModel(ExchangeRate.name) private exchangeRateModel: Model<ExchangeRateDocument>,
    @InjectModel(BankStatementLine.name) private statementLineModel: Model<BankStatementLineDocument>,
    @InjectModel(BankReconciliation.name) private reconciliationModel: Model<BankReconciliationDocument>,
    @InjectModel(SalesCommissionRule.name) private commissionRuleModel: Model<SalesCommissionRuleDocument>,
    @InjectModel(CommissionAssignment.name) private commissionAssignmentModel: Model<CommissionAssignmentDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Family.name) private familyModel: Model<FamilyDocument>,
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
    @InjectModel(OpeningBalance.name) private openingBalanceModel: Model<OpeningBalanceDocument>,
    @InjectModel(AccountingDimension.name) private dimensionModel: Model<AccountingDimensionDocument>,
    @InjectModel(DimensionValue.name) private dimensionValueModel: Model<DimensionValueDocument>,
    @InjectModel(TermsTemplate.name) private termsTemplateModel: Model<TermsTemplateDocument>,
    @InjectModel(PaymentGatewayConfig.name) private paymentGatewayConfigModel: Model<PaymentGatewayConfigDocument>,
    @InjectModel(PaymentVoucher.name) private voucherModel: Model<PaymentVoucherDocument>,
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
      // Phase 8 — year-end closing posts net income/loss here. Distinct
      // from 3000 "Owner's Equity" per the build plan.
      { code: '3100', name: 'Retained Earnings', type: 'equity', subType: 'equity' },
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
      // Phase 5 — multi-currency. See FX_GAIN_LOSS_ACCOUNT_CODE above for
      // the debit/credit convention.
      { code: '7000', name: 'Realized Exchange Gain/Loss', type: 'expense', subType: 'other_expense' },
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

    // Phase 5 — base-currency assumption: every school has always operated
    // implicitly in PKR. Seeding the COA is the first setup step almost
    // every school runs, so this is where we make that assumption explicit
    // and persistent (upsert-only — never overwrites a base currency a
    // school has already configured via setBaseCurrency).
    await this.currencyModel.updateOne(
      { schoolSlug, code: 'PKR' },
      { $setOnInsert: { schoolSlug, code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', decimalPlaces: 2, isBaseCurrency: true, isActive: true } },
      { upsert: true },
    );

    return this.coaModel.find({ schoolSlug }).sort({ code: 1 });
  }

  // ============================================================
  // MULTI-CURRENCY (Phase 5) — optional, additive currency dimension.
  // Every school still operates implicitly in PKR unless it explicitly
  // sets up currencies and rates; nothing here ever throws, so a school
  // that never touches these features sees zero behavior change. See
  // claude/finance-module-odoo-standard-build-plan.md.
  // ============================================================

  // ── Currencies ───────────────────────────────────────────
  async getCurrencies(schoolSlug: string) {
    return this.currencyModel.find({ schoolSlug }).sort({ isBaseCurrency: -1, code: 1 });
  }

  async createCurrency(data: any) {
    return this.currencyModel.create(data);
  }

  // Exactly one Currency per school should be the base currency — unset
  // every other one first, then set the target, so there's never a moment
  // (or a failure path) where two currencies are simultaneously flagged.
  async setBaseCurrency(id: string, schoolSlug: string) {
    const target = await this.currencyModel.findOne({ _id: id, schoolSlug });
    if (!target) throw new NotFoundException('Currency not found');
    await this.currencyModel.updateMany({ schoolSlug, _id: { $ne: id } }, { $set: { isBaseCurrency: false } });
    target.isBaseCurrency = true;
    target.isActive = true;
    await target.save();
    return target;
  }

  // Falls back to PKR if a school hasn't configured a base currency yet
  // (e.g. hasn't run Seed Default COA / Seed Common Currencies) — never
  // throws, since every downstream FX calculation depends on this resolving.
  private async getBaseCurrencyCode(schoolSlug: string): Promise<string> {
    try {
      const base = await this.currencyModel.findOne({ schoolSlug, isBaseCurrency: true });
      return base?.code || 'PKR';
    } catch {
      return 'PKR';
    }
  }

  // Upserts PKR (as base) + five common foreign currencies (inactive by
  // default — a school activates the ones it actually needs), mirroring
  // the seed-button convention used for Cost Centers / Payment Terms.
  async seedCommonCurrencies(schoolSlug: string) {
    const defaults = [
      { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', decimalPlaces: 2, isBaseCurrency: true, isActive: true },
      { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, isBaseCurrency: false, isActive: false },
      { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2, isBaseCurrency: false, isActive: false },
      { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2, isBaseCurrency: false, isActive: false },
      { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', decimalPlaces: 2, isBaseCurrency: false, isActive: false },
      { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimalPlaces: 2, isBaseCurrency: false, isActive: false },
    ];
    const ops = defaults.map(d => ({
      updateOne: {
        filter: { schoolSlug, code: d.code },
        update: { $setOnInsert: { ...d, schoolSlug } },
        upsert: true,
      },
    }));
    await this.currencyModel.bulkWrite(ops);
    return this.currencyModel.find({ schoolSlug }).sort({ isBaseCurrency: -1, code: 1 });
  }

  // ── Exchange Rates ───────────────────────────────────────
  async getExchangeRates(schoolSlug: string, fromCurrency?: string) {
    const filter: any = { schoolSlug };
    if (fromCurrency) filter.fromCurrency = fromCurrency;
    return this.exchangeRateModel.find(filter).sort({ rateDate: -1, createdAt: -1 }).limit(200);
  }

  async createExchangeRate(data: any) {
    return this.exchangeRateModel.create({ ...data, rateDate: new Date(data.rateDate || Date.now()) });
  }

  // Looks up the most recent ExchangeRate with rateDate <= date (ties
  // broken by createdAt, i.e. a same-day correction wins). Degrades
  // gracefully to rate 1.0 — never throws — if fromCurrency is the base
  // currency itself or no rate has been recorded yet, so a transaction
  // never gets blocked just because a rate is missing.
  private async getRateOn(schoolSlug: string, fromCurrency: string, date: Date): Promise<number> {
    try {
      if (!fromCurrency) return 1;
      const base = await this.getBaseCurrencyCode(schoolSlug);
      if (fromCurrency === base) return 1;
      const rate = await this.exchangeRateModel
        .findOne({ schoolSlug, fromCurrency, rateDate: { $lte: date } })
        .sort({ rateDate: -1, createdAt: -1 });
      return rate ? rate.rate : 1;
    } catch {
      return 1;
    }
  }

  // Shared by the AR (recordPayment) and AP (recordVendorPayment) realized
  // FX postings: given a foreign amount settled, the rate it was originally
  // booked at, and the rate in effect at settlement, returns the base-
  // currency value at each rate and the difference between them.
  // fxDifference > 0 means the foreign currency strengthened against the
  // base currency since booking (settlement is worth MORE base currency);
  // fxDifference < 0 means it weakened. Callers interpret the sign
  // differently depending on whether they're settling a receivable (a
  // positive difference is a gain) or a payable (a positive difference is
  // a loss) — see recordPayment / recordVendorPayment.
  private computeFxDifference(foreignAmount: number, originalRate: number, newRate: number) {
    const baseAtOriginalRate = Math.round(foreignAmount * (originalRate || 1) * 100) / 100;
    const baseAtNewRate = Math.round(foreignAmount * (newRate || 1) * 100) / 100;
    const fxDifference = Math.round((baseAtNewRate - baseAtOriginalRate) * 100) / 100;
    return { baseAtOriginalRate, baseAtNewRate, fxDifference };
  }

  // Month/year-end procedure: for every still-open (unpaid/partial)
  // foreign-currency invoice or vendor bill, revalue the outstanding
  // balance at today's (or `asOf`'s) rate vs the rate it was booked at, and
  // report the unrealized gain/loss per document. Nothing here posts to
  // the ledger — this is a reporting-only exposure snapshot, standard
  // practice for anyone holding open foreign-currency receivables/payables.
  async getUnrealizedFxExposure(schoolSlug: string, asOf?: string) {
    const asOfDate = asOf ? new Date(asOf) : new Date();
    const baseCurrency = await this.getBaseCurrencyCode(schoolSlug);

    const [openInvoices, openBills] = await Promise.all([
      this.invoiceModel.find({
        schoolSlug, isDeleted: { $ne: true }, balanceDue: { $gt: 0 },
        currencyCode: { $exists: true, $ne: null },
      }).lean(),
      this.vendorBillModel.find({
        schoolSlug, balanceDue: { $gt: 0 },
        currencyCode: { $exists: true, $ne: null },
      }).lean(),
    ]);

    const rows: any[] = [];
    let totalUnrealized = 0;

    for (const inv of openInvoices as any[]) {
      if (!inv.currencyCode || inv.currencyCode === baseCurrency) continue;
      const bookedRate = inv.exchangeRate || 1;
      const currentRate = await this.getRateOn(schoolSlug, inv.currencyCode, asOfDate);
      const bookedBase = Math.round(inv.balanceDue * bookedRate * 100) / 100;
      const currentBase = Math.round(inv.balanceDue * currentRate * 100) / 100;
      // Receivable: worth MORE base currency now = a gain.
      const unrealizedGainLoss = Math.round((currentBase - bookedBase) * 100) / 100;
      rows.push({
        type: 'receivable', documentNo: inv.invoiceNumber, partnerName: inv.studentName,
        currencyCode: inv.currencyCode, foreignBalance: inv.balanceDue,
        bookedRate, currentRate, bookedBase, currentBase, unrealizedGainLoss,
      });
      totalUnrealized += unrealizedGainLoss;
    }

    for (const bill of openBills as any[]) {
      if (!bill.currencyCode || bill.currencyCode === baseCurrency) continue;
      const bookedRate = bill.exchangeRate || 1;
      const currentRate = await this.getRateOn(schoolSlug, bill.currencyCode, asOfDate);
      const bookedBase = Math.round(bill.balanceDue * bookedRate * 100) / 100;
      const currentBase = Math.round(bill.balanceDue * currentRate * 100) / 100;
      // Payable: owing LESS base currency now = a gain (opposite of AR).
      const unrealizedGainLoss = Math.round((bookedBase - currentBase) * 100) / 100;
      rows.push({
        type: 'payable', documentNo: bill.billNo, partnerName: bill.vendorName,
        currencyCode: bill.currencyCode, foreignBalance: bill.balanceDue,
        bookedRate, currentRate, bookedBase, currentBase, unrealizedGainLoss,
      });
      totalUnrealized += unrealizedGainLoss;
    }

    rows.sort((a, b) => a.unrealizedGainLoss - b.unrealizedGainLoss);
    return { asOf: asOfDate, baseCurrency, rows, totalUnrealized: Math.round(totalUnrealized * 100) / 100 };
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

  // ── Opening Balances (Phase 8) ────────────────────────────
  // Per-fiscal-year opening balance, one row per (account, fiscal year) —
  // see schemas/ledger.schema.ts OpeningBalance for why this is a proper
  // collection rather than reusing the flat ChartOfAccount.openingBalance
  // field. Upserted so re-setting the same account/year corrects it
  // rather than duplicating.
  async setOpeningBalance(schoolSlug: string, accountCode: string, fiscalYearId: string, amount: number, postedBy?: string) {
    const account = await this.coaModel.findOne({ schoolSlug, code: accountCode });
    if (!account) throw new NotFoundException(`Account ${accountCode} not found`);
    const fy = await this.fiscalYearModel.findOne({ _id: fiscalYearId, schoolSlug });
    if (!fy) throw new NotFoundException('Fiscal year not found');
    return this.openingBalanceModel.findOneAndUpdate(
      { schoolSlug, accountCode, fiscalYearId },
      { $set: { amount: Math.round((amount || 0) * 100) / 100, accountName: account.name, postedBy } },
      { new: true, upsert: true },
    );
  }

  async getOpeningBalances(schoolSlug: string, fiscalYearId?: string) {
    const filter: any = { schoolSlug };
    if (fiscalYearId) filter.fiscalYearId = fiscalYearId;
    return this.openingBalanceModel.find(filter).sort({ accountCode: 1 });
  }

  // Phase 8 — computes the closing journal-entry lines for a fiscal year:
  // Debit every Revenue account for its full-year net-credit balance
  // (zeroing it), Credit every Expense account for its full-year
  // net-debit balance (zeroing it), and route the difference (profit or
  // loss) to Retained Earnings. Returns [] when the year had zero
  // ledger activity — nothing to close.
  //
  // Worked example (see also the Phase 8 close-out report): Tuition
  // Revenue (4000) has a full-year credit balance of 1,000,000; Salaries
  // (5000) 600,000 debit; Utilities (5100) 150,000 debit. Net income =
  // 1,000,000 - 750,000 = 250,000 (profit). Lines:
  //   Debit  4000  1,000,000
  //   Credit 5000    600,000
  //   Credit 5100    150,000
  //   Credit 3100 (Retained Earnings) 250,000
  // Total debit = 1,000,000; total credit = 600,000+150,000+250,000 =
  // 1,000,000 — balances exactly, for both a profit and a loss year
  // (in a loss year Retained Earnings is instead debited for the loss,
  // and total debit = totalRevenue + loss = totalExpense = total credit).
  private async computeYearEndClosingLines(schoolSlug: string, fy: any) {
    const accounts = await this.coaModel.find({ schoolSlug, isActive: true, type: { $in: ['revenue', 'expense'] } }).lean();
    const agg = await this.journalModel.aggregate([
      { $match: { schoolSlug, status: 'posted', date: { $gte: fy.startDate, $lte: fy.endDate } } },
      { $unwind: '$lines' },
      { $match: { 'lines.accountCode': { $in: accounts.map((a: any) => a.code) } } },
      { $group: { _id: '$lines.accountCode', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
    ]);
    const byCode = new Map(agg.map((a: any) => [a._id, a]));

    const lines: { accountCode: string; debit?: number; credit?: number }[] = [];
    let totalRevenue = 0;
    let totalExpense = 0;
    for (const a of accounts as any[]) {
      const totals = byCode.get(a.code) || { debit: 0, credit: 0 };
      if (a.type === 'revenue') {
        const netCredit = Math.round((totals.credit - totals.debit) * 100) / 100;
        if (netCredit !== 0) {
          lines.push({ accountCode: a.code, debit: netCredit > 0 ? netCredit : undefined, credit: netCredit < 0 ? -netCredit : undefined });
          totalRevenue += netCredit;
        }
      } else {
        const netDebit = Math.round((totals.debit - totals.credit) * 100) / 100;
        if (netDebit !== 0) {
          lines.push({ accountCode: a.code, credit: netDebit > 0 ? netDebit : undefined, debit: netDebit < 0 ? -netDebit : undefined });
          totalExpense += netDebit;
        }
      }
    }

    if (lines.length === 0) return { lines: [], netIncome: 0 };

    const netIncome = Math.round((totalRevenue - totalExpense) * 100) / 100;
    if (netIncome > 0) {
      lines.push({ accountCode: RETAINED_EARNINGS_ACCOUNT_CODE, credit: netIncome });
    } else if (netIncome < 0) {
      lines.push({ accountCode: RETAINED_EARNINGS_ACCOUNT_CODE, debit: -netIncome });
    }
    return { lines, netIncome };
  }

  // Real year-end closing (Phase 8), not just a flag flip: posts an actual
  // closing journal entry (sourceType 'year_end_closing') via
  // postJournalEntry, then locks every AccountingPeriod within the fiscal
  // year, and only THEN marks the fiscal year isClosed — so a posting
  // failure never leaves the year marked closed without the entry
  // existing. Refuses to re-close an already-closed year.
  async closeFiscalYear(id: string, schoolSlug: string, closedBy: string) {
    const fy = await this.fiscalYearModel.findOne({ _id: id, schoolSlug }).lean();
    if (!fy) throw new NotFoundException('Fiscal year not found');
    if (fy.isClosed) throw new BadRequestException('This fiscal year is already closed');

    const { lines, netIncome } = await this.computeYearEndClosingLines(schoolSlug, fy);

    if (lines.length > 0) {
      await this.postJournalEntry(schoolSlug, {
        date: fy.endDate,
        reference: `${fy.name} Close`,
        narration: `Year-end closing — ${fy.name} (${netIncome >= 0 ? 'net profit' : 'net loss'} ${Math.abs(netIncome).toFixed(2)} to Retained Earnings)`,
        sourceType: 'year_end_closing', sourceId: String(fy._id), postedBy: closedBy,
        lines,
      });
    }

    // Lock every period within this fiscal year so nothing can be
    // back-posted into a closed year without deliberately reopening a period.
    await this.periodModel.updateMany({ schoolSlug, fiscalYearId: fy._id }, { $set: { status: 'closed' } });

    const updated = await this.fiscalYearModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { isClosed: true, closedAt: new Date(), closedBy } },
      { new: true },
    );
    return updated;
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

  // ── Accounting Dimensions (Phase 8) ───────────────────────
  // Generalized tagging framework, additive alongside Cost Center (which
  // remains the first-class, most-used dimension). getDimensions/
  // getDimensionValues/createDimension/createDimensionValue are plain CRUD;
  // the interesting part is postJournalEntry's passthrough + existence
  // validation below, and getDimensionReport's aggregation.
  async getDimensions(schoolSlug: string) {
    return this.dimensionModel.find({ schoolSlug, isActive: true }).sort({ name: 1 });
  }

  async createDimension(data: any) {
    return this.dimensionModel.create(data);
  }

  async getDimensionValues(schoolSlug: string, dimensionId: string) {
    return this.dimensionValueModel.find({ schoolSlug, dimensionId, isActive: true }).sort({ code: 1 });
  }

  async createDimensionValue(data: any) {
    const dimension = await this.dimensionModel.findOne({ _id: data.dimensionId, schoolSlug: data.schoolSlug });
    if (!dimension) throw new NotFoundException('Accounting dimension not found');
    return this.dimensionValueModel.create(data);
  }

  // Mirrors getCostCenterReport's exact pattern, grouped by dimension value
  // instead of cost center name.
  async getDimensionReport(schoolSlug: string, dimensionId: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    const agg = await this.journalModel.aggregate([
      { $match: { schoolSlug, status: 'posted', ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) } },
      { $unwind: '$lines' },
      { $unwind: '$lines.dimensions' },
      { $match: { 'lines.dimensions.dimensionId': new Types.ObjectId(dimensionId) } },
      { $group: { _id: '$lines.dimensions.valueName', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
      { $sort: { _id: 1 } },
    ]);
    return agg.map((a: any) => ({ valueName: a._id, debit: a.debit, credit: a.credit, net: a.debit - a.credit }));
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
    lines: {
      accountCode: string; costCenterName?: string; debit?: number; credit?: number;
      partnerType?: string; partnerId?: string; partnerName?: string; taxTemplateName?: string;
      bankAccountId?: string; bankAccountName?: string;
      // Phase 8 — optional, additive Accounting Dimensions passthrough.
      // No resolution beyond existence-checking each referenced pair.
      dimensions?: { dimensionId: string; valueId: string }[];
    }[];
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

      // Phase 8 — resolve/validate any dimension tags on this line. A
      // referenced dimensionId/valueId that doesn't exist is dropped
      // silently (a reporting dimension must never block a real posting,
      // same convention as costCenterName above), not thrown — the
      // absence of a match is indistinguishable from never having sent one.
      let dimensions: { dimensionId: any; dimensionName: string; valueId: any; valueName: string }[] = [];
      if (l.dimensions?.length) {
        dimensions = (await Promise.all(l.dimensions.map(async (d) => {
          if (!d?.dimensionId || !d?.valueId) return null;
          const [dim, val] = await Promise.all([
            this.dimensionModel.findOne({ _id: d.dimensionId, schoolSlug }),
            this.dimensionValueModel.findOne({ _id: d.valueId, schoolSlug, dimensionId: d.dimensionId }),
          ]);
          if (!dim || !val) return null;
          return { dimensionId: dim._id, dimensionName: dim.name, valueId: val._id, valueName: val.name };
        }))).filter((d): d is NonNullable<typeof d> => !!d);
      }

      return {
        accountCode: account.code, accountName: account.name,
        costCenterId: costCenter?._id || null, costCenterName: costCenter?.name,
        debit, credit,
        partnerType: l.partnerType || null, partnerId: l.partnerId, partnerName: l.partnerName,
        isUnmapped: account.code === SUSPENSE_ACCOUNT_CODE && account.code !== l.accountCode,
        taxTemplateName: l.taxTemplateName,
        // Phase 6 — optional bank-account link, see JournalLine.bankAccountId.
        bankAccountId: l.bankAccountId || null,
        bankAccountName: l.bankAccountName,
        // Phase 8 — optional, additive dimension tags, see above.
        dimensions,
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
    // Phase 8 — templates (isTemplate: true) are a saved shape, never a
    // real posting, so they're excluded from the normal Journal Entries
    // list exactly like they're excluded from every balance report
    // (getTrialBalance/getGeneralLedger/etc. already filter status:
    // 'posted', and templates are always status: 'draft').
    const filter: any = { schoolSlug, isTemplate: { $ne: true } };
    if (sourceType) filter.sourceType = sourceType;
    if (from || to) { filter.date = {}; if (from) filter.date.$gte = new Date(from); if (to) filter.date.$lte = new Date(to); }
    const [data, total] = await Promise.all([
      this.journalModel.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
      this.journalModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ── Journal Entry Templates (Phase 8) ─────────────────────
  // JournalEntry.isTemplate/templateName have existed on the schema since
  // Phase 1 but were never actually used anywhere until now. A template is
  // a JournalEntry doc with isTemplate: true, status: 'draft' — it is
  // never counted in any balance/report aggregation because every report
  // method filters status: 'posted' (verified across the whole service),
  // and it's excluded from getJournalEntries above too.
  async saveAsTemplate(schoolSlug: string, journalEntryId: string, templateName: string) {
    const source = await this.journalModel.findOne({ _id: journalEntryId, schoolSlug }).lean();
    if (!source) throw new NotFoundException('Journal entry not found');
    if (!templateName) throw new BadRequestException('templateName is required');
    const lines = (source.lines || []).map((l: any) => ({
      accountCode: l.accountCode, accountName: l.accountName,
      costCenterId: l.costCenterId, costCenterName: l.costCenterName,
      debit: l.debit, credit: l.credit,
      partnerType: l.partnerType, partnerId: l.partnerId, partnerName: l.partnerName,
      taxTemplateName: l.taxTemplateName,
      bankAccountId: l.bankAccountId, bankAccountName: l.bankAccountName,
      dimensions: l.dimensions || [],
    }));
    return this.journalModel.create({
      schoolSlug, date: new Date(), sourceType: 'manual',
      reference: source.reference, narration: source.narration,
      isTemplate: true, templateName, status: 'draft',
      lines, totalDebit: source.totalDebit, totalCredit: source.totalCredit,
    });
  }

  async getTemplates(schoolSlug: string) {
    return this.journalModel.find({ schoolSlug, isTemplate: true }).sort({ templateName: 1 });
  }

  // Instantiates a new REAL journal entry (posted, isTemplate: false) from
  // a saved template's line shape — useful for recurring entries like
  // monthly accruals. `overrides.lines`, if given, fully replaces the
  // template's lines (e.g. a different month's accrual amount); everything
  // else about posting (balance check, period resolution, running-balance
  // updates) goes through the normal postJournalEntry path.
  async createFromTemplate(schoolSlug: string, templateId: string, date: Date | string, overrides: { narration?: string; reference?: string; lines?: any[] } = {}, postedBy?: string) {
    const template = await this.journalModel.findOne({ _id: templateId, schoolSlug, isTemplate: true }).lean();
    if (!template) throw new NotFoundException('Journal entry template not found');
    const lines = overrides.lines?.length ? overrides.lines : (template.lines || []).map((l: any) => ({
      accountCode: l.accountCode, costCenterName: l.costCenterName, debit: l.debit, credit: l.credit,
      partnerType: l.partnerType, partnerId: l.partnerId, partnerName: l.partnerName,
      taxTemplateName: l.taxTemplateName, bankAccountId: l.bankAccountId, bankAccountName: l.bankAccountName,
      dimensions: (l.dimensions || []).map((d: any) => ({ dimensionId: String(d.dimensionId), valueId: String(d.valueId) })),
    }));
    return this.postJournalEntry(schoolSlug, {
      date, postedBy,
      reference: overrides.reference || template.reference,
      narration: overrides.narration || `${template.narration || ''} (from template: ${template.templateName})`.trim(),
      sourceType: 'manual', sourceId: String(template._id),
      lines,
    });
  }

  async deleteTemplate(schoolSlug: string, id: string) {
    const res = await this.journalModel.deleteOne({ _id: id, schoolSlug, isTemplate: true });
    if (res.deletedCount === 0) throw new NotFoundException('Journal entry template not found');
    return { success: true };
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
      // Phase 5 — multi-currency: the ledger always stays in the school's
      // base currency. When invoice.baseCurrencyAmount is unset (the
      // overwhelming common case — no currency configured), postTotal
      // equals invoice.totalAmount exactly, so this is byte-identical to
      // pre-Phase-5 behavior. When set (a foreign-currency invoice), the
      // FOREIGN totalTax is converted at the same booked rate so revenue
      // and tax scale together with the AR debit.
      const isForeign = invoice.baseCurrencyAmount != null && invoice.baseCurrencyAmount !== invoice.totalAmount;
      const postTotal = isForeign ? invoice.baseCurrencyAmount : invoice.totalAmount;
      const taxAmount = isForeign
        ? Math.round((invoice.totalTax || 0) * (invoice.exchangeRate || 1) * 100) / 100
        : Math.round((invoice.totalTax || 0) * 100) / 100;
      // The tax portion must never inflate revenue — the school doesn't
      // keep the tax, it's a pass-through liability — so revenue is
      // recognized net of tax while AR is debited for the tax-inclusive total.
      const revenueAmount = Math.round((postTotal - taxAmount) * 100) / 100;
      const lines: any[] = [
        { accountCode: '1200', debit: postTotal, partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName, costCenterName: invoice.campus },
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

  // Phase 5 — `fx` carries the (optional) realized FX gain/loss produced
  // when a foreign-currency invoice is settled at a rate different from
  // the one it was booked at. When omitted (the default — a base-currency
  // payment), cashBaseAmount/arBaseAmount both default to payment.amount
  // and no FX line is posted, so this is byte-identical to pre-Phase-5
  // behavior. See recordPayment for how `fx` is computed and a worked
  // numeric example proving the entry balances in both branches.
  private async postFeePaymentJournal(
    schoolSlug: string, invoice: any, payment: any,
    fx: { cashBaseAmount?: number; arBaseAmount?: number; fxDifference?: number } = {},
  ) {
    if (!payment.amount) return;
    try {
      const cashBaseAmount = fx.cashBaseAmount ?? payment.amount;
      const arBaseAmount = fx.arBaseAmount ?? payment.amount;
      const fxDifference = fx.fxDifference || 0;
      const lines: any[] = [
        { accountCode: this.mapPaymentMethodToAccount(payment.paymentMethod), debit: cashBaseAmount, partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName, costCenterName: invoice.campus, bankAccountId: payment.bankAccountId, bankAccountName: payment.bankAccountName },
        { accountCode: '1200', credit: arBaseAmount, partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName, costCenterName: invoice.campus },
      ];
      if (fxDifference > 0) {
        // Foreign currency strengthened vs base since the invoice was
        // booked — the school received more base-currency value than
        // expected: a realized gain (credit, per FX_GAIN_LOSS_ACCOUNT_CODE's
        // convention).
        lines.push({ accountCode: FX_GAIN_LOSS_ACCOUNT_CODE, credit: fxDifference, partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName });
      } else if (fxDifference < 0) {
        lines.push({ accountCode: FX_GAIN_LOSS_ACCOUNT_CODE, debit: -fxDifference, partnerType: 'student', partnerId: String(invoice.studentId || ''), partnerName: invoice.studentName });
      }
      await this.postJournalEntry(schoolSlug, {
        date: payment.paymentDate || new Date(),
        reference: payment.receiptNumber,
        narration: `Fee payment ${payment.receiptNumber} — ${invoice.studentName}`,
        sourceType: 'fee_payment', sourceId: String(payment._id),
        lines,
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
          { accountCode: this.mapPaymentMethodToAccount(expense.paymentMethod), credit: expense.amount, partnerType: 'vendor', partnerName: expense.vendorName || expense.paidTo, costCenterName: expense.departmentId || expense.campusId, bankAccountId: expense.bankAccountId, bankAccountName: expense.bankAccountName },
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

    // Phase 8 — resolve the fiscal year in scope (the one containing
    // `asOf`, or else the school's currently active fiscal year) and look
    // up any per-year OpeningBalance rows for it. When none exist for a
    // given account (the default for every school that has never used
    // this feature), fall back to the flat ChartOfAccount.openingBalance
    // field exactly as before Phase 8 — so behavior is unchanged unless a
    // school has actually set a per-year opening balance.
    const fyMatch = asOf
      ? { schoolSlug, startDate: { $lte: new Date(asOf) }, endDate: { $gte: new Date(asOf) } }
      : { schoolSlug, isActive: true };
    const scopedFy = await this.fiscalYearModel.findOne(fyMatch).sort({ startDate: -1 }).lean();
    const openingBalances = scopedFy
      ? await this.openingBalanceModel.find({ schoolSlug, fiscalYearId: scopedFy._id }).lean()
      : [];
    const obByCode = new Map(openingBalances.map((o: any) => [o.accountCode, o.amount]));

    const rows = accounts.map((a: any) => {
      const totals = byCode.get(a.code) || { debit: 0, credit: 0 };
      const net = this.accountIncreasesOnDebit(a.type) ? (totals.debit - totals.credit) : (totals.credit - totals.debit);
      const opening = obByCode.has(a.code) ? obByCode.get(a.code) : (a.openingBalance || 0);
      return { code: a.code, name: a.name, type: a.type, debit: totals.debit, credit: totals.credit, balance: opening + net };
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

    // Phase 5 — multi-currency: only resolved when the caller actually
    // passes a currencyCode different from the school's base currency;
    // otherwise exchangeRate/baseCurrencyAmount stay undefined and
    // postFeeInvoiceJournal posts totalAmount exactly as before.
    let exchangeRate: number | undefined;
    let baseCurrencyAmount: number | undefined;
    const baseCurrency = await this.getBaseCurrencyCode(data.schoolSlug);
    if (data.currencyCode && data.currencyCode !== baseCurrency) {
      exchangeRate = await this.getRateOn(data.schoolSlug, data.currencyCode, new Date());
      baseCurrencyAmount = Math.round(totalAmount * exchangeRate * 100) / 100;
    }

    const inv = new this.invoiceModel({
      ...data,
      subtotal, totalDiscount, totalTax, totalAmount, balanceDue: totalAmount,
      exchangeRate, baseCurrencyAmount,
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

    // Phase 6 — denormalize the BankAccount name (same convention as
    // costCenterName/partnerName) when a specific bank account was
    // provided, so Bank Reconciliation and the receipt UI can display it
    // without a populate. No-op (and no behavior change) when
    // bankAccountId is unset, which is the pre-Phase-6 default.
    if (payment.bankAccountId) {
      const acc = await this.bankModel.findOne({ _id: payment.bankAccountId, schoolSlug });
      if (acc) payment.bankAccountName = `${acc.bankName} — ${acc.accountTitle}`;
    }

    // Phase 5 — multi-currency realized FX: payment currency is assumed to
    // match the invoice's currency (no cross-currency splitting). If the
    // invoice is in a foreign currency, resolve the rate AT PAYMENT DATE
    // (which may differ from the invoice's booked rate) and compute the
    // difference so postFeePaymentJournal can post it as a realized
    // gain/loss and keep the entry balanced. No-op when the invoice has no
    // currencyCode (the default) — cashBaseAmount/arBaseAmount/fxDifference
    // all stay undefined/0, matching pre-Phase-5 behavior exactly.
    //
    // Worked example: invoice booked at rate 280 (PKR per USD) for a
    // $1,000 balance; payment settles the full $1,000 at rate 285.
    //   arBaseAmount   = 1000 * 280 = 280,000  (clears AR at the booked rate)
    //   cashBaseAmount = 1000 * 285 = 285,000  (actual cash received)
    //   fxDifference   = 285,000 - 280,000 = +5,000 (a realized GAIN — the
    //     receivable turned out to be worth more base currency)
    //   Entry: Dr Cash 285,000 / Cr AR 280,000 / Cr FX Gain 5,000 — balances.
    let cashBaseAmount: number | undefined;
    let arBaseAmount: number | undefined;
    let fxDifference = 0;
    const baseCurrency = await this.getBaseCurrencyCode(schoolSlug);
    if (invoice.currencyCode && invoice.currencyCode !== baseCurrency) {
      const invoiceRate = invoice.exchangeRate || 1;
      const paymentRate = await this.getRateOn(schoolSlug, invoice.currencyCode, payment.paymentDate);
      const diff = this.computeFxDifference(paymentData.amount, invoiceRate, paymentRate);
      arBaseAmount = diff.baseAtOriginalRate;
      cashBaseAmount = diff.baseAtNewRate;
      fxDifference = diff.fxDifference;
      payment.currencyCode = invoice.currencyCode;
      payment.exchangeRate = paymentRate;
      payment.baseCurrencyAmount = cashBaseAmount;
    }
    await payment.save();

    const newPaid = (invoice.paidAmount || 0) + paymentData.amount;
    const newBalance = invoice.totalAmount - newPaid;
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';

    await this.invoiceModel.findByIdAndUpdate(invoiceId, {
      $set: { paidAmount: newPaid, balanceDue: Math.max(0, newBalance), status: newStatus },
    });

    await this.postFeePaymentJournal(schoolSlug, invoice, payment, { cashBaseAmount, arBaseAmount, fxDifference });
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
    // Phase 6 — see recordPayment's identical note on bankAccountName denorm.
    if (exp.bankAccountId) {
      const acc = await this.bankModel.findOne({ _id: exp.bankAccountId, schoolSlug: data.schoolSlug });
      if (acc) exp.bankAccountName = `${acc.bankName} — ${acc.accountTitle}`;
    }
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

  // ============================================================
  // BANK RECONCILIATION (Phase 6) — bank statement import/entry, matching
  // against posted Cash/Bank journal lines, reconciliation status per line.
  // See schemas/bank-reconciliation.schema.ts for the sign convention and
  // schemas/ledger.schema.ts's JournalLine.bankAccountId for how a posted
  // line can (optionally) be traced back to a specific BankAccount.
  //
  // Matching model (Phase 6 first cut): ONE statement line can match MANY
  // journal-entry lines (a bank batching several small deposits into one
  // lump sum is common), so matchStatementLine accepts an array of
  // { journalEntryId, lineIndex }. It does NOT support the reverse — many
  // statement lines splitting one journal-entry line — which would need a
  // partial-match/remaining-amount concept; that's out of scope for this
  // phase and noted as a known simplification.
  // ============================================================

  private readonly BANK_GL_ACCOUNT_CODES = ['1000', '1100'];

  // Bulk-import: tags every inserted line with a fresh importBatchId so the
  // batch is identifiable (and, if a school imports the wrong file,
  // trivially "undo-able" by filtering on this id) as a group.
  async importBankStatementLines(schoolSlug: string, bankAccountId: string, lines: any[]) {
    const bankAccount = await this.bankModel.findOne({ _id: bankAccountId, schoolSlug });
    if (!bankAccount) throw new NotFoundException('Bank account not found');
    if (!Array.isArray(lines) || lines.length === 0) throw new BadRequestException('No statement lines to import');

    const importBatchId = new Types.ObjectId().toString();
    const docs = lines.map((l: any) => ({
      schoolSlug, bankAccountId, importBatchId,
      statementDate: new Date(l.statementDate),
      description: l.description,
      referenceNumber: l.referenceNumber,
      amount: Math.round(Number(l.amount || 0) * 100) / 100,
      runningBalance: l.runningBalance != null ? Number(l.runningBalance) : undefined,
      status: 'unmatched',
    }));
    const inserted = await this.statementLineModel.insertMany(docs);
    return { importBatchId, count: inserted.length, lines: inserted };
  }

  async getBankStatementLines(schoolSlug: string, bankAccountId: string, query: { status?: string; from?: string; to?: string } = {}) {
    const filter: any = { schoolSlug, bankAccountId };
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      filter.statementDate = {};
      if (query.from) filter.statementDate.$gte = new Date(query.from);
      if (query.to) filter.statementDate.$lte = new Date(query.to);
    }
    return this.statementLineModel.find(filter).sort({ statementDate: -1, createdAt: -1 });
  }

  // The "book side" of reconciliation: posted journal-entry lines that hit
  // this bank account's GL account and haven't yet been used in a match.
  // Prefers the new JournalLine.bankAccountId link (Phase 6+ postings) but
  // falls back to matching on the generic 1000/1100 GL account code alone
  // for every posting made before this phase existed — otherwise no
  // historical bank activity would ever show up on this side of the screen.
  async getUnmatchedLedgerLines(schoolSlug: string, bankAccountId: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const matchedLineKeys = await this.statementLineModel
      .find({ schoolSlug, bankAccountId, status: 'matched' })
      .select('matches')
      .lean();
    const usedKeys = new Set<string>();
    for (const sl of matchedLineKeys as any[]) {
      for (const m of sl.matches || []) usedKeys.add(`${m.entryId}:${m.lineIndex}`);
    }

    const entries = await this.journalModel.find({
      schoolSlug, status: 'posted',
      'lines.accountCode': { $in: this.BANK_GL_ACCOUNT_CODES },
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    }).sort({ date: -1, createdAt: -1 }).lean();

    const rows: any[] = [];
    for (const e of entries as any[]) {
      e.lines.forEach((l: any, idx: number) => {
        if (!this.BANK_GL_ACCOUNT_CODES.includes(l.accountCode)) return;
        // A line explicitly tagged to a DIFFERENT bank account never belongs
        // on this account's reconciliation screen. A line with no tag at
        // all is ambiguous (could be any bank account) so it's shown as a
        // candidate on every bank account's screen until manually matched
        // or ignored — that's the accepted tradeoff of not requiring every
        // historical posting to carry a bankAccountId.
        if (l.bankAccountId && String(l.bankAccountId) !== String(bankAccountId)) return;
        if (usedKeys.has(`${e._id}:${idx}`)) return;
        rows.push({
          entryId: e._id, lineIndex: idx, entryNo: e.entryNo, date: e.date,
          narration: e.narration, reference: e.reference, sourceType: e.sourceType,
          accountCode: l.accountCode, debit: l.debit, credit: l.credit,
          amount: Math.round(((l.debit || 0) - (l.credit || 0)) * 100) / 100,
          partnerName: l.partnerName, isBankAccountTagged: !!l.bankAccountId,
        });
      });
    }
    return rows;
  }

  async matchStatementLine(
    schoolSlug: string, statementLineId: string,
    matches: { journalEntryId: string; lineIndex: number }[],
  ) {
    const statementLine = await this.statementLineModel.findOne({ _id: statementLineId, schoolSlug });
    if (!statementLine) throw new NotFoundException('Statement line not found');
    if (!Array.isArray(matches) || matches.length === 0) throw new BadRequestException('At least one journal line to match against is required');

    const resolvedMatches: any[] = [];
    let matchedTotal = 0;
    for (const m of matches) {
      const entry = await this.journalModel.findOne({ _id: m.journalEntryId, schoolSlug }).lean();
      if (!entry) throw new NotFoundException(`Journal entry ${m.journalEntryId} not found`);
      const line = (entry as any).lines?.[m.lineIndex];
      if (!line) throw new NotFoundException(`Line index ${m.lineIndex} not found on entry ${(entry as any).entryNo}`);
      const amount = Math.round(((line.debit || 0) - (line.credit || 0)) * 100) / 100;
      matchedTotal += amount;
      resolvedMatches.push({
        entryId: entry._id, lineIndex: m.lineIndex, entryNo: (entry as any).entryNo,
        narration: (entry as any).narration, date: (entry as any).date, amount,
      });
    }

    // Amounts sometimes legitimately won't line up exactly (a bank lumping
    // several small deposits into one statement line, timing differences,
    // etc.) — flagged as a warning rather than blocked, per Phase 6 scope.
    const statementAmountAbs = Math.abs(statementLine.amount);
    const matchedTotalAbs = Math.abs(matchedTotal);
    const amountMismatchWarning = Math.abs(statementAmountAbs - matchedTotalAbs) > 0.01
      ? `Statement amount (${statementLine.amount}) does not exactly match the total of matched journal line(s) (${matchedTotal}).`
      : null;

    statementLine.status = 'matched';
    statementLine.matches = resolvedMatches;
    await statementLine.save();

    return { statementLine, amountMismatchWarning };
  }

  async unmatchStatementLine(schoolSlug: string, statementLineId: string) {
    return this.statementLineModel.findOneAndUpdate(
      { _id: statementLineId, schoolSlug },
      { $set: { status: 'unmatched', matches: [] } },
      { new: true },
    );
  }

  async ignoreStatementLine(schoolSlug: string, statementLineId: string) {
    return this.statementLineModel.findOneAndUpdate(
      { _id: statementLineId, schoolSlug },
      { $set: { status: 'ignored' } },
      { new: true },
    );
  }

  // Statement balance: the latest statement line's own runningBalance if
  // one was supplied (the most authoritative source — it's what the bank
  // itself reported), else falls back to a straight sum of every imported
  // line's amount for this account. Book balance: sum of posted journal
  // debits/credits hitting this account's GL code(s), i.e. the same
  // "asset increases on debit" logic getGeneralLedger already uses.
  async getReconciliationSummary(schoolSlug: string, bankAccountId: string) {
    const bankAccount = await this.bankModel.findOne({ _id: bankAccountId, schoolSlug });
    if (!bankAccount) throw new NotFoundException('Bank account not found');

    const [latestLine, allLines, ledgerAgg] = await Promise.all([
      this.statementLineModel.findOne({ schoolSlug, bankAccountId }).sort({ statementDate: -1, createdAt: -1 }),
      this.statementLineModel.find({ schoolSlug, bankAccountId }).lean(),
      this.journalModel.aggregate([
        { $match: { schoolSlug, status: 'posted', 'lines.accountCode': { $in: this.BANK_GL_ACCOUNT_CODES } } },
        { $unwind: '$lines' },
        { $match: { 'lines.accountCode': { $in: this.BANK_GL_ACCOUNT_CODES }, $or: [{ 'lines.bankAccountId': new Types.ObjectId(bankAccountId) }, { 'lines.bankAccountId': null }] } },
        { $group: { _id: null, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
      ]),
    ]);

    const statementBalance = latestLine?.runningBalance != null
      ? latestLine.runningBalance
      : Math.round(allLines.reduce((s: number, l: any) => s + l.amount, 0) * 100) / 100;

    const ledgerTotals = ledgerAgg[0] || { debit: 0, credit: 0 };
    const bookBalance = Math.round(((bankAccount.openingBalance || 0) + ledgerTotals.debit - ledgerTotals.credit) * 100) / 100;

    const unmatchedStatementLines = allLines.filter((l: any) => l.status === 'unmatched');
    const unmatchedLedgerLines = await this.getUnmatchedLedgerLines(schoolSlug, bankAccountId);

    const difference = Math.round((statementBalance - bookBalance) * 100) / 100;

    return {
      bankAccountId, bankName: bankAccount.bankName, accountTitle: bankAccount.accountTitle,
      statementBalance, bookBalance, difference,
      isBalanced: Math.abs(difference) < 0.01 && unmatchedStatementLines.length === 0 && unmatchedLedgerLines.length === 0,
      unmatchedStatementCount: unmatchedStatementLines.length,
      unmatchedStatementTotal: Math.round(unmatchedStatementLines.reduce((s: number, l: any) => s + l.amount, 0) * 100) / 100,
      unmatchedLedgerCount: unmatchedLedgerLines.length,
      unmatchedLedgerTotal: Math.round(unmatchedLedgerLines.reduce((s: number, l: any) => s + l.amount, 0) * 100) / 100,
    };
  }

  // ── Reconciliation Sessions ("close out the month") ──────
  async startReconciliation(schoolSlug: string, bankAccountId: string, periodEnd: string) {
    const summary = await this.getReconciliationSummary(schoolSlug, bankAccountId);
    return this.reconciliationModel.create({
      schoolSlug, bankAccountId, periodEnd: new Date(periodEnd),
      statementEndingBalance: summary.statementBalance,
      bookEndingBalance: summary.bookBalance,
      difference: summary.difference,
      status: 'in_progress',
    });
  }

  async getReconciliations(schoolSlug: string, bankAccountId?: string) {
    const filter: any = { schoolSlug };
    if (bankAccountId) filter.bankAccountId = bankAccountId;
    return this.reconciliationModel.find(filter).sort({ periodEnd: -1 });
  }

  async completeReconciliation(schoolSlug: string, id: string, completedBy: string) {
    const recon = await this.reconciliationModel.findOne({ _id: id, schoolSlug });
    if (!recon) throw new NotFoundException('Reconciliation session not found');
    // Re-snapshot the balances at completion time rather than trusting the
    // (possibly stale) figures captured when the session was started.
    const summary = await this.getReconciliationSummary(schoolSlug, String(recon.bankAccountId));
    recon.statementEndingBalance = summary.statementBalance;
    recon.bookEndingBalance = summary.bookBalance;
    recon.difference = summary.difference;
    recon.status = 'completed';
    recon.completedBy = completedBy;
    recon.completedAt = new Date();
    return recon.save();
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

    // Phase 5 — multi-currency: only resolved when the caller passes a
    // currencyCode different from the school's base currency; otherwise
    // exchangeRate/baseCurrencyAmount stay undefined and every line below
    // posts at scale 1 (i.e. exactly as before Phase 5).
    let exchangeRate: number | undefined;
    let baseCurrencyAmount: number | undefined;
    const baseCurrency = await this.getBaseCurrencyCode(schoolSlug);
    const isForeign = !!data.currencyCode && data.currencyCode !== baseCurrency;
    if (isForeign) {
      exchangeRate = await this.getRateOn(schoolSlug, data.currencyCode, billDate);
      baseCurrencyAmount = Math.round(totalAmount * exchangeRate * 100) / 100;
    }
    const scale = isForeign ? (exchangeRate as number) : 1;

    const bill = new this.vendorBillModel({
      ...data,
      vendorName: vendor.name,
      billDate, dueDate,
      subtotal, taxAmount, totalAmount,
      paidAmount: 0, balanceDue: totalAmount,
      status: 'posted',
      schoolSlug,
      exchangeRate, baseCurrencyAmount,
    });
    await bill.save();

    try {
      // isForeign=false leaves every debit exactly as it was pre-Phase-5
      // (Number(l.amount||0), no rounding pass) — only the isForeign branch
      // introduces the currency conversion. The AP credit is always the sum
      // of the debit lines actually posted (rather than an independently
      // scaled totalAmount), so the entry balances exactly regardless of
      // any per-line rounding.
      const journalLines: any[] = lines.map((l: any) => ({
        accountCode: l.accountCode,
        debit: isForeign ? Math.round(Number(l.amount || 0) * scale * 100) / 100 : Number(l.amount || 0),
        costCenterName: l.costCenterName,
        partnerType: 'vendor', partnerId: String(vendor._id), partnerName: vendor.name,
      }));
      if (explicitTaxAmount > 0) {
        // Legacy Phase 2 behavior: fold the flat tax onto the first line's account.
        journalLines.push({
          accountCode: lines[0].accountCode,
          debit: isForeign ? Math.round(explicitTaxAmount * scale * 100) / 100 : explicitTaxAmount,
          partnerType: 'vendor', partnerId: String(vendor._id), partnerName: vendor.name,
        });
      } else {
        for (const t of lineTaxInfo) {
          journalLines.push({
            accountCode: t.accountCode,
            debit: isForeign ? Math.round(t.taxAmount * scale * 100) / 100 : t.taxAmount,
            partnerType: 'vendor', partnerId: String(vendor._id), partnerName: vendor.name,
            taxTemplateName: t.taxTemplateName,
          });
        }
      }
      const creditAmount = isForeign
        ? Math.round(journalLines.reduce((s, l) => s + (l.debit || 0), 0) * 100) / 100
        : totalAmount;
      journalLines.push({
        accountCode: '2000', credit: creditAmount,
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
      bankAccountId: data.bankAccountId,
      schoolSlug,
    });

    // Phase 6 — see recordPayment's identical note on bankAccountName denorm.
    if (payment.bankAccountId) {
      const bankAcc = await this.bankModel.findOne({ _id: payment.bankAccountId, schoolSlug });
      if (bankAcc) payment.bankAccountName = `${bankAcc.bankName} — ${bankAcc.accountTitle}`;
    }

    // Phase 5 — multi-currency realized FX, mirror image of recordPayment's
    // AR-side logic. If this bill was booked in a foreign currency, resolve
    // the rate AT PAYMENT DATE and post the difference vs the bill's
    // booked rate as a realized gain/loss so the entry still balances.
    // No-op when the bill has no currencyCode (the default).
    //
    // Worked example: bill booked at rate 280 (PKR per USD) for a $1,000
    // liability (no withholding, for simplicity); payment settles the full
    // $1,000 at rate 285.
    //   apBaseAmount   = 1000 * 280 = 280,000  (clears AP at the booked rate)
    //   cashBaseAmount = 1000 * 285 = 285,000  (actual cash paid out)
    //   fxDifference   = 285,000 - 280,000 = +5,000 — the school had to pay
    //     out MORE base currency than the liability was carried at: a
    //     realized LOSS (opposite sign convention from the AR side).
    //   Entry: Dr AP 280,000 / Dr FX Loss 5,000 / Cr Cash 285,000 — balances.
    let apBaseAmount: number | undefined;
    let cashBaseAmount: number | undefined;
    let withholdingBaseAmount: number | undefined;
    let fxDifference = 0;
    const baseCurrency = await this.getBaseCurrencyCode(schoolSlug);
    if (bill.currencyCode && bill.currencyCode !== baseCurrency) {
      const billRate = bill.exchangeRate || 1;
      const paymentRate = await this.getRateOn(schoolSlug, bill.currencyCode, payment.paymentDate);
      const diff = this.computeFxDifference(amount, billRate, paymentRate);
      apBaseAmount = diff.baseAtOriginalRate;
      withholdingBaseAmount = Math.round(withholdingAmount * paymentRate * 100) / 100;
      cashBaseAmount = Math.round((diff.baseAtNewRate - withholdingBaseAmount) * 100) / 100;
      fxDifference = diff.fxDifference;
      payment.currencyCode = bill.currencyCode;
      payment.exchangeRate = paymentRate;
    }
    await payment.save();

    const newPaid = (bill.paidAmount || 0) + amount;
    const newBalance = bill.totalAmount - newPaid;
    const newStatus = newBalance <= 0.01 ? 'paid' : 'partial';

    await this.vendorBillModel.findByIdAndUpdate(billId, {
      $set: { paidAmount: newPaid, balanceDue: Math.max(0, newBalance), status: newStatus },
    });

    try {
      const lines: any[] = [
        { accountCode: '2000', debit: apBaseAmount ?? amount, partnerType: 'vendor', partnerId: String(bill.vendorId), partnerName: bill.vendorName },
        { accountCode: this.mapPaymentMethodToAccount(data.paymentMethod), credit: cashBaseAmount ?? cashAmount, partnerType: 'vendor', partnerId: String(bill.vendorId), partnerName: bill.vendorName, bankAccountId: payment.bankAccountId, bankAccountName: payment.bankAccountName },
      ];
      if (withholdingAmount > 0 && withholdingCategory) {
        lines.push({
          accountCode: withholdingCategory.accountCode, credit: withholdingBaseAmount ?? withholdingAmount,
          partnerType: 'vendor', partnerId: String(bill.vendorId), partnerName: bill.vendorName,
          taxTemplateName: withholdingCategory.name,
        });
      }
      if (fxDifference > 0) {
        lines.push({ accountCode: FX_GAIN_LOSS_ACCOUNT_CODE, debit: fxDifference, partnerType: 'vendor', partnerId: String(bill.vendorId), partnerName: bill.vendorName });
      } else if (fxDifference < 0) {
        lines.push({ accountCode: FX_GAIN_LOSS_ACCOUNT_CODE, credit: -fxDifference, partnerType: 'vendor', partnerId: String(bill.vendorId), partnerName: bill.vendorName });
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

  // ============================================================
  // PHASE 7 — REPORT SUITE (Sales Commission, Payment Summary, Vendor
  // Contacts, Tax Detail, Profitability suite). Every number below is
  // computed from real posted JournalEntry/Payment/Vendor data — see
  // claude/finance-module-odoo-standard-build-plan.md for scope. Trial
  // Balance and General Ledger shipped in Phase 1; Payment Period and
  // Customer Credit Balance shipped in Phase 2 (see getPaymentPeriodReport /
  // getCustomerCreditBalance above) — not duplicated here.
  // ============================================================

  // ── Sales Commission — rule + assignment setup ────────────
  async getSalesCommissionRules(schoolSlug: string) {
    return this.commissionRuleModel.find({ schoolSlug }).sort({ referralSourceName: 1 });
  }
  async createSalesCommissionRule(data: any) {
    const rule = new this.commissionRuleModel(data);
    return rule.save();
  }
  async updateSalesCommissionRule(id: string, schoolSlug: string, data: any) {
    return this.commissionRuleModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }
  async deleteSalesCommissionRule(id: string, schoolSlug: string) {
    const rule = await this.commissionRuleModel.findOne({ _id: id, schoolSlug });
    if (!rule) throw new NotFoundException('Commission rule not found');
    rule.isActive = false;
    return rule.save();
  }

  async getCommissionAssignments(schoolSlug: string) {
    return this.commissionAssignmentModel.find({ schoolSlug }).sort({ referralSourceName: 1 });
  }
  async createCommissionAssignment(data: any) {
    const assignment = new this.commissionAssignmentModel(data);
    return assignment.save();
  }
  async deleteCommissionAssignment(id: string, schoolSlug: string) {
    const assignment = await this.commissionAssignmentModel.findOne({ _id: id, schoolSlug });
    if (!assignment) throw new NotFoundException('Commission assignment not found');
    return this.commissionAssignmentModel.deleteOne({ _id: id, schoolSlug });
  }

  // Commission owed by referral source = configured rate applied to real
  // fee collections (Payment records) from students/families actually
  // assigned to that referral source. Starts empty until a school
  // configures at least one rule AND one assignment — no fabricated rows.
  async getSalesCommissionReport(schoolSlug: string, from?: string, to?: string) {
    const [rules, assignments] = await Promise.all([
      this.commissionRuleModel.find({ schoolSlug, isActive: true }).lean(),
      this.commissionAssignmentModel.find({ schoolSlug }).lean(),
    ]);

    if (!rules.length) {
      return { rows: [], totalCommissionOwed: 0, configured: false, assignedCount: assignments.length,
        note: 'No referral-source commission rules configured yet. Set up a rule (rate % or flat amount per referral source) to start tracking commission owed.' };
    }
    if (!assignments.length) {
      return { rows: [], totalCommissionOwed: 0, configured: true, assignedCount: 0,
        note: 'Commission rules exist but no family/student has been assigned to a referral source yet. Commission owed will populate once assignments are made.' };
    }

    const ruleBySource = new Map(rules.map((r: any) => [r.referralSourceName, r]));

    const familyIds = assignments.filter((a: any) => a.targetType === 'family').map((a: any) => a.targetId);
    const families = familyIds.length
      ? await this.familyModel.find({ schoolSlug, _id: { $in: familyIds.filter(Types.ObjectId.isValid) } }).lean()
      : [];
    const familyStudentMap = new Map(families.map((f: any) => [String(f._id), (f.studentIds || []).map(String)]));

    const bySource = new Map<string, Set<string>>();
    for (const a of assignments as any[]) {
      if (!ruleBySource.has(a.referralSourceName)) continue;
      const set = bySource.get(a.referralSourceName) || new Set<string>();
      if (a.targetType === 'student') set.add(a.targetId);
      else if (a.targetType === 'family') for (const sid of familyStudentMap.get(a.targetId) || []) set.add(sid);
      bySource.set(a.referralSourceName, set);
    }

    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const rows: any[] = [];
    let totalCommissionOwed = 0;
    for (const [sourceName, studentIdSet] of bySource) {
      const rule: any = ruleBySource.get(sourceName);
      const studentIds = Array.from(studentIdSet).filter(Types.ObjectId.isValid);
      const collectedAgg = studentIds.length ? await this.paymentModel.aggregate([
        { $match: { schoolSlug, studentId: { $in: studentIds.map(id => new Types.ObjectId(id)) }, ...(Object.keys(dateFilter).length ? { paymentDate: dateFilter } : {}) } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]) : [];
      const totalCollected = collectedAgg[0]?.total || 0;
      const paymentCount = collectedAgg[0]?.count || 0;
      const commissionOwed = rule.rateType === 'flat' ? rule.rateValue * paymentCount : totalCollected * (rule.rateValue / 100);
      totalCommissionOwed += commissionOwed;
      rows.push({
        referralSourceName: sourceName, rateType: rule.rateType, rateValue: rule.rateValue,
        assignedTargetCount: studentIdSet.size, totalCollected, paymentCount,
        commissionOwed: Math.round(commissionOwed * 100) / 100,
      });
    }

    return {
      rows: rows.sort((a, b) => b.commissionOwed - a.commissionOwed),
      totalCommissionOwed: Math.round(totalCommissionOwed * 100) / 100,
      configured: true, assignedCount: assignments.length,
    };
  }

  // ── Sales Payment Summary — collections by period/method/collector ──
  async getPaymentSummaryReport(schoolSlug: string, from?: string, to?: string, groupBy: string = 'month') {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    const match: any = { schoolSlug, ...(Object.keys(dateFilter).length ? { paymentDate: dateFilter } : {}) };
    const dateFormat = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%G-W%V' : '%Y-%m';

    const [byPeriod, byMethod, byCollector, totalsAgg] = await Promise.all([
      this.paymentModel.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: dateFormat, date: '$paymentDate' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.paymentModel.aggregate([
        { $match: match },
        { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      this.paymentModel.aggregate([
        { $match: match },
        { $group: { _id: '$collectedBy', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      this.paymentModel.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 }, avg: { $avg: '$amount' } } },
      ]),
    ]);

    return {
      groupBy,
      byPeriod: byPeriod.map((r: any) => ({ period: r._id, total: r.total, count: r.count })),
      byMethod: byMethod.map((r: any) => ({ paymentMethod: r._id || 'Unspecified', total: r.total, count: r.count })),
      byCollector: byCollector.map((r: any) => ({ collectedBy: r._id || 'Unspecified', total: r.total, count: r.count })),
      totals: totalsAgg[0] ? { total: totalsAgg[0].total, count: totalsAgg[0].count, avgPayment: Math.round((totalsAgg[0].avg || 0) * 100) / 100 } : { total: 0, count: 0, avgPayment: 0 },
    };
  }

  // ── Address & Contacts — Vendor contact directory (the one contact
  // list genuinely owned by Finance; Student/Family contacts belong to the
  // Students module, not duplicated here) ────────────────────
  async getVendorContactsReport(schoolSlug: string) {
    return this.vendorModel.find({ schoolSlug, isActive: true })
      .select('name contactPerson phone email address taxId')
      .sort({ name: 1 })
      .lean();
  }

  // ── Tax Detail Report — every posted journal line that hit a tax
  // account, in one place, instead of three separate General Ledger runs ──
  async getTaxDetailReport(schoolSlug: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    const TAX_ACCOUNT_CODES = ['2400', '1400', '2500'];

    const entries = await this.journalModel.find({
      schoolSlug, status: 'posted', 'lines.accountCode': { $in: TAX_ACCOUNT_CODES },
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    }).sort({ date: 1, createdAt: 1 }).lean();

    const rows: any[] = [];
    for (const e of entries as any[]) {
      const taxLines = e.lines.filter((l: any) => TAX_ACCOUNT_CODES.includes(l.accountCode));
      const otherLines = e.lines.filter((l: any) => !TAX_ACCOUNT_CODES.includes(l.accountCode));
      // Base amount — derived from the entry's own non-tax lines (real
      // posted data, not fabricated). Revenue/expense legs of a tax-bearing
      // posting are conventionally the credit side (fee revenue) or the
      // debit side (purchase expense); prefer whichever is non-zero.
      const otherCredit = otherLines.reduce((s: number, l: any) => s + (l.credit || 0), 0);
      const otherDebit = otherLines.reduce((s: number, l: any) => s + (l.debit || 0), 0);
      const baseAmount = otherCredit > 0 ? otherCredit : otherDebit;
      for (const l of taxLines) {
        rows.push({
          date: e.date, entryNo: e.entryNo, reference: e.reference, narration: e.narration,
          accountCode: l.accountCode, accountName: l.accountName,
          taxTemplateName: l.taxTemplateName || 'Unspecified',
          baseAmount, debit: l.debit, credit: l.credit,
          partnerName: l.partnerName || null,
        });
      }
    }
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    return { from: from ? new Date(from) : null, to: to ? new Date(to) : null, rows, totalDebit, totalCredit };
  }

  // ── Gross Profit ───────────────────────────────────────────
  // Domain-specific definition (a school is a services business, not a
  // manufacturer, so there is no classic COGS split from operating
  // expenses): Gross Profit = Total Fee Revenue (4000 Tuition, 4100
  // Admission, 4200 Transport) minus Salaries & Wages (5000) — salary is
  // the direct cost of delivering the educational service itself. All
  // other operating expenses (utilities, maintenance, marketing, etc.)
  // are treated as below-the-line overhead, same as a services P&L would.
  async getGrossProfit(schoolSlug: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    const REVENUE_CODES = ['4000', '4100', '4200'];
    const SALARY_CODE = '5000';

    const agg = await this.journalModel.aggregate([
      { $match: { schoolSlug, status: 'posted', ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) } },
      { $unwind: '$lines' },
      { $match: { 'lines.accountCode': { $in: [...REVENUE_CODES, SALARY_CODE] } } },
      { $group: { _id: '$lines.accountCode', debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
    ]);

    let totalRevenue = 0, directCost = 0;
    const revenueByAccount: any[] = [];
    for (const row of agg as any[]) {
      if (REVENUE_CODES.includes(row._id)) {
        const net = row.credit - row.debit; // revenue increases on credit
        totalRevenue += net;
        revenueByAccount.push({ accountCode: row._id, amount: net });
      } else if (row._id === SALARY_CODE) {
        directCost = row.debit - row.credit; // expense increases on debit
      }
    }
    const grossProfit = totalRevenue - directCost;
    return {
      from: from ? new Date(from) : null, to: to ? new Date(to) : null,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      directCost: Math.round(directCost * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMarginPct: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0,
      revenueByAccount,
      definition: 'Total Fee Revenue (Tuition 4000 + Admission 4100 + Transport 4200) minus Salaries & Wages (5000) — the direct cost of delivering the educational service. Other operating expenses are excluded, same as any services-business gross-profit line.',
    };
  }

  // ── Profitability Analysis by Cost Center ──────────────────
  // Net income per campus/department — which one is genuinely profitable
  // vs. subsidized. Reuses the same journal aggregation as
  // getCostCenterReport but classifies each account by its COA type so
  // revenue and expense can be netted per cost center instead of just
  // debit-credit.
  async getProfitabilityByCostCenter(schoolSlug: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const [coas, agg] = await Promise.all([
      this.coaModel.find({ schoolSlug }).select('code type').lean(),
      this.journalModel.aggregate([
        { $match: { schoolSlug, status: 'posted', ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) } },
        { $unwind: '$lines' },
        { $match: { 'lines.costCenterName': { $ne: null } } },
        { $group: { _id: { costCenterName: '$lines.costCenterName', accountCode: '$lines.accountCode' }, debit: { $sum: '$lines.debit' }, credit: { $sum: '$lines.credit' } } },
      ]),
    ]);
    const typeByCode = new Map(coas.map((c: any) => [c.code, c.type]));

    const byCostCenter = new Map<string, { costCenterName: string; revenue: number; expense: number }>();
    for (const row of agg as any[]) {
      const name = row._id.costCenterName;
      const type = typeByCode.get(row._id.accountCode);
      if (!byCostCenter.has(name)) byCostCenter.set(name, { costCenterName: name, revenue: 0, expense: 0 });
      const bucket = byCostCenter.get(name)!;
      if (type === 'revenue') bucket.revenue += (row.credit - row.debit);
      else if (type === 'expense') bucket.expense += (row.debit - row.credit);
    }

    const rows = Array.from(byCostCenter.values()).map(r => ({
      costCenterName: r.costCenterName,
      revenue: Math.round(r.revenue * 100) / 100,
      expense: Math.round(r.expense * 100) / 100,
      netIncome: Math.round((r.revenue - r.expense) * 100) / 100,
    })).sort((a, b) => b.netIncome - a.netIncome);

    return { from: from ? new Date(from) : null, to: to ? new Date(to) : null, rows };
  }

  // ── Trend Reports — trailing 12 months (or since first posting) of
  // Revenue, Expenses, Net Income, sourced from real JournalEntry postings ──
  async getMonthlyTrends(schoolSlug: string, months: number = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const [coas, entries] = await Promise.all([
      this.coaModel.find({ schoolSlug }).select('code type').lean(),
      this.journalModel.find({ schoolSlug, status: 'posted', date: { $gte: since } }).select('date lines').lean(),
    ]);
    const typeByCode = new Map(coas.map((c: any) => [c.code, c.type]));

    const byMonth = new Map<string, { month: string; revenue: number; expense: number }>();
    for (const e of entries as any[]) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(key)) byMonth.set(key, { month: key, revenue: 0, expense: 0 });
      const bucket = byMonth.get(key)!;
      for (const l of e.lines || []) {
        const type = typeByCode.get(l.accountCode);
        if (type === 'revenue') bucket.revenue += (l.credit - l.debit);
        else if (type === 'expense') bucket.expense += (l.debit - l.credit);
      }
    }

    const rows: any[] = [];
    const cursor = new Date(since);
    for (let i = 0; i < months; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const b = byMonth.get(key) || { month: key, revenue: 0, expense: 0 };
      rows.push({
        month: b.month,
        revenue: Math.round(b.revenue * 100) / 100,
        expenses: Math.round(b.expense * 100) / 100,
        netIncome: Math.round((b.revenue - b.expense) * 100) / 100,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return rows;
  }

  // ============================================================
  // PHASE 8 — Terms & Conditions Templates
  // Attachable to invoices/fee structures/vendor bills via the optional
  // termsTemplateId ref (see schemas/finance.schema.ts). Plain CRUD.
  // ============================================================
  async getTermsTemplates(schoolSlug: string, appliesTo?: string) {
    const filter: any = { schoolSlug };
    if (appliesTo) filter.appliesTo = appliesTo;
    return this.termsTemplateModel.find(filter).sort({ name: 1 });
  }

  async createTermsTemplate(data: any) {
    return this.termsTemplateModel.create(data);
  }

  async updateTermsTemplate(id: string, schoolSlug: string, data: any) {
    const t = await this.termsTemplateModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!t) throw new NotFoundException('Terms template not found');
    return t;
  }

  async deleteTermsTemplate(id: string, schoolSlug: string) {
    const res = await this.termsTemplateModel.deleteOne({ _id: id, schoolSlug });
    if (res.deletedCount === 0) throw new NotFoundException('Terms template not found');
    return { success: true };
  }

  // ============================================================
  // PHASE 8 — Payment Gateway (integration-ready scaffolding only)
  // No gateway (Stripe/JazzCash/Easypaisa/...) is actually wired up — see
  // schemas/payment-gateway.schema.ts for why, and the file-level comment
  // there about credentialsRef NOT being real secret storage.
  // ============================================================
  async getPaymentGatewayConfig(schoolSlug: string) {
    return this.paymentGatewayConfigModel.findOne({ schoolSlug });
  }

  async upsertPaymentGatewayConfig(schoolSlug: string, data: { provider: string; isActive?: boolean; credentialsRef?: string }) {
    return this.paymentGatewayConfigModel.findOneAndUpdate(
      { schoolSlug },
      { $set: { ...data, schoolSlug } },
      { new: true, upsert: true },
    );
  }

  // Honest placeholder — returns a clear "not configured" response rather
  // than fabricating a fake live integration. See build plan Phase 8.
  async createOnlinePaymentIntent(schoolSlug: string, invoiceId: string, amount: number) {
    const config = await this.paymentGatewayConfigModel.findOne({ schoolSlug, isActive: true });
    if (!config) {
      return { configured: false, message: 'No payment gateway is configured for this school yet.' };
    }
    // No gateway SDK is actually integrated yet — this documents the seam
    // for future work (Stripe/JazzCash/Easypaisa/...) without pretending
    // it's live.
    return {
      configured: true,
      provider: config.provider,
      message: `A payment gateway (${config.provider}) is marked active but no live integration has been implemented yet — this endpoint is scaffolding for future work.`,
      invoiceId, amount,
    };
  }

  // Wired up but explicitly not implemented — documents the webhook seam
  // for whichever gateway is chosen in a future phase.
  async handlePaymentGatewayWebhook(schoolSlug: string, payload: any) {
    return { received: true, processed: false, message: 'Payment gateway webhook handling is not implemented yet — awaiting gateway selection.' };
  }

  // ============================================================
  // ── Payment / Receipt Vouchers ──
  // Client-requested "quick entry" feature, modeled on ERPNext's Payment
  // Entry doctype — ONE unified schema/flow with `paymentType`
  // (receive|pay|transfer) rather than two separate voucher types, since
  // the mechanics (party, accounts, tax, cost center, currency) are
  // identical and only direction/defaults differ. Every voucher posts
  // through postJournalEntry — the same engine as everything else — so it
  // is provably balanced and appears in Trial Balance / General Ledger /
  // Partner Ledger for free.
  //
  // Directionality (the crux of the whole feature — verified by hand, see
  // worked examples in the session report): regardless of paymentType, the
  // posting is always Dr paidToAccountCode / Cr paidFromAccountCode. Only
  // the UI's smart DEFAULTS differ by paymentType (Receive defaults
  // Paid From = a Receivable account, Paid To = Cash/Bank; Pay defaults
  // Paid From = Cash/Bank, Paid To a Payable/Expense account) — the
  // backend does not care which literal accounts are chosen, only that the
  // debit/credit sides are consistently Paid To / Paid From.
  //
  // The PARTY (student/family/vendor/employee/shareholder/other) is
  // attached to whichever side represents them, not whichever side is
  // cash: for `receive` that's the Paid From line (defaults to their
  // Receivable balance); for `pay`/`transfer` that's the Paid To line
  // (defaults to their Payable/expense line). This exactly mirrors
  // ERPNext's own Payment Entry convention (Party Account = Paid From on
  // Receive, Paid To on Pay).
  //
  // "Branch" (client field #4) and "Cost Center" (client field #9) are the
  // SAME field here — costCenterId/costCenterName — see voucher.schema.ts.
  // ============================================================

  // Employee/shareholder/other party types have no backing collection in
  // this Finance module (HR imports Finance, not the reverse — adding a
  // reverse import would be circular) — so 'employee' posts to the ledger
  // as partnerType 'staff' (the same value payroll/expense-claims/advances
  // already use, so a voucher lands in the SAME running balance as those),
  // and 'shareholder'/'other' pass through as their own partnerType values
  // (additive to JournalLine.partnerType — see ledger.schema.ts) purely for
  // getPartnerLedger continuity; neither is validated against any
  // collection, since none exists.
  private voucherPartnerType(partyType: string): string | null {
    if (partyType === 'employee') return 'staff';
    if (['student', 'family', 'vendor', 'shareholder', 'other'].includes(partyType)) return partyType;
    return null;
  }

  // Resolves/validates partyId → partyName for the party types that DO have
  // a real backing collection (student/family/vendor); trusts the supplied
  // partyId/partyName as-is for employee/shareholder/other, exactly as
  // specified — the frontend sources the employee list from HR's own
  // service, and there is no Shareholder concept anywhere in this app.
  private async resolveVoucherParty(schoolSlug: string, partyType: string, partyId?: string, partyName?: string) {
    if (partyType === 'student') {
      if (!partyId) throw new BadRequestException('partyId is required for partyType student');
      const student = await this.studentModel.findOne({ _id: partyId, schoolSlug });
      if (!student) throw new NotFoundException('Student not found');
      return { partyId: String(student._id), partyName: `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim() };
    }
    if (partyType === 'family') {
      if (!partyId) throw new BadRequestException('partyId is required for partyType family');
      const family = await this.familyModel.findOne({ _id: partyId, schoolSlug });
      if (!family) throw new NotFoundException('Family not found');
      return { partyId: String(family._id), partyName: (family as any).primaryGuardianName || (family as any).familyCode };
    }
    if (partyType === 'vendor') {
      if (!partyId) throw new BadRequestException('partyId is required for partyType vendor');
      const vendor = await this.vendorModel.findOne({ _id: partyId, schoolSlug });
      if (!vendor) throw new NotFoundException('Vendor not found');
      return { partyId: String(vendor._id), partyName: vendor.name };
    }
    // employee / shareholder / other — free-text, no collection to validate against.
    if (!partyName) throw new BadRequestException('partyName is required');
    return { partyId: partyId || '', partyName };
  }

  // Thin wrapper around getPartnerLedger returning just the latest running
  // balance (0 if no history yet) — powers the live "Party Balance" field
  // in the New Voucher form as the user fills it in, before submission.
  async getVoucherPartyBalance(schoolSlug: string, partyType: string, partyId?: string, partyName?: string) {
    const partnerType = this.voucherPartnerType(partyType);
    if (!partnerType) return { balance: 0 };
    const rows = await this.getPartnerLedger(schoolSlug, partnerType, partyId || undefined, partyId ? undefined : partyName);
    const balance = rows.length ? rows[rows.length - 1].runningBalance : 0;
    return { balance };
  }

  async getVouchers(schoolSlug: string, query: any = {}) {
    const { page = 1, limit = 20, paymentType, partyType, from, to } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (paymentType) filter.paymentType = paymentType;
    if (partyType) filter.partyType = partyType;
    if (from || to) { filter.postingDate = {}; if (from) filter.postingDate.$gte = new Date(from); if (to) filter.postingDate.$lte = new Date(to); }
    const [data, total] = await Promise.all([
      this.voucherModel.find(filter).sort({ postingDate: -1, createdAt: -1 }).skip(skip).limit(limit),
      this.voucherModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getVoucherById(schoolSlug: string, id: string) {
    const voucher = await this.voucherModel.findOne({ _id: id, schoolSlug });
    if (!voucher) throw new NotFoundException('Voucher not found');
    return voucher;
  }

  async createVoucher(schoolSlug: string, data: any, postedBy?: string) {
    const paymentType = data.paymentType;
    if (!['receive', 'pay', 'transfer'].includes(paymentType)) {
      throw new BadRequestException('paymentType must be receive, pay or transfer');
    }
    if (!data.paidFromAccountCode || !data.paidToAccountCode) {
      throw new BadRequestException('paidFromAccountCode and paidToAccountCode are required');
    }
    const paidAmount = Math.round(Number(data.paidAmount) * 100) / 100;
    if (!paidAmount || paidAmount <= 0) throw new BadRequestException('paidAmount must be greater than 0');

    const postingDate = data.postingDate ? new Date(data.postingDate) : new Date();

    const [paidFromAccount, paidToAccount] = await Promise.all([
      this.resolveAccount(schoolSlug, data.paidFromAccountCode),
      this.resolveAccount(schoolSlug, data.paidToAccountCode),
    ]);
    if (!paidFromAccount) throw new BadRequestException(`Account ${data.paidFromAccountCode} not found`);
    if (!paidToAccount) throw new BadRequestException(`Account ${data.paidToAccountCode} not found`);

    const { partyId, partyName } = await this.resolveVoucherParty(schoolSlug, data.partyType, data.partyId, data.partyName);
    const partnerType = this.voucherPartnerType(data.partyType);

    // Cost Center = Branch (same dimension, see file-level note).
    let costCenterId: any = null;
    let costCenterName: string | undefined;
    if (data.costCenterId) {
      const cc = await this.costCenterModel.findOne({ _id: data.costCenterId, schoolSlug });
      if (cc) { costCenterId = cc._id; costCenterName = cc.name; }
    }

    // Multi-currency (Phase 5) — reuse getRateOn/getBaseCurrencyCode rather
    // than reinventing FX handling. Base currency in, base currency out.
    const baseCurrency = await this.getBaseCurrencyCode(schoolSlug);
    const currencyCode = data.currencyCode || baseCurrency;
    let exchangeRate = Number(data.exchangeRate) || 0;
    if (!exchangeRate) {
      exchangeRate = currencyCode === baseCurrency ? 1 : await this.getRateOn(schoolSlug, currencyCode, postingDate);
    }
    const receivedAmount = Math.round(paidAmount * exchangeRate * 100) / 100;

    // Tax (Phase 3) — reuse the existing TaxTemplate shape rather than
    // reinventing tax computation. See the sign-convention note above the
    // section header for the worked-out Dr/Cr logic below.
    let taxTemplate: any = null;
    let taxAmount = 0;
    if (data.taxTemplateId) {
      taxTemplate = await this.taxTemplateModel.findOne({ _id: data.taxTemplateId, schoolSlug, isActive: true });
      if (taxTemplate) {
        taxAmount = data.taxAmount != null
          ? Math.round(Number(data.taxAmount) * 100) / 100
          : (taxTemplate.computationMethod === 'fixed'
            ? Math.round((taxTemplate.rate || 0) * 100) / 100
            : Math.round(receivedAmount * (taxTemplate.rate || 0)) / 100);
      }
    }

    // Snapshot the party's running balance BEFORE this posting — a
    // historical fact about the voucher, not a live-recomputed value (see
    // voucher.schema.ts's partyBalanceBefore comment).
    const { balance: partyBalanceBefore } = await this.getVoucherPartyBalance(schoolSlug, data.partyType, partyId || undefined, partyName);

    const isReceive = paymentType === 'receive';
    const partyAccountCode = isReceive ? paidFromAccount.code : paidToAccount.code;
    const otherAccountCode = isReceive ? paidToAccount.code : paidFromAccount.code;

    // Tax adds to the cash/bank leg for sales/purchase templates (the
    // school pays/collects more than the party amount, e.g. a recoverable
    // input tax on top of a payment); a withholding template instead
    // deducts from the cash/bank leg (the counterparty is deemed paid/
    // received in FULL for `receivedAmount` even though less cash actually
    // moved) — same convention as recordVendorPayment's withholding logic.
    let cashLegAmount = receivedAmount;
    if (taxAmount > 0 && taxTemplate) {
      cashLegAmount = taxTemplate.type === 'withholding' ? receivedAmount - taxAmount : receivedAmount + taxAmount;
    }
    const taxAddsToCashLeg = cashLegAmount > receivedAmount;

    const lines: any[] = [];
    if (isReceive) {
      // Dr paidTo (cash/bank) / Cr paidFrom (party's receivable) — party
      // line carries partnerType/partnerId/partnerName so getPartnerLedger
      // picks it up.
      lines.push({ accountCode: partyAccountCode, credit: receivedAmount, partnerType, partnerId: partyId, partnerName: partyName, costCenterName });
      lines.push({ accountCode: otherAccountCode, debit: cashLegAmount, costCenterName });
      if (taxAmount > 0 && taxTemplate) {
        lines.push(taxAddsToCashLeg
          ? { accountCode: taxTemplate.accountCode, credit: taxAmount, taxTemplateName: taxTemplate.name, costCenterName }
          : { accountCode: taxTemplate.accountCode, debit: taxAmount, taxTemplateName: taxTemplate.name, costCenterName });
      }
    } else {
      // pay / transfer — Dr paidTo (party's payable/expense) / Cr paidFrom
      // (cash/bank).
      lines.push({ accountCode: partyAccountCode, debit: receivedAmount, partnerType, partnerId: partyId, partnerName: partyName, costCenterName });
      lines.push({ accountCode: otherAccountCode, credit: cashLegAmount, costCenterName });
      if (taxAmount > 0 && taxTemplate) {
        lines.push(taxAddsToCashLeg
          ? { accountCode: taxTemplate.accountCode, debit: taxAmount, taxTemplateName: taxTemplate.name, costCenterName }
          : { accountCode: taxTemplate.accountCode, credit: taxAmount, taxTemplateName: taxTemplate.name, costCenterName });
      }
    }

    const sourceType = isReceive ? 'receipt_voucher' : 'payment_voucher';

    const voucher = new this.voucherModel({
      paymentType,
      postingDate,
      costCenterId, costCenterName,
      partyType: data.partyType, partyId, partyName,
      paidFromAccountCode: paidFromAccount.code, paidFromAccountName: paidFromAccount.name,
      paidToAccountCode: paidToAccount.code, paidToAccountName: paidToAccount.name,
      currencyCode, exchangeRate,
      paidAmount, receivedAmount,
      partyBalanceBefore,
      taxTemplateId: taxTemplate?._id || null, taxTemplateName: taxTemplate?.name, taxAmount,
      referenceNumber: data.referenceNumber, referenceDate: data.referenceDate ? new Date(data.referenceDate) : undefined,
      remarks: data.remarks,
      status: 'posted',
      postedBy,
      schoolSlug,
    });

    // A voucher must never exist without its journal posting (unlike some
    // other flows in this file that swallow posting errors) — this IS the
    // posting, not a side effect of one, so a failure here must fail the
    // whole request.
    const entry = await this.postJournalEntry(schoolSlug, {
      date: postingDate,
      reference: data.referenceNumber,
      narration: data.remarks || `${paymentType === 'receive' ? 'Receipt' : paymentType === 'pay' ? 'Payment' : 'Transfer'} voucher — ${partyName}`,
      sourceType,
      sourceId: String(voucher._id),
      postedBy,
      lines,
    });

    voucher.journalEntryId = entry._id as any;
    await voucher.save();
    return voucher;
  }

  // Reverses the voucher's journal entry (swap every line's debit/credit)
  // and marks the original entry 'reversed' — the JournalEntry.status enum
  // has supported 'reversed' since Phase 1. Never deletes anything;
  // accounting records are only ever reversed, matching every other
  // cancel-style action in this file.
  async cancelVoucher(schoolSlug: string, id: string, cancelledBy?: string) {
    const voucher = await this.voucherModel.findOne({ _id: id, schoolSlug });
    if (!voucher) throw new NotFoundException('Voucher not found');
    if (voucher.status === 'cancelled') throw new BadRequestException('Voucher is already cancelled');

    const original = voucher.journalEntryId
      ? await this.journalModel.findOne({ _id: voucher.journalEntryId, schoolSlug }).lean()
      : null;

    if (original) {
      const reversedLines = (original.lines || []).map((l: any) => ({
        accountCode: l.accountCode,
        costCenterName: l.costCenterName,
        debit: l.credit || 0,
        credit: l.debit || 0,
        partnerType: l.partnerType, partnerId: l.partnerId, partnerName: l.partnerName,
        taxTemplateName: l.taxTemplateName,
        bankAccountId: l.bankAccountId, bankAccountName: l.bankAccountName,
      }));
      const reversal = await this.postJournalEntry(schoolSlug, {
        date: new Date(),
        reference: voucher.voucherNo,
        narration: `Reversal of voucher ${voucher.voucherNo}`,
        sourceType: original.sourceType,
        sourceId: String(voucher._id),
        postedBy: cancelledBy,
        lines: reversedLines,
      });
      voucher.reversalJournalEntryId = reversal._id as any;
      await this.journalModel.updateOne({ _id: original._id }, { $set: { status: 'reversed' } });
    }

    voucher.status = 'cancelled';
    voucher.cancelledBy = cancelledBy;
    voucher.cancelledAt = new Date();
    await voucher.save();
    return voucher;
  }
}
