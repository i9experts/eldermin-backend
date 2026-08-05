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
} from './schemas/ledger.schema';
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
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { Family, FamilySchema } from '../families/schemas/family.schema';
import { Campus, CampusSchema, Grade, GradeSchema } from '../organization/schemas/organization.schema';

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
      { name: Student.name, schema: StudentSchema },
      { name: Family.name, schema: FamilySchema },
      { name: Campus.name, schema: CampusSchema },
      { name: Grade.name, schema: GradeSchema },
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
