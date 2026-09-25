import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PdfModule } from '../pdf/pdf.module';
import { EmailModule } from '../email/email.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event, EventSchema } from './schemas/event.schema';
import { TicketType, TicketTypeSchema } from './schemas/ticket-type.schema';
import { PromoCode, PromoCodeSchema } from './schemas/promo-code.schema';
import { Order, OrderSchema } from './schemas/order.schema';
import { Ticket, TicketSchema } from './schemas/ticket.schema';

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
    ]),
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
