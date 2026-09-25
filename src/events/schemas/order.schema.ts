import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({ _id: false })
export class OrderLineItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'TicketType' }) ticketTypeId: Types.ObjectId;
  @Prop({ required: true }) ticketTypeName: string;
  @Prop({ required: true }) quantity: number;
  @Prop({ required: true }) unitPrice: number;
}
export const OrderLineItemSchema = SchemaFactory.createForClass(OrderLineItem);

// The purchase transaction (one checkout = one Order); individual
// admission credentials live on Ticket (one per attendee/seat) so a
// 4-ticket order still checks in 4 separate people independently.
@Schema({ timestamps: true, collection: 'event_orders' })
export class Order {
  @Prop({ required: true }) orderNo: string; // e.g. ORD-2026-00001
  @Prop({ required: true, type: Types.ObjectId, ref: 'Event' }) eventId: Types.ObjectId;
  @Prop({ required: true }) buyerName: string;
  @Prop() buyerEmail: string;
  @Prop() buyerPhone: string;
  // Set only when the buyer is a logged-in parent/staff/student account -
  // public/anonymous checkout leaves this null.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) buyerUserId: Types.ObjectId | null;

  @Prop({ type: [OrderLineItemSchema], default: [] }) items: OrderLineItem[];
  @Prop({ required: true }) subtotal: number;
  @Prop({ default: 0 }) discountTotal: number;
  @Prop() promoCode: string;
  @Prop({ required: true }) totalAmount: number;

  @Prop({ enum: ['online', 'cash', 'bank_transfer', 'at_door', 'complimentary'], required: true }) paymentMethod: string;
  // 'pending_payment' covers cash/bank_transfer/at_door until box office
  // confirms it - those tickets exist and hold their seat/capacity slot
  // but don't pass check-in until paid. 'complimentary' orders (and a
  // real online gateway success, once one is wired) go straight to 'paid'.
  @Prop({ enum: ['pending_payment', 'paid', 'refunded', 'cancelled'], default: 'pending_payment' }) status: string;
  @Prop() paidAt: Date;
  @Prop() paidBy: string; // admin/box-office user who confirmed a manual payment

  @Prop() notes: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ schoolSlug: 1, orderNo: 1 }, { unique: true });
OrderSchema.index({ schoolSlug: 1, eventId: 1, status: 1 });
