import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// PARENT DEVICE — a real "this parent has the app installed and open"
// signal, one document per (user, device). The app generates a random
// id on first launch and persists it locally (no Firebase/push
// dependency, no native config, nothing to request from the school or
// Google/Apple) and pings it on every login and app open. This is the
// closest honest proxy we have to a "download" without integrating the
// Play Store/App Store Developer APIs - a device can't un-exist just
// because a parent's `lastLoginAt` didn't update that day.
// ============================================================

export type ParentDeviceDocument = ParentDevice & Document;

@Schema({ timestamps: true, collection: 'parent_devices' })
export class ParentDevice {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  deviceId: string;

  @Prop({ enum: ['android', 'ios'], required: true })
  platform: string;

  @Prop()
  appVersion: string;

  @Prop({ default: Date.now })
  firstSeenAt: Date;

  @Prop({ default: Date.now })
  lastSeenAt: Date;
}

export const ParentDeviceSchema = SchemaFactory.createForClass(ParentDevice);
ParentDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
ParentDeviceSchema.index({ tenantId: 1, lastSeenAt: -1 });
