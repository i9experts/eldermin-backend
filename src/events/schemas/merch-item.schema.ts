import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MerchItemDocument = MerchItem & Document;

// Phase 3 — sellable non-ticket items at an event (t-shirts, programme
// booklets, souvenir mugs). Box-office only for now, same "documented gap,
// not silently missing" convention as the rest of this module: adding
// these to the PUBLIC checkout page is real extra surface (stock reads
// racing two anonymous buyers, shipping/pickup logistics) that's a
// separate piece of work, not something to half-wire in here.
@Schema({ timestamps: true, collection: 'event_merch_items' })
export class MerchItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Event' }) eventId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop() description: string;
  @Prop({ required: true }) price: number;
  @Prop() imageUrl: string;
  // null = unlimited stock (e.g. a digital/no-inventory add-on like a
  // "priority parking" pass) - never treated as 0, see EventsService.
  @Prop({ type: Number, default: null }) stock: number | null;
  @Prop({ default: 0 }) soldCount: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const MerchItemSchema = SchemaFactory.createForClass(MerchItem);
MerchItemSchema.index({ schoolSlug: 1, eventId: 1 });
