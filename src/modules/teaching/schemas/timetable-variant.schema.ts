import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type TimetableVariantDocument = TimetableVariant & Document;

// One whole-school schedule proposal produced by TimetableSolverService in
// a single generation run - covers every participating class at once, so
// it can be scored and compared against sibling variants from the same run
// before anything is written to the real per-class Timetable documents.
// Only on Publish do a variant's embedded class schedules get copied into
// (or replace) the corresponding Timetable docs the rest of the app reads.
@Schema({ _id: false })
class VariantClassSchedule {
  @Prop({ type: Types.ObjectId, ref: 'Timetable', default: null }) timetableId: Types.ObjectId | null;
  @Prop() gradeLevel: string;
  @Prop() sectionName: string;
  @Prop({ type: Types.ObjectId, ref: 'Section', default: null }) sectionId: Types.ObjectId | null;
  @Prop({ type: [Object], default: [] }) periods: any[];
}
const VariantClassScheduleSchema = SchemaFactory.createForClass(VariantClassSchedule);

@Schema({ _id: false })
class VariantScore {
  // Count of lesson units the solver could not place at all within the
  // given constraints - the only figure that matters for validity; a
  // variant with unplaced > 0 should not be published without review.
  @Prop({ default: 0 }) unplaced: number;
  @Prop({ default: 0 }) freeDayViolations: number;
  @Prop({ default: 0 }) consecutiveViolations: number;
  @Prop({ default: 0 }) totalGaps: number;
  @Prop({ default: 0 }) totalPenalty: number; // weighted sum used to rank variants against each other
}
const VariantScoreSchema = SchemaFactory.createForClass(VariantScore);

@Schema({ timestamps: true, collection: 'timetable_variants' })
export class TimetableVariant {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'AcademicYear', default: null }) academicYearId: Types.ObjectId;

  // Variants sharing a runId were generated together in the same batch and
  // are meant to be compared against each other; publishing one discards
  // the rest of its run (per class overlap) rather than leaving stale
  // drafts around indefinitely.
  @Prop({ required: true }) runId: string;
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['draft', 'published', 'discarded'], default: 'draft' }) status: string;

  @Prop({ type: [VariantClassScheduleSchema], default: [] }) classes: VariantClassSchedule[];
  @Prop({ type: VariantScoreSchema, default: () => ({}) }) score: VariantScore;

  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) publishedBy: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) publishedAt: Date | null;
}

export const TimetableVariantSchema = SchemaFactory.createForClass(TimetableVariant);
TimetableVariantSchema.index({ tenantId: 1, runId: 1 });
TimetableVariantSchema.index({ tenantId: 1, status: 1 });
