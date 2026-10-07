import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import {
  Institution, InstitutionSchema,
  SubscriptionHistory, SubscriptionHistorySchema,
  UsageLog, UsageLogSchema,
  Announcement, AnnouncementSchema,
  SupportTicket, SupportTicketSchema,
} from './schemas/super-admin.schema';
import { User, UserSchema } from '../modules/organization/schemas/user.schema';
import { Tenant, TenantSchema } from '../modules/organization/schemas/tenant.schema';
import { InstitutionSchema as OrgInstitutionSchema } from '../modules/organization/schemas/institution.schema';
import { SchoolSchema, Campus, CampusSchema, Grade, GradeSchema, AcademicYear, AcademicYearSchema } from '../organization/schemas/organization.schema';
import { MarketingLead, LeadSchema } from '../leads/schemas/lead.schema';
import { Student, StudentSchema } from '../students/schemas/student.schema';
import { Staff, StaffSchema } from '../modules/hr/schemas/staff.schema';
import { ModulesModule } from '../modules/modules.module';

@Module({
  imports: [
    ModulesModule,
    // Same secret/expiry source as AuthModule's own JwtModule - a real,
    // normally-verifiable JWT for impersonation (see
    // generateImpersonationToken), not the throwaway base64 blob this
    // used to return, which nothing could ever actually log in with.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Institution.name, schema: InstitutionSchema },
      { name: SubscriptionHistory.name, schema: SubscriptionHistorySchema },
      { name: UsageLog.name, schema: UsageLogSchema },
      { name: Announcement.name, schema: AnnouncementSchema },
      { name: SupportTicket.name, schema: SupportTicketSchema },
      { name: User.name, schema: UserSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: 'OrgInstitution', schema: OrgInstitutionSchema },
      { name: 'School', schema: SchoolSchema },
      { name: MarketingLead.name, schema: LeadSchema },
      { name: Campus.name, schema: CampusSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: AcademicYear.name, schema: AcademicYearSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Staff.name, schema: StaffSchema },
    ]),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
