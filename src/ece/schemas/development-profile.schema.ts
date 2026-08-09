import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ECEDomainSummary {
  @Prop({ required: true, type: Types.ObjectId, ref: 'ECEDomain' }) domainId: Types.ObjectId;
  @Prop({ required: true }) currentLevel: string; // most recent progression level with evidence
  @Prop({ default: 0 }) evidenceCount: number;
  @Prop() lastObservedAt: Date;
}
export const ECEDomainSummarySchema = SchemaFactory.createForClass(ECEDomainSummary);

export type ECEDevelopmentProfileDocument = ECEDevelopmentProfile & Document;

// A cached rollup, NOT a live aggregation query - a teacher or parent
// opening a child's profile should never trigger a full scan across
// every observation ever recorded. Recomputed incrementally each time a
// new observation is saved (see ece.service.ts recomputeProfile()).
@Schema({ timestamps: true, collection: 'ece_development_profiles' })
export class ECEDevelopmentProfile {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) academicYearLabel: string;
  @Prop({ type: [ECEDomainSummarySchema], default: [] }) domainSummaries: ECEDomainSummary[];
  @Prop({ type: [String], default: [] }) interests: string[]; // free-taggable: "Animals", "Construction"
  @Prop({ type: [String], default: [] }) schemas: string[]; // free-taggable: "Transporting", "Rotation"
}

export const ECEDevelopmentProfileSchema = SchemaFactory.createForClass(ECEDevelopmentProfile);
ECEDevelopmentProfileSchema.index({ schoolSlug: 1, studentId: 1, academicYearLabel: 1 }, { unique: true });
