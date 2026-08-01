import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdfLog, PdfLogSchema } from './schemas/pdf-log.schema';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';
import { StudentSchema } from '../students/schemas/student.schema';
import { InvoiceSchema, PaymentSchema, ExpenseSchema, BankAccountSchema } from '../finance/schemas/finance.schema';
import { SchoolSchema } from '../organization/schemas/organization.schema';
import { AssessmentSchema } from '../assessments/schemas/assessment.schema';
import { BehaviourRecordSchema } from '../behaviour/schemas/behaviour.schema';
import { ReportTemplateSchema } from '../modules/report-templates/schemas/report-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PdfLog.name, schema: PdfLogSchema },
      { name: 'Student', schema: StudentSchema },
      // NOTE: previously wired to src/modules/finance/schemas/fee-invoice.schema.ts
      // (dead duplicate, collection 'feeInvoices' - disjoint from the real
      // 'invoices' collection, so invoice PDFs could never find a real
      // invoice) and src/modules/finance/schemas/payment.schema.ts (same
      // collection name but different field names - receiptNo vs
      // receiptNumber, method vs paymentMethod, etc). Now points at the
      // real, live finance schemas used everywhere else in the app.
      { name: 'Invoice', schema: InvoiceSchema },
      { name: 'Payment', schema: PaymentSchema },
      { name: 'Expense', schema: ExpenseSchema },
      { name: 'BankAccount', schema: BankAccountSchema },
      { name: 'School', schema: SchoolSchema },
      { name: 'Assessment', schema: AssessmentSchema },
      { name: 'Behaviour', schema: BehaviourRecordSchema },
      { name: 'ReportTemplate', schema: ReportTemplateSchema },
    ]),
  ],
  controllers: [PdfController],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
