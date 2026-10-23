// ============================================================
// PARENT FEATURE ACCESS — one record per (schoolSlug, parentUserId,
// studentId), holding the current suspend/restore state of each
// suspendable parent-app feature plus a full audit trail per feature.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ParentFeatureKey } from '../parent-feature.constants';

export type ParentFeatureAccessDocument = ParentFeatureAccess & Document;

@Schema({ _id: false })
export class FeatureAccessEvent {
  @Prop({ required: true, enum: ['suspended', 'restored'] }) action: 'suspended' | 'restored';
  @Prop() reason: string;
  @Prop({ required: true }) byUserId: Types.ObjectId;
  @Prop({ required: true }) byName: string;
  @Prop({ required: true, default: () => new Date() }) at: Date;
}
const FeatureAccessEventSchema = SchemaFactory.createForClass(FeatureAccessEvent);

@Schema({ _id: false })
export class FeatureAccessState {
  @Prop({ required: true, default: false }) suspended: boolean;
  @Prop() reason: string;
  @Prop() suspendedAt: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) suspendedBy: Types.ObjectId;
  @Prop() restoredAt: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) restoredBy: Types.ObjectId;
  @Prop({ type: [FeatureAccessEventSchema], default: [] }) history: FeatureAccessEvent[];
}
const FeatureAccessStateSchema = SchemaFactory.createForClass(FeatureAccessState);

@Schema({ timestamps: true, collection: 'parent_feature_access' })
export class ParentFeatureAccess {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true }) parentUserId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop({ required: true, index: true }) schoolSlug: string;

  // Keyed by ParentFeatureKey - plain Object (not a Mongoose Map) so dotted
  // "$set"/"$push" paths and .lean() reads behave identically everywhere
  // else in this codebase; adding a new suspendable feature later still
  // needs no schema migration, it just starts appearing as a new key.
  @Prop({ type: Object, default: () => ({}) })
  features: Partial<Record<ParentFeatureKey, FeatureAccessState>>;
}
export const ParentFeatureAccessSchema = SchemaFactory.createForClass(ParentFeatureAccess);
ParentFeatureAccessSchema.index({ schoolSlug: 1, parentUserId: 1, studentId: 1 }, { unique: true });
