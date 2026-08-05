import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HolidayDocument = Holiday & Document;

// Part of the Reminders feature — a school-configurable holiday calendar.
// Distinct from the academic calendar module (if one exists); this is
// specifically the HR-facing list of non-working days used to compute
// "upcoming" reminders and, eventually, attendance/leave day-counting.
@Schema({ timestamps: true, collection: 'hr_holidays' })
export class Holiday {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) name: string;
  @Prop({ required: true }) date: Date;
  @Prop({ default: false }) recurringAnnually: boolean; // e.g. Eid dates change yearly so this stays false for those; fixed-date holidays can be true
  @Prop() description: string;
}

export const HolidaySchema = SchemaFactory.createForClass(Holiday);
HolidaySchema.index({ schoolSlug: 1, date: 1 });
