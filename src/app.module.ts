import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationModule } from './organization/organization.module';
import { HrModule } from './modules/hr/hr.module';
import { FinanceModule } from './finance/finance.module';
import { DocumentsModule } from './documents/documents.module';
import { ProcurementModule } from './procurement/procurement.module';
import { StudentsModule } from './students/students.module';
import { TeachingModule } from './modules/teaching/teaching.module';
import { AcademicsModule } from './modules/academics/academics.module';
import { AdmissionsModule } from './admissions/admissions.module';
import { AssessmentModule } from './assessments/assessment.module';
import { BehaviourModule } from './behaviour/behaviour.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { CampusModule } from './campus/campus.module';
import { UploadModule } from './upload/upload.module';
import { EmailModule } from './email/email.module';
import { ComplianceModule } from './compliance/compliance.module';
import { PdfModule } from './pdf/pdf.module';
import { ReportTemplatesModule } from './modules/report-templates/report-templates.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ModulesModule } from './modules/modules.module';
import { FamiliesModule } from './families/families.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { LeadsModule } from './leads/leads.module';
import { SupportModule } from './support/support.module';
import { RolesModule } from './roles/roles.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AuditLogModule } from './common/audit-log.module';
import { SyllabusModule } from './syllabus/syllabus.module';
import { EceModule } from './ece/ece.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { ParentPortalModule } from './parent-portal/parent-portal.module';
import { StaffPortalModule } from './staff-portal/staff-portal.module';
import { ResellersModule } from './resellers/resellers.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { IdCardsModule } from './modules/id-cards/id-cards.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { AccountingIntegrationsModule } from './modules/accounting-integrations/accounting-integrations.module';
import { SchoolCalendarModule } from './school-calendar/school-calendar.module';
import { EventsModule } from './events/events.module';

import { idMatchConnectionFactory, IdMatchSelfTest } from './common/utils/id-match.selftest';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // No options object here used to mean every Mongo driver default
    // applied uninspected on a multi-tenant production server - most
    // consequentially a 30s serverSelectionTimeoutMS, which meant that
    // under any real contention (several schools hitting the DB at once,
    // or the event loop briefly stalled by something CPU-heavy elsewhere
    // in the process) a write could simply hang for up to 30 seconds with
    // no error and no success - indistinguishable from "I clicked Save
    // and nothing happened." Trimmed to fail fast enough to actually
    // surface an error to the user instead of hanging silently, and
    // socketTimeoutMS bounds how long an already-established connection
    // can sit on a stuck operation.
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eldermin',
      {
        maxPoolSize: 50,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        // B0: widen id filters on Mixed-typed id paths to match string AND ObjectId storage (docs/staff-portal/B0_ID_TYPING.md)
        connectionFactory: idMatchConnectionFactory,
      },
    ),
    ScheduleModule.forRoot(),
    AuthModule,
    OrganizationModule,
    HrModule,
    FinanceModule,
    AccountingIntegrationsModule,
    SchoolCalendarModule,
    EventsModule,
    ProcurementModule,
    StudentsModule,
    TeachingModule,
    AcademicsModule,
    AdmissionsModule,
    AssessmentModule,
    DocumentsModule,
    BehaviourModule,
    SuperAdminModule,
    CampusModule,
    UploadModule,
    EmailModule,
    ComplianceModule,
    PdfModule,
    ReportTemplatesModule,
    OnboardingModule,
    ModulesModule,
    FamiliesModule,
    AnalyticsModule,
    LeadsModule,
    SupportModule,
    RolesModule,
    AuditLogModule,
    SyllabusModule,
    EceModule,
    ComplaintsModule,
    ParentPortalModule,
    StaffPortalModule,
    ResellersModule,
    KnowledgeBaseModule,
    IdCardsModule,
    CertificatesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    IdMatchSelfTest,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
