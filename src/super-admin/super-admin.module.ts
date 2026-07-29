import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
import { SchoolSchema } from '../organization/schemas/organization.schema';
import { MarketingLead, LeadSchema } from '../leads/schemas/lead.schema';

@Module({
  imports: [
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
    ]),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
