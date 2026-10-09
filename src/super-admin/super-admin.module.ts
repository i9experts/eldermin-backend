import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { PlatformStaffController } from './platform-staff.controller';
import { PlatformStaffService } from './platform-staff.service';
import { PlatformRoleGuard } from './guards/platform-role.guard';
import { PlatformRole, PlatformRoleSchema } from './schemas/platform-role.schema';
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
      { name: PlatformRole.name, schema: PlatformRoleSchema },
    ]),
  ],
  controllers: [SuperAdminController, PlatformStaffController],
  providers: [
    SuperAdminService,
    PlatformStaffService,
    PlatformRoleGuard,
    // Registered as a global guard here (same convention as
    // RolesModule/CustomRoleGuard) - safe to run globally since it's a
    // no-op for every route without @RequirePlatformAccess() and every
    // user without a customPlatformRoleId.
    { provide: APP_GUARD, useExisting: PlatformRoleGuard },
  ],
  exports: [SuperAdminService, PlatformStaffService],
})
export class SuperAdminModule {}
