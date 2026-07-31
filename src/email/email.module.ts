import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  controllers: [EmailController],
  providers: [EmailService, WhatsAppService],
  exports: [EmailService, WhatsAppService],
})
export class EmailModule {}
