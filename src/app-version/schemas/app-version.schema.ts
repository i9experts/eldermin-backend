import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppVersionDocument = AppVersion & Document;

export const APP_VERSION_APPS = ['parent', 'teacher'] as const;
export const APP_VERSION_PLATFORMS = ['android', 'ios'] as const;
export type AppVersionApp = (typeof APP_VERSION_APPS)[number];
export type AppVersionPlatform = (typeof APP_VERSION_PLATFORMS)[number];

// GLOBAL platform data: one row per (app, platform). Deliberately has no
// tenantId / institutionId / campusId - the mobile apps read it before login,
// with no school context at all.
@Schema({ timestamps: true, collection: 'app_versions' })
export class AppVersion {
  @Prop({ type: String, required: true, enum: APP_VERSION_APPS }) app: AppVersionApp;
  @Prop({ type: String, required: true, enum: APP_VERSION_PLATFORMS }) platform: AppVersionPlatform;
  @Prop({ type: String, required: true }) latestVersion: string;
  @Prop({ type: String, required: true, default: '0.0.0' }) minVersion: string;
  @Prop({ type: String, required: true }) storeUrl: string;
  @Prop({ type: String, default: null }) updateMessage?: string | null;
}

export const AppVersionSchema = SchemaFactory.createForClass(AppVersion);
AppVersionSchema.index({ app: 1, platform: 1 }, { unique: true });
