import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BiometricConfigDocument = BiometricConfig & Document;

@Schema({ timestamps: true, collection: 'biometricConfig' })
export class BiometricConfig {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  deviceIp: string;

  @Prop({ default: 4370 })
  devicePort: number;

  @Prop({ enum: ['zkteco', 'other'], default: 'zkteco' })
  deviceType: string;

  @Prop({ default: false })
  autoSyncEnabled: boolean;

  @Prop({ default: 30 })
  autoSyncIntervalMins: number;

  @Prop({ default: false })
  isConnected: boolean;

  @Prop()
  lastSyncAt: Date;

  @Prop({ default: 0 })
  lastSyncCount: number;

  @Prop()
  lastSyncError: string;
}

export const BiometricConfigSchema = SchemaFactory.createForClass(BiometricConfig);
BiometricConfigSchema.index({ tenantId: 1 }, { unique: true });
