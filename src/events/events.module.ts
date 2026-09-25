import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdfModule } from '../pdf/pdf.module';
import { EmailModule } from '../email/email.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { CampaignsService } from './campaigns.service';
import { Event, EventSchema } from './schemas/event.schema';
import { TicketType, TicketTypeSchema } from './schemas/ticket-type.schema';
import { PromoCode, PromoCodeSchema } from './schemas/promo-code.schema';
import { Order, OrderSchema } from './schemas/order.schema';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import { SeatMap, SeatMapSchema } from './schemas/seat-map.schema';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import { CampaignSend, CampaignSendSchema } from './schemas/campaign-send.schema';
import { MerchItem, MerchItemSchema } from './schemas/merch-item.schema';

@Module({
  imports: [
    PdfModule,
    EmailModule,
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: TicketType.name, schema: TicketTypeSchema },
      { name: PromoCode.name, schema: PromoCodeSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Ticket.name, schema: TicketSchema },
      { name: SeatMap.name, schema: SeatMapSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignSend.name, schema: CampaignSendSchema },
      { name: MerchItem.name, schema: MerchItemSchema },
    ]),
  ],
  controllers: [EventsController],
  providers: [EventsService, CampaignsService],
  exports: [EventsService, CampaignsService],
})
export class EventsModule {}
