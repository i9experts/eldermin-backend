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
} from './schemas/finance.schema';

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
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
