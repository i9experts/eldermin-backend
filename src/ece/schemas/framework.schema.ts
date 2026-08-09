import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ECEFrameworkDocument = ECEFramework & Document;

// A school can run more than one framework at once (e.g. different
// campuses), which is why this is a real referenced entity rather than a
// single enum field on the school record.
@Schema({ timestamps: true, collection: 'ece_frameworks' })
export class ECEFramework {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string; // "Montessori", "Custom: Sunflower Method"
  @Prop({
    required: true,
    enum: ['montessori', 'kindergarten', 'head_start', 'play_based', 'reggio', 'eccd', 'national', 'custom'],
  })
  type: string;
  // Ordered, school-editable continuum labels - never hardcoded in the
  // frontend. Default seed of 6 stages; see ece.service.ts seedDefaults().
  @Prop({ type: [String], default: ['Not Observed', 'Emerging', 'Developing', 'Consistent', 'Independent', 'Mastered'] })
  progressionLevels: string[];
  @Prop({ type: [String], default: [] }) campusIds: string[]; // optional scoping
  @Prop({ default: true }) isActive: boolean;
}

export const ECEFrameworkSchema = SchemaFactory.createForClass(ECEFramework);
ECEFrameworkSchema.index({ schoolSlug: 1, isActive: 1 });
