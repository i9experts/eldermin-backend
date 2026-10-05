import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Push token registry for staff devices. v1 of the teacher app does NOT send
// pushes (in-app notifications + polling only); tokens are stored now so FCM
// delivery can be added later without another app release.
export type StaffDeviceTokenDocument = StaffDeviceToken & Document;

@Schema({ timestamps: true, collection: 'staff_device_tokens' })
export class StaffDeviceToken {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true }) userId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) token: string;
  @Prop({ required: true, enum: ['android', 'ios'] }) platform: string;
  @Prop() deviceId: string;
  @Prop() appVersion: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop() lastSeenAt: Date;
}
export const StaffDeviceTokenSchema = SchemaFactory.createForClass(StaffDeviceToken);
StaffDeviceTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

// Staff account-deletion REQUEST. Never hard-deletes: an admin/HR user
// reviews it (they are notified on creation) because staff records carry
// payroll, attendance and safeguarding history the school must retain.
export type StaffDeletionRequestDocument = StaffDeletionRequest & Document;

@Schema({ timestamps: true, collection: 'staff_deletion_requests' })
export class StaffDeletionRequest {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null }) staffId: Types.ObjectId | null;
  @Prop({ required: true }) requestedByName: string;
  @Prop() reason: string;
  @Prop({ enum: ['pending', 'processed', 'declined'], default: 'pending' }) status: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const StaffDeletionRequestSchema = SchemaFactory.createForClass(StaffDeletionRequest);
StaffDeletionRequestSchema.index({ schoolSlug: 1, status: 1, createdAt: -1 });
