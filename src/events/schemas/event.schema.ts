import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EventDocument = Event & Document;

export const EVENT_CATEGORIES = [
  'open_house', 'annual_day', 'sports_day', 'fundraiser', 'alumni_meet',
  'workshop', 'parent_teacher_conference', 'graduation', 'other',
] as const;

@Schema({ _id: false })
export class EventTheme {
  @Prop() logoUrl: string;
  @Prop() bannerUrl: string;
  @Prop({ default: '#0C447C' }) primaryColor: string;
}
export const EventThemeSchema = SchemaFactory.createForClass(EventTheme);

// One appearance of a (possibly multi-day) event - most events have exactly
// one session, but this supports e.g. a 3-day workshop with a different
// capacity/time each day without modelling three separate Events.
@Schema({ _id: true })
export class EventSession {
  @Prop({ required: true }) label: string; // "Day 1", "Morning Session"...
  @Prop({ required: true }) startAt: Date;
  @Prop({ required: true }) endAt: Date;
  @Prop() capacity: number; // null = unlimited / governed by ticket type capacities instead
}
export const EventSessionSchema = SchemaFactory.createForClass(EventSession);

export const SPONSOR_TIERS = ['title', 'gold', 'silver', 'bronze', 'partner'] as const;

@Schema({ _id: true })
export class EventSponsor {
  @Prop({ required: true }) name: string;
  @Prop() logoUrl: string;
  @Prop({ enum: SPONSOR_TIERS, default: 'partner' }) tier: string;
  @Prop() websiteUrl: string;
  @Prop({ default: 0 }) sortOrder: number;
}
export const EventSponsorSchema = SchemaFactory.createForClass(EventSponsor);

@Schema({ timestamps: true, collection: 'events' })
export class Event {
  @Prop({ required: true }) title: string;
  @Prop() description: string; // HTML, same rich-text convention as Circular.body
  @Prop({ enum: EVENT_CATEGORIES, default: 'other' }) category: string;
  @Prop({ type: String, default: null }) campusId: string | null;
  @Prop() venueName: string;
  @Prop() venueAddress: string;
  @Prop({ type: [EventSessionSchema], default: [] }) sessions: EventSession[];
  @Prop({ type: EventThemeSchema, default: {} }) theme: EventTheme;
  // Phase 3 — sponsor logos/tiers shown on the public event page and the
  // admin Overview tab. A plain array field on Event (not its own
  // collection/CRUD routes) since it's always read/written as a whole set
  // alongside the event, same as `theme` above.
  @Prop({ type: [EventSponsorSchema], default: [] }) sponsors: EventSponsor[];

  // Public page identity - unique per school, used in the public URL
  // (/e/{schoolSlug}/{slug}) rather than exposing the Mongo _id.
  @Prop({ required: true }) slug: string;

  @Prop({ enum: ['public', 'unlisted', 'private', 'internal'], default: 'public' }) visibility: string;
  @Prop({ enum: ['draft', 'published', 'cancelled', 'completed'], default: 'draft' }) status: string;

  @Prop() createdBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const EventSchema = SchemaFactory.createForClass(Event);
EventSchema.index({ schoolSlug: 1, slug: 1 }, { unique: true });
EventSchema.index({ schoolSlug: 1, status: 1, visibility: 1 });
