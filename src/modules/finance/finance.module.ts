import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FeeHead, FeeHeadSchema } from './schemas/fee-head.schema';
import { FeeInvoice, FeeInvoiceSchema } from './schemas/fee-invoice.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Expense, ExpenseSchema } from './schemas/expense.schema';
import { ChartOfAccounts, ChartOfAccountsSchema } from './schemas/chart-of-accounts.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FeeHead.name, schema: FeeHeadSchema },
      { name: FeeInvoice.name, schema: FeeInvoiceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: ChartOfAccounts.name, schema: ChartOfAccountsSchema },
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
