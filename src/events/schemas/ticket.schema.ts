import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TicketDocument = Ticket & Document;

// One row per admitted person/seat - what actually gets scanned at the
// door. An Order for "3x General" produces 3 of these, each
// independently checked in.
@Schema({ timestamps: true, collection: 'event_tickets' })
export class Ticket {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Order' }) orderId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Event' }) eventId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'TicketType' }) ticketTypeId: Types.ObjectId;
  @Prop({ required: true }) ticketTypeName: string;

  @Prop({ required: true }) attendeeName: string;
  @Prop() attendeeEmail: string;
  @Prop() attendeePhone: string;

  // Random opaque token encoded into the QR - deliberately not the Mongo
  // _id (never expose/guess a sequential/enumerable identifier as an
  // admission credential).
  @Prop({ required: true, unique: true }) qrToken: string;

  @Prop({ enum: ['reserved', 'valid', 'checked_in', 'cancelled', 'refunded'], default: 'reserved' }) status: string;
  @Prop() checkedInAt: Date;
  @Prop() checkedInBy: string;
  @Prop() checkedInGate: string;
  @Prop({ default: false }) badgePrinted: boolean;
  @Prop() badgePrintedAt: Date;

  // References Seat.seatId within this event's SeatMap - not a Mongo ref,
  // since a Seat is a layout subdocument, not its own collection. Null for
  // general-admission events with no SeatMap.
  @Prop({ type: String, default: null }) seatId: string | null;

  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const TicketSchema = SchemaFactory.createForClass(Ticket);
TicketSchema.index({ schoolSlug: 1, eventId: 1, status: 1 });
TicketSchema.index({ schoolSlug: 1, orderId: 1 });
