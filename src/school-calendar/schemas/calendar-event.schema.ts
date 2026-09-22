import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CalendarEventDocument = CalendarEvent & Document;

// Manually created calendar entries only. Fee-due-date entries are NOT
// stored here - SchoolCalendarService.getEvents merges these with
// FeeInvoice.dueDate at read time (tagged source: 'finance') so the
// calendar can never go stale relative to the real fee records. Exam/
// term dates from Academics are a documented Phase 2 gap, not wired yet.
export const CALENDAR_EVENT_TYPES = [
  'holiday', 'exam', 'event', 'admission_deadline', 'training', 'half_day', 'public_holiday', 'other',
] as const;

export const CALENDAR_EVENT_COLORS: Record<string, string> = {
  holiday: '#E24B4A',
  exam: '#7F77DD',
  event: '#1D9E75',
  fee_due: '#EF9F27',
  admission_deadline: '#378ADD',
  training: '#BA7517',
  half_day: '#888888',
  public_holiday: '#D85A30',
  other: '#0C447C',
};

@Schema({ timestamps: true, collection: 'calendar_events' })
export class CalendarEvent {
  @Prop({ required: true }) title: string;
  @Prop() description: string;
  @Prop({ enum: CALENDAR_EVENT_TYPES, required: true }) type: string;
  // Overrides the type's default color (CALENDAR_EVENT_COLORS) when set.
  @Prop() color: string;
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date; // same as startDate for single-day entries
  @Prop({ default: true }) allDay: boolean;
  // null = applies to every campus
  @Prop({ default: null }) campusId: string | null;
  // empty = applies to every grade
  @Prop({ type: [String], default: [] }) gradeLevels: string[];
  @Prop() academicYear: string;
  @Prop() createdBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const CalendarEventSchema = SchemaFactory.createForClass(CalendarEvent);
CalendarEventSchema.index({ schoolSlug: 1, startDate: 1 });
CalendarEventSchema.index({ schoolSlug: 1, type: 1 });
