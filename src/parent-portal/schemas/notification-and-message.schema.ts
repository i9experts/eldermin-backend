import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// NOTIFICATIONS — real, persisted, per-recipient records (not push
// delivery - that still needs FCM/APNs credentials you don't have yet,
// same honest-stub story as SMS/WhatsApp). This backs both the
// "Notifications" screen (recent, with read state) and "Inbox" (the
// full list) from the same underlying data - two views, one source of
// truth, not two separate fake systems.
// ============================================================

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) recipientUserId: Types.ObjectId;
  @Prop({
    enum: ['circular', 'consent', 'leave_decision', 'fee_due', 'homework', 'result', 'behaviour', 'message', 'other'],
    default: 'other',
  })
  type: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) body: string;
  @Prop() relatedEntityId: string; // free-form id of whatever this is about (invoice, consent request, etc.) - app resolves the deep link client-side
  @Prop({ default: false }) isRead: boolean;
  @Prop() readAt: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ schoolSlug: 1, recipientUserId: 1, createdAt: -1 });
NotificationSchema.index({ schoolSlug: 1, recipientUserId: 1, isRead: 1 });

// ============================================================
// MESSAGES — a real two-way thread between a guardian and a specific
// staff member about a specific student, not a one-shot contact form.
// ============================================================

export type MessageThreadDocument = MessageThread & Document;

@Schema({ timestamps: true, collection: 'message_threads' })
export class MessageThread {
  @Prop({ required: true }) subject: string;
  @Prop({ type: Types.ObjectId, ref: 'Student', default: null }) studentId: Types.ObjectId | null;
  @Prop() studentName: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) guardianUserId: Types.ObjectId;
  @Prop({ required: true }) guardianName: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop({ required: true }) staffName: string;

  @Prop() lastMessagePreview: string;
  @Prop() lastMessageAt: Date;
  @Prop({ default: false }) guardianHasUnread: boolean;
  @Prop({ default: false }) staffHasUnread: boolean;

  @Prop({ enum: ['open', 'closed'], default: 'open' }) status: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const MessageThreadSchema = SchemaFactory.createForClass(MessageThread);
MessageThreadSchema.index({ schoolSlug: 1, guardianUserId: 1, lastMessageAt: -1 });
MessageThreadSchema.index({ schoolSlug: 1, staffId: 1, lastMessageAt: -1 });

export type MessageDocument = Message & Document;

@Schema({ timestamps: true, collection: 'messages' })
export class Message {
  @Prop({ required: true, type: Types.ObjectId, ref: 'MessageThread' }) threadId: Types.ObjectId;
  @Prop({ required: true, enum: ['guardian', 'staff'] }) senderRole: string;
  @Prop({ required: true }) senderName: string;
  @Prop({ required: true }) body: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ schoolSlug: 1, threadId: 1, createdAt: 1 });
