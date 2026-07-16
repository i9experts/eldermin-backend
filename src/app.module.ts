import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
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
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eldermin',
    ),
    AuthModule,
    OrganizationModule,
    HrModule,
    FinanceModule,
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
