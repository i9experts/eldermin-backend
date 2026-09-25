import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SeatMapDocument = SeatMap & Document;

// One seat in a SeatMap's layout - not its own collection, just a
// position/label. Live occupancy (is this seat taken right now) is
// computed by looking up Ticket.seatId against this event's active
// tickets, the same read-time-merge pattern used elsewhere in this
// codebase (Finance fee due dates, Assessment exam windows on the School
// Calendar) - never denormalized here, so it can't go stale.
@Schema({ _id: false })
export class Seat {
  @Prop({ required: true }) seatId: string; // stable id within this map, e.g. "A-12"
  @Prop({ required: true }) row: string; // "A"
  @Prop({ required: true }) number: number; // 12
  @Prop({ type: Number, default: null }) x: number | null; // layout position for rendering (percentage of map width)
  @Prop({ type: Number, default: null }) y: number | null;
  // Restricts this seat to one ticket type (e.g. a VIP row) - null = any
  // ticket type on this event can be assigned here.
  @Prop({ type: Types.ObjectId, ref: 'TicketType', default: null }) ticketTypeId: Types.ObjectId | null;
}
export const SeatSchema = SchemaFactory.createForClass(Seat);

// A seat map belongs to one Event (not per-session - a multi-session
// event with genuinely different layouts per day is a documented Phase 3
// gap, not silently missing). An event with no SeatMap document is
// general-admission (no seat picker shown at checkout).
@Schema({ timestamps: true, collection: 'event_seat_maps' })
export class SeatMap {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Event', unique: true }) eventId: Types.ObjectId;
  @Prop({ required: true }) name: string; // "Main Hall"
  @Prop({ type: [Seat], default: [] }) seats: Seat[];
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const SeatMapSchema = SchemaFactory.createForClass(SeatMap);
