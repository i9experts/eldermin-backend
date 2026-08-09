import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// PERIOD TEMPLATE
// Real timetable software (FET, aSc, TimeTabler, etc.) always separates
// "what are our periods and when do they run" from "what's taught in
// each slot for this specific class" - exactly the piece missing here.
// Previously every single class timetable defined its own period times
// ad-hoc, which meant comparing "Period 3" across two different grades'
// timetables for conflict detection was only valid by coincidence, not
// by design. One shared template (or a few, e.g. Primary vs Secondary
// wings, or a separate Friday schedule) means Period 3 means the same
// real clock time everywhere it's used.
// ============================================================

@Schema({ _id: false })
export class PeriodSlot {
  @Prop({ required: true }) periodNo: number;
  @Prop({ required: true }) label: string; // "Period 1", "Assembly", "Break", "Lunch"
  @Prop({ required: true }) startTime: string; // "08:00" (24h)
  @Prop({ required: true }) endTime: string; // "08:45"
  @Prop({
    enum: ['regular', 'break', 'assembly', 'prayer', 'lunch', 'sports'],
    default: 'regular',
  })
  type: string;
}
export const PeriodSlotSchema = SchemaFactory.createForClass(PeriodSlot);

export type PeriodTemplateDocument = PeriodTemplate & Document;

@Schema({ timestamps: true, collection: 'period_templates' })
export class PeriodTemplate {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId;

  @Prop({ required: true }) name: string; // e.g. "Standard Day", "Primary Wing", "Friday Schedule"
  @Prop() wing: string; // optional scoping label (e.g. "Primary", "Secondary") - informational, not enforced
  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] }) workingDays: number[]; // 0=Sun..6=Sat
  @Prop({ type: [PeriodSlotSchema], default: [] }) periods: PeriodSlot[];
  @Prop({ default: false }) isDefault: boolean;
  @Prop({ default: true }) isActive: boolean;
}

export const PeriodTemplateSchema = SchemaFactory.createForClass(PeriodTemplate);
PeriodTemplateSchema.index({ tenantId: 1, isActive: 1 });
