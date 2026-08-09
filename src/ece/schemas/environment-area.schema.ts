import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ECEEnvironmentAreaDocument = ECEEnvironmentArea & Document;

// ECE educators don't only plan lessons - they plan environments. This is
// a real, seeded/editable registry (same principle as every other
// ontology piece in this module) rather than a fixed list of area names,
// since schools genuinely differ here (a Montessori room's areas look
// nothing like a play-based nursery's).
@Schema({ timestamps: true, collection: 'ece_environment_areas' })
export class ECEEnvironmentArea {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string; // "Practical Life Area", "Sensorial Area"
  @Prop() gradeLevel: string; // optional - blank means shared/campus-wide
  @Prop() sectionName: string;
  @Prop({ type: [String], default: [] }) resources: string[];
  @Prop() currentProvocation: string; // the current invitation/provocation on offer
  @Prop({ type: [Types.ObjectId], ref: 'ECEDomain', default: [] }) targetDomainIds: Types.ObjectId[];
  @Prop() rotationDate: Date; // when resources were last refreshed
  @Prop() lastSafetyCheckDate: Date;
  @Prop() lastSafetyCheckBy: string;
  @Prop({ type: [String], default: [] }) teacherObservations: string[]; // free-text notes over time
  @Prop({ default: true }) isActive: boolean;
}

export const ECEEnvironmentAreaSchema = SchemaFactory.createForClass(ECEEnvironmentArea);
ECEEnvironmentAreaSchema.index({ schoolSlug: 1, isActive: 1 });
