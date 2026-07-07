import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdfLog, PdfLogSchema } from './schemas/pdf-log.schema';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';
import { StudentSchema } from '../students/schemas/student.schema';
import { FeeInvoiceSchema } from '../modules/finance/schemas/fee-invoice.schema';
import { PaymentSchema } from '../modules/finance/schemas/payment.schema';
import { ExpenseSchema } from '../modules/finance/schemas/expense.schema';
import { SchoolSchema } from '../organization/schemas/organization.schema';
import { AssessmentSchema } from '../assessments/schemas/assessment.schema';
import { BehaviourRecordSchema } from '../behaviour/schemas/behaviour.schema';
import { ReportTemplateSchema } from '../modules/report-templates/schemas/report-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PdfLog.name, schema: PdfLogSchema },
      { name: 'Student', schema: StudentSchema },
      { name: 'Invoice', schema: FeeInvoiceSchema },
      { name: 'Payment', schema: PaymentSchema },
      { name: 'Expense', schema: ExpenseSchema },
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
