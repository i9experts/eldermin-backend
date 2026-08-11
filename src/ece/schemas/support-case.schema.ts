import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class SupportStrategy {
  @Prop({ required: true }) description: string;
  @Prop({ required: true }) startDate: Date;
  @Prop() reviewDate: Date;
  @Prop({ enum: ['planned', 'in_progress', 'completed', 'discontinued'], default: 'planned' }) status: string;
  @Prop() outcomeNotes: string;
}
export const SupportStrategySchema = SchemaFactory.createForClass(SupportStrategy);

@Schema({ _id: false })
export class SupportReview {
  @Prop({ required: true }) date: Date;
  @Prop({ required: true }) reviewedBy: string;
  @Prop({ required: true }) notes: string;
  @Prop({ enum: ['continue', 'adjust_strategy', 'close', 'refer_external'] }) recommendation: string;
}
export const SupportReviewSchema = SchemaFactory.createForClass(SupportReview);

export type ECESupportCaseDocument = ECESupportCase & Document;

// Concern -> Observation -> Strategy -> Review. Eldermin never diagnoses
// a child - "area" is a real, deliberately non-clinical taxonomy
// (Communication, Motor Development, Sensory Needs, Social Interaction,
// Attention, Emotional Regulation, Self-Care), and every status/label a
// user will ever see is worded as a pattern requiring educator review,
// never a clinical claim. Educators can record that a referral was
// discussed and note a professional's recommendation once received,
// but Eldermin itself never generates or suggests a diagnosis.
@Schema({ timestamps: true, collection: 'ece_support_cases' })
export class ECESupportCase {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop({
    required: true,
    enum: ['communication', 'motor_development', 'sensory_needs', 'social_interaction', 'attention', 'emotional_regulation', 'self_care', 'other'],
  })
  area: string;
  @Prop({ required: true }) initialConcern: string; // what was observed, in the educator's own words
  @Prop({ required: true }) raisedBy: string;
  @Prop({ required: true }) raisedDate: Date;
  // Real, linked observations (not duplicated text) - the actual
  // evidence behind this concern, same principle as everywhere else in
  // this module: no claim without evidence.
  @Prop({ type: [Types.ObjectId], ref: 'ECEObservation', default: [] }) linkedObservationIds: Types.ObjectId[];
  @Prop({ type: [SupportStrategySchema], default: [] }) strategies: SupportStrategy[];
  @Prop({ type: [SupportReviewSchema], default: [] }) reviews: SupportReview[];
  @Prop({
    enum: ['open', 'monitoring', 'external_referral_discussed', 'closed'],
    default: 'open',
  })
  status: string;
  // Free text only, filled in by a real professional's own words if a
  // family shares one after an external referral - never written or
  // inferred by Eldermin itself.
  @Prop() externalProfessionalNotes: string;
  @Prop({ default: false }) familyInformed: boolean;
  @Prop() familyInformedDate: Date;
}

export const ECESupportCaseSchema = SchemaFactory.createForClass(ECESupportCase);
ECESupportCaseSchema.index({ schoolSlug: 1, studentId: 1, status: 1 });
ECESupportCaseSchema.index({ schoolSlug: 1, status: 1 });
