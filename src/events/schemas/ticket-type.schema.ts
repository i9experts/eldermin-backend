import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TicketTypeDocument = TicketType & Document;

// One price at one point in time - lets an event auto-switch from
// Early Bird to Regular to Last Minute pricing purely by date, with no
// admin action needed on the day itself.
@Schema({ _id: false })
export class PriceTier {
  @Prop({ required: true }) name: string; // "Early Bird", "Regular", "Last Minute"
  @Prop({ required: true }) price: number;
  @Prop({ required: true }) startsAt: Date;
  @Prop() endsAt: Date; // open-ended (null) = runs until the next tier starts, or forever if last
}
export const PriceTierSchema = SchemaFactory.createForClass(PriceTier);

@Schema({ timestamps: true, collection: 'event_ticket_types' })
export class TicketType {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Event' }) eventId: Types.ObjectId;
  @Prop({ required: true }) name: string; // "General", "VIP", "Student"
  @Prop() description: string;
  @Prop({ required: true }) capacity: number;
  // Denormalized running counts - avoids a COUNT query against Ticket on
  // every availability check (checkout is the hot path here).
  @Prop({ default: 0 }) soldCount: number;
  @Prop({ type: [PriceTierSchema], default: [] }) priceTiers: PriceTier[];
  // A ticket type with no price tiers at all (or isComplimentary) is free -
  // used for guest/VIP-invite/staff comp tickets that never go through
  // checkout pricing.
  @Prop({ default: false }) isComplimentary: boolean;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) sortOrder: number;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const TicketTypeSchema = SchemaFactory.createForClass(TicketType);
TicketTypeSchema.index({ schoolSlug: 1, eventId: 1 });
