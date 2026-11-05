import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CURRICULUM_FRAMEWORKS } from '../../common/constants/curriculum-framework';

export type AssessmentGradingScaleDocument = AssessmentGradingScale & Document;

// One band of a grading scale, e.g. { minPercent: 90, maxPercent: 100, label: 'A+', gpaPoint: 4.0, isPassing: true }.
// `label` is free text so a scale can use letters (A+/A/B), IB-style numbers ('7', '6'), or a board's own wording
// ('Distinction', 'Credit') - never assumed to be a single uppercase letter anywhere downstream.
@Schema({ _id: false })
export class GradingBand {
  @Prop({ required: true }) minPercent: number;
  @Prop({ required: true }) maxPercent: number;
  @Prop({ required: true }) label: string;
  @Prop() gpaPoint?: number;
  @Prop({ default: true }) isPassing: boolean;
}
export const GradingBandSchema = SchemaFactory.createForClass(GradingBand);

// The Assessment Master Settings' per-school, per-curriculum-framework grading
// scale (Institution Overview → Assessments → Settings). One scale per
// (schoolSlug, framework): a Cambridge-framework subject's assessments use the
// school's 'cambridge' scale, an SNC/Matric one uses 'national-pk', etc. - see
// CURRICULUM_FRAMEWORKS, the same enum Curriculum Intelligence already uses,
// so a scale always lines up with a real framework a subject can be tagged
// with, never a value only this collection would recognise.
//
// Deliberately its own tiny collection, same convention as
// ClassAttendanceSettings/AttendanceSettings - and deliberately NOT named
// anything already used for a @Schema class elsewhere (see
// schema-model-names.spec.ts: two schema classes sharing a name silently
// collide on the second's Mongoose model).
@Schema({ timestamps: true, collection: 'assessment_grading_scales' })
export class AssessmentGradingScale {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, enum: CURRICULUM_FRAMEWORKS }) framework: string;
  @Prop({ required: true }) name: string;

  // Which built-in preset this scale was started from, if any ('ib' |
  // 'cambridge' | 'aku-eb' | 'provincial' | 'custom') - shown back to the
  // admin as a badge ("Based on: Cambridge") so they can tell a lightly
  // edited preset apart from a from-scratch custom scale. Purely
  // informational; grading itself only ever reads `bands`.
  @Prop() presetKey?: string;

  @Prop({ type: [GradingBandSchema], required: true }) bands: GradingBand[];

  @Prop() updatedBy?: string;
}

export const AssessmentGradingScaleSchema = SchemaFactory.createForClass(AssessmentGradingScale);
AssessmentGradingScaleSchema.index({ schoolSlug: 1, framework: 1 }, { unique: true });
