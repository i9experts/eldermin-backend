import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class PlannedExperience {
  @Prop({ required: true }) day: number; // 0=Sun..6=Sat
  @Prop({ required: true, type: Types.ObjectId, ref: 'LearningExperience' }) experienceId: Types.ObjectId;
  @Prop() notes: string;
}
export const PlannedExperienceSchema = SchemaFactory.createForClass(PlannedExperience);

export type ECEWeeklyPlanDocument = ECEWeeklyPlan & Document;

// Scoped to one classroom (grade+section) and one week - picks real
// Learning Experiences from the library (§ExperienceLibraryTab) into an
// actual schedule, rather than a free-text lesson plan disconnected from
// the reusable-activity system this whole feature is built to encourage.
@Schema({ timestamps: true, collection: 'ece_weekly_plans' })
export class ECEWeeklyPlan {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) weekStartDate: Date;
  @Prop({ required: true }) gradeLevel: string;
  @Prop() sectionName: string;
  @Prop({ type: [PlannedExperienceSchema], default: [] }) plannedExperiences: PlannedExperience[];
  @Prop() createdBy: string;
}

export const ECEWeeklyPlanSchema = SchemaFactory.createForClass(ECEWeeklyPlan);
ECEWeeklyPlanSchema.index({ schoolSlug: 1, gradeLevel: 1, sectionName: 1, weekStartDate: 1 }, { unique: true });
