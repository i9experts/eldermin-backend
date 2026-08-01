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
