import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SupportTicket, SupportTicketSchema } from '../super-admin/schemas/super-admin.schema';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: SupportTicket.name, schema: SupportTicketSchema }])],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
