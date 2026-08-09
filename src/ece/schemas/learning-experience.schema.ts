import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ExperienceDifferentiation {
  @Prop() support: string;
  @Prop() core: string;
  @Prop() extension: string;
}
export const ExperienceDifferentiationSchema = SchemaFactory.createForClass(ExperienceDifferentiation);

export type LearningExperienceDocument = LearningExperience & Document;

// Every activity a teacher runs is reusable rather than re-typed from
// scratch each time - the institutional knowledge base the PRD calls for.
// Deliberately references the same canonical Domains/Skills (§6 of the
// PRD) so an experience's "learning opportunities" are the same real
// ontology entries used everywhere else, not a separate free-text tag set.
@Schema({ timestamps: true, collection: 'ece_learning_experiences' })
export class LearningExperience {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) title: string;
  @Prop() ageRangeLabel: string; // "3-4 years" - free text in V1, can reference AgeBand in V2
  @Prop({ type: [Types.ObjectId], ref: 'ECEDomain', default: [] }) domainIds: Types.ObjectId[];
  @Prop({ type: [Types.ObjectId], ref: 'ECESkill', default: [] }) skillIds: Types.ObjectId[];
  @Prop({ type: [String], default: [] }) resources: string[]; // "Tray", "Jug", "Two containers"
  @Prop() learningIntent: string;
  @Prop({ type: [String], default: [] }) observationOpportunities: string[]; // "Grip", "Coordination"
  @Prop({ type: ExperienceDifferentiationSchema, default: {} }) differentiation: ExperienceDifferentiation;
  @Prop({ default: 0 }) timesUsed: number; // incremented each time it's added to a weekly plan
  @Prop({ default: true }) isActive: boolean;
  @Prop() createdBy: string;
}

export const LearningExperienceSchema = SchemaFactory.createForClass(LearningExperience);
LearningExperienceSchema.index({ schoolSlug: 1, isActive: 1 });
LearningExperienceSchema.index({ schoolSlug: 1, domainIds: 1 });
