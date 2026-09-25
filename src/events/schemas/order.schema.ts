import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({ _id: false })
export class OrderLineItem {
  // Exactly one of ticketTypeId or merchItemId is set, per `kind` - kept as
  // two optional refs rather than a polymorphic single field so each still
  // has its own typed ref/name for existing ticket-line code that never
  // expected a merch line to begin with.
  @Prop({ enum: ['ticket', 'merch'], default: 'ticket' }) kind: string;
  @Prop({ type: Types.ObjectId, ref: 'TicketType', default: null }) ticketTypeId: Types.ObjectId | null;
  @Prop() ticketTypeName: string;
  @Prop({ type: Types.ObjectId, ref: 'MerchItem', default: null }) merchItemId: Types.ObjectId | null;
  @Prop() merchItemName: string;
  @Prop({ required: true }) quantity: number;
  @Prop({ required: true }) unitPrice: number;
}
export const OrderLineItemSchema = SchemaFactory.createForClass(OrderLineItem);

// Phase 3 — one row per partial (not-the-whole-order) refund transaction,
// e.g. 2 of 4 tickets returned. Kept separate from the single
// refundedAt/refundedBy/... fields below, which record a FULL-order
// refund/cancel (see EventsService.cancelOrder) - a partial refund never
// changes Order.status away from 'paid', since the order as a whole is
// still a real, still-valid purchase.
@Schema({ _id: false })
export class TicketRefund {
  @Prop({ type: [Types.ObjectId], default: [] }) ticketIds: Types.ObjectId[];
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) reference: string;
  @Prop({ required: true }) refundedAt: Date;
  @Prop({ required: true }) refundedBy: string;
}
export const TicketRefundSchema = SchemaFactory.createForClass(TicketRefund);

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

  // Refund-to-source: a refund always returns via the SAME method the
  // order was paid with (refundMethod mirrors paymentMethod, set by
  // EventsService.cancelOrder, never chosen independently) - a school
  // can't accidentally hand back cash for a bank-transfer payment without
  // it being visible here. Full-order refunds only in Phase 2; a partial
  // refund (e.g. 2 of 4 tickets) is a documented Phase 3 gap.
  @Prop() refundedAt: Date;
  @Prop() refundedBy: string;
  @Prop({ type: String, default: null }) refundMethod: string | null;
  @Prop() refundReference: string; // e.g. "Bank ref #1234", "Cash handed back to parent"
  @Prop({ type: Number, default: null }) refundAmount: number | null;

  // Phase 3 — partial refund history (see TicketRefund above) plus a
  // running total so "how much of this order has been refunded so far"
  // never requires summing partialRefunds by hand. A full-order refund via
  // cancelOrder sets this to totalAmount too, so it's always the single
  // source of truth regardless of which path issued the refund.
  @Prop({ type: [TicketRefundSchema], default: [] }) partialRefunds: TicketRefund[];
  @Prop({ default: 0 }) totalRefunded: number;

  @Prop() notes: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ schoolSlug: 1, orderNo: 1 }, { unique: true });
OrderSchema.index({ schoolSlug: 1, eventId: 1, status: 1 });
