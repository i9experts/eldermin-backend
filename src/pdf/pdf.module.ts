import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdfLog, PdfLogSchema } from './schemas/pdf-log.schema';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';
import { StudentSchema } from '../students/schemas/student.schema';
import { FeeInvoiceSchema } from '../modules/finance/schemas/fee-invoice.schema';
import { SchoolSchema } from '../organization/schemas/organization.schema';
import { AssessmentSchema } from '../assessments/schemas/assessment.schema';
import { BehaviourRecordSchema } from '../behaviour/schemas/behaviour.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PdfLog.name, schema: PdfLogSchema },
      { name: 'Student', schema: StudentSchema },
      { name: 'Invoice', schema: FeeInvoiceSchema },
      { name: 'School', schema: SchoolSchema },
      { name: 'Assessment', schema: AssessmentSchema },
      { name: 'Behaviour', schema: BehaviourRecordSchema },
    ]),
  ],
  controllers: [PdfController],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
