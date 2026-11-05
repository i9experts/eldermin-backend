import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AssessmentVisibilitySettingsDocument = AssessmentVisibilitySettings & Document;

// Assessment Master Settings' parent-app visibility rules - one document per
// school. Gates what ParentPortalService sends for a student's own results
// (per-exam Report Cards and whole-Term Report Cards alike): a child's own
// marks/grade/GPA are for sharing, but a school may not want every parent
// seeing exactly where their child ranks against classmates, or the class's
// average score. Read by parent-results.projection.ts - never by anything
// staff-facing, which always sees the full picture regardless of these flags.
@Schema({ timestamps: true, collection: 'assessment_visibility_settings' })
export class AssessmentVisibilitySettings {
  @Prop({ required: true, unique: true }) schoolSlug: string;

  // Defaults chosen deliberately: a child's own GPA and subject-by-subject
  // breakdown are exactly what a parent expects from a results app and ship
  // ON; class position/rank and the class average are off by default so a
  // school doesn't unknowingly start sharing cohort-comparison data it
  // never agreed to - an admin opts in per field, not out.
  @Prop({ default: true }) shareGPA: boolean;
  @Prop({ default: true }) shareSubjectBreakdown: boolean;
  @Prop({ default: false }) shareClassPosition: boolean;
  @Prop({ default: false }) shareClassAverage: boolean;

  @Prop() updatedBy?: string;
}

export const AssessmentVisibilitySettingsSchema = SchemaFactory.createForClass(AssessmentVisibilitySettings);
