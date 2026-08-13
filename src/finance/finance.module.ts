import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import {
  ChartOfAccount, COASchema,
  FeeStructure, FeeStructureSchema,
  Invoice, InvoiceSchema,
  Payment, PaymentSchema,
  Expense, ExpenseSchema,
  Budget, BudgetSchema,
  BankAccount, BankAccountSchema,
  DiscountProgram, DiscountProgramSchema,
  FeeAssignment, FeeAssignmentSchema,
} from './schemas/finance.schema';
import {
  FiscalYear, FiscalYearSchema,
  AccountingPeriod, AccountingPeriodSchema,
  CostCenter, CostCenterSchema,
  PaymentTerm, PaymentTermSchema,
  JournalEntry, JournalEntrySchema,
  OpeningBalance, OpeningBalanceSchema,
} from './schemas/ledger.schema';
import {
  AccountingDimension, AccountingDimensionSchema,
  DimensionValue, DimensionValueSchema,
} from './schemas/dimension.schema';
import { TermsTemplate, TermsTemplateSchema } from './schemas/terms-template.schema';
import { PaymentGatewayConfig, PaymentGatewayConfigSchema } from './schemas/payment-gateway.schema';
import {
  Vendor, VendorSchema,
  VendorBill, VendorBillSchema,
  VendorPayment, VendorPaymentSchema,
} from './schemas/vendor.schema';
import {
  TaxTemplate, TaxTemplateSchema,
  ItemTaxTemplate, ItemTaxTemplateSchema,
  TaxRule, TaxRuleSchema,
  WithholdingTaxCategory, WithholdingTaxCategorySchema,
} from './schemas/tax.schema';
import {
  Currency, CurrencySchema,
  ExchangeRate, ExchangeRateSchema,
} from './schemas/currency.schema';
import {
  BankStatementLine, BankStatementLineSchema,
  BankReconciliation, BankReconciliationSchema,
} from './schemas/bank-reconciliation.schema';
import {
  SalesCommissionRule, SalesCommissionRuleSchema,
  CommissionAssignment, CommissionAssignmentSchema,
} from './schemas/commission.schema';
import { PaymentVoucher, PaymentVoucherSchema } from './schemas/voucher.schema';
import {
  DefaulterReminderLog, DefaulterReminderLogSchema,
  PaymentCommitment, PaymentCommitmentSchema,
  DefaulterPolicy, DefaulterPolicySchema,
} from './schemas/defaulter.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { Family, FamilySchema } from '../families/schemas/family.schema';
import { Campus, CampusSchema, Grade, GradeSchema } from '../organization/schemas/organization.schema';
import { Tenant, TenantSchema } from '../modules/organization/schemas/tenant.schema';
import { EmailModule } from '../email/email.module';
import { FeeDefaulterService } from './fee-defaulter.service';
import { FeeDefaulterController } from './fee-defaulter.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChartOfAccount.name, schema: COASchema },
      { name: FeeStructure.name, schema: FeeStructureSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: Budget.name, schema: BudgetSchema },
      { name: BankAccount.name, schema: BankAccountSchema },
      { name: DiscountProgram.name, schema: DiscountProgramSchema },
      { name: FeeAssignment.name, schema: FeeAssignmentSchema },
      { name: FiscalYear.name, schema: FiscalYearSchema },
      { name: AccountingPeriod.name, schema: AccountingPeriodSchema },
      { name: CostCenter.name, schema: CostCenterSchema },
      { name: PaymentTerm.name, schema: PaymentTermSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: Vendor.name, schema: VendorSchema },
      { name: VendorBill.name, schema: VendorBillSchema },
      { name: VendorPayment.name, schema: VendorPaymentSchema },
      { name: TaxTemplate.name, schema: TaxTemplateSchema },
      { name: ItemTaxTemplate.name, schema: ItemTaxTemplateSchema },
      { name: TaxRule.name, schema: TaxRuleSchema },
      { name: WithholdingTaxCategory.name, schema: WithholdingTaxCategorySchema },
      { name: Currency.name, schema: CurrencySchema },
      { name: ExchangeRate.name, schema: ExchangeRateSchema },
      { name: BankStatementLine.name, schema: BankStatementLineSchema },
      { name: BankReconciliation.name, schema: BankReconciliationSchema },
      { name: SalesCommissionRule.name, schema: SalesCommissionRuleSchema },
      { name: CommissionAssignment.name, schema: CommissionAssignmentSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Family.name, schema: FamilySchema },
      { name: Campus.name, schema: CampusSchema },
      { name: Grade.name, schema: GradeSchema },
      // Phase 8
      { name: OpeningBalance.name, schema: OpeningBalanceSchema },
      { name: AccountingDimension.name, schema: AccountingDimensionSchema },
      { name: DimensionValue.name, schema: DimensionValueSchema },
      { name: TermsTemplate.name, schema: TermsTemplateSchema },
      { name: PaymentGatewayConfig.name, schema: PaymentGatewayConfigSchema },
      // Payment / Receipt Vouchers
      { name: PaymentVoucher.name, schema: PaymentVoucherSchema },
      // Fee Defaulter Engine
      { name: DefaulterReminderLog.name, schema: DefaulterReminderLogSchema },
      { name: PaymentCommitment.name, schema: PaymentCommitmentSchema },
      { name: DefaulterPolicy.name, schema: DefaulterPolicySchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
    EmailModule,
  ],
  controllers: [FinanceController, FeeDefaulterController],
  providers: [FinanceService, FeeDefaulterService],
  exports: [FinanceService, FeeDefaulterService],
})
export class FinanceModule {}
