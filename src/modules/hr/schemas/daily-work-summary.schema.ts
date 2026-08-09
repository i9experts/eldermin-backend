import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DailyWorkSummaryDocument = DailyWorkSummary & Document;

// A lightweight accountability log, not a task/project tracker — one entry
// per staff member per day, free text plus an optional checklist of what
// they worked on. Kept intentionally simple.
@Schema({ timestamps: true, collection: 'hr_daily_work_summaries' })
export class DailyWorkSummary {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff', index: true }) staffId: Types.ObjectId;
  @Prop() staffName: string;
  @Prop() department: string;

  @Prop({ required: true }) date: Date;
  @Prop({ required: true }) summary: string;

  @Prop({
    type: [{ task: String, isDone: Boolean, _id: false }],
    default: [],
  })
  tasks: { task: string; isDone: boolean }[];

  @Prop({ enum: ['low', 'normal', 'high'], default: 'normal' }) workload: string;
  @Prop() blockers: string;

  @Prop({ default: false }) acknowledged: boolean; // manager has seen it
  @Prop() acknowledgedBy: string;
  @Prop() acknowledgedAt: Date;
}

export const DailyWorkSummarySchema = SchemaFactory.createForClass(DailyWorkSummary);
DailyWorkSummarySchema.index({ tenantId: 1, staffId: 1, date: 1 }, { unique: true });
DailyWorkSummarySchema.index({ schoolSlug: 1, date: 1 });
