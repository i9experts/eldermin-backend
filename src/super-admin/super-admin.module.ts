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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Institution.name, schema: InstitutionSchema },
      { name: SubscriptionHistory.name, schema: SubscriptionHistorySchema },
      { name: UsageLog.name, schema: UsageLogSchema },
      { name: Announcement.name, schema: AnnouncementSchema },
      { name: SupportTicket.name, schema: SupportTicketSchema },
    ]),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
