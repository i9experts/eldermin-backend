import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CircularDocument = Circular & Document;

export const CIRCULAR_CATEGORIES = [
  'academic', 'administrative', 'fee', 'emergency', 'sports', 'cultural', 'other',
] as const;

// Who a circular reaches. 'individual' uses userIds directly; every other
// scope resolves via Student/Staff (see SchoolCalendarService.resolveAudience) -
// roles picks which account types within that scope get notified (a
// circular can target parents only, staff only, or both).
@Schema({ _id: false })
export class CircularAudience {
  @Prop({ type: [String], default: [] }) roles: string[]; // subset of 'parent' | 'staff' | 'student'
  @Prop({ enum: ['school', 'campus', 'grade', 'individual'], default: 'school' }) scope: string;
  @Prop({ default: null }) campusId: string | null;
  @Prop({ type: [String], default: [] }) gradeLevels: string[];
  @Prop({ type: [String], default: [] }) userIds: string[];
}
export const CircularAudienceSchema = SchemaFactory.createForClass(CircularAudience);

@Schema({ timestamps: true, collection: 'circulars' })
export class Circular {
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) body: string; // HTML
  @Prop({ type: [String], default: [] }) attachmentUrls: string[];
  @Prop({ enum: CIRCULAR_CATEGORIES, default: 'other' }) category: string;
  @Prop({ enum: ['normal', 'urgent'], default: 'normal' }) priority: string;
  @Prop({ type: CircularAudienceSchema, required: true }) audience: CircularAudience;
  @Prop({ default: false }) requiresAcknowledgment: boolean;
  @Prop({ enum: ['draft', 'scheduled', 'published'], default: 'draft' }) status: string;
  @Prop() publishAt: Date; // set only for status:'scheduled'
  @Prop() publishedAt: Date;
  // Denormalized at publish time - how many Notification rows were fanned
  // out, so the admin list doesn't need a live count query per row.
  @Prop({ default: 0 }) recipientCount: number;
  @Prop() createdBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const CircularSchema = SchemaFactory.createForClass(Circular);
CircularSchema.index({ schoolSlug: 1, status: 1, createdAt: -1 });
CircularSchema.index({ schoolSlug: 1, status: 1, publishAt: 1 });
