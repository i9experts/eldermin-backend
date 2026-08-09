import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExitSettingsDocument = ExitSettings & Document;

// The configuration layer over the (already fully-built) Exit workflow —
// default notice periods, a reusable clearance-checklist template, and a
// standard set of exit-interview questions, so each new exit record
// doesn't start from a blank slate.
@Schema({ timestamps: true, collection: 'hr_exit_settings' })
export class ExitSettings {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true, unique: true }) schoolSlug: string;

  // Default notice period (in days) by employment type, e.g. { permanent: 30, contract: 15, probation: 7 }
  @Prop({ type: Object, default: {} }) noticePeriodDaysByEmploymentType: Record<string, number>;
  @Prop({ default: 30 }) defaultNoticePeriodDays: number; // fallback when employment type has no override

  @Prop({
    type: [{ department: String, item: String, _id: false }],
    default: [],
  })
  clearanceChecklistTemplate: { department: string; item: string }[];

  @Prop({ type: [String], default: [] }) exitInterviewQuestions: string[];
}

export const ExitSettingsSchema = SchemaFactory.createForClass(ExitSettings);
