import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdfLog, PdfLogSchema } from './schemas/pdf-log.schema';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';
import { StudentSchema } from '../students/schemas/student.schema';
import { InvoiceSchema, PaymentSchema, ExpenseSchema, BankAccountSchema } from '../finance/schemas/finance.schema';
import { SchoolSchema, Campus, CampusSchema } from '../organization/schemas/organization.schema';
import { GroupInstitution, GroupInstitutionSchema } from '../organization/schemas/group-institution.schema';
import { AssessmentSchema } from '../assessments/schemas/assessment.schema';
import { TermReportCard, TermReportCardSchema } from '../assessments/schemas/term-report-card.schema';
import { BehaviourRecord, BehaviourRecordSchema, TarbiyahAssessment, TarbiyahAssessmentSchema } from '../behaviour/schemas/behaviour.schema';
import { QaidaProgressSchema } from '../behaviour/schemas/qaida-progress.schema';
import { CharacterProgramSettings, CharacterProgramSettingsSchema } from '../behaviour/schemas/character-program-settings.schema';
import { ReportTemplateSchema } from '../modules/report-templates/schemas/report-template.schema';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [
    // Reuses FinanceService.getFeeRevenueByBatchReport for the Fee Revenue
    // Report PDF, rather than re-deriving the same aggregation a second
    // time straight from raw models the way the rest of this file's
    // report methods (which predate this module link) still do.
    // FinanceModule doesn't import PdfModule anywhere, so this is a
    // one-directional dependency, not a cycle.
    FinanceModule,
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
      // Comprehensive report-card PDF (generateReportCard) now reads the
      // already-computed TermReportCard directly - see Phase 1
      // (AssessmentService.generateTermReportCards) - instead of
      // re-querying Assessment/behaviour collections with the wrong
      // field shapes, which always produced zero marks.
      { name: TermReportCard.name, schema: TermReportCardSchema },
      // behaviour_records under its OWN model name. This used to be registered as 'Behaviour', the name students.module uses for the legacy
      // student_behaviour store, so whichever module loaded first decided which collection BOTH services read and wrote (BB12).
      { name: BehaviourRecord.name, schema: BehaviourRecordSchema },
      { name: 'QaidaProgress', schema: QaidaProgressSchema },
      { name: TarbiyahAssessment.name, schema: TarbiyahAssessmentSchema },
      { name: CharacterProgramSettings.name, schema: CharacterProgramSettingsSchema },
      { name: 'ReportTemplate', schema: ReportTemplateSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: GroupInstitution.name, schema: GroupInstitutionSchema },
    ]),
  ],
  controllers: [PdfController],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
