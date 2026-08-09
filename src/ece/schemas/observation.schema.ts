import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ECESkillMapping {
  @Prop({ required: true, type: Types.ObjectId, ref: 'ECESkill' }) skillId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'ECEIndicator' }) indicatorId: Types.ObjectId;
  @Prop({ required: true }) progressionLevel: string; // one of framework.progressionLevels
}
export const ECESkillMappingSchema = SchemaFactory.createForClass(ECESkillMapping);

@Schema({ _id: false })
export class ECEEvidenceItem {
  @Prop({ required: true, enum: ['photo', 'video', 'voice_note', 'work_sample', 'document'] }) type: string;
  @Prop({ required: true }) url: string; // via the existing UploadService/S3 pipeline
  @Prop() caption: string;
}
export const ECEEvidenceItemSchema = SchemaFactory.createForClass(ECEEvidenceItem);

export type ECEObservationDocument = ECEObservation & Document;

// The single most-used entity in the whole module. skillMappings and
// evidence are embedded (not referenced) - always accessed together with
// the observation, bounded in size (a single observation realistically
// maps to a handful of skills and carries a handful of attachments),
// never queried independently. Same reasoning already applied to
// Syllabus.units[].topics[] elsewhere in this platform.
@Schema({ timestamps: true, collection: 'ece_observations' })
export class ECEObservation {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop({ required: true }) observedBy: string; // denormalized teacher name for fast display
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) observedById: Types.ObjectId;
  @Prop({
    required: true,
    enum: ['spontaneous', 'planned', 'montessori_presentation', 'learning_story'],
    default: 'spontaneous',
  })
  observationType: string;
  @Prop() context: string; // "Outdoor play", "Work cycle" - free text
  @Prop({ required: true }) narrative: string;
  @Prop({ type: [ECESkillMappingSchema], default: [] }) skillMappings: ECESkillMapping[];
  @Prop() nextStep: string;
  @Prop({ type: [ECEEvidenceItemSchema], default: [] }) evidence: ECEEvidenceItem[];
  @Prop({ default: false }) isSharedWithFamily: boolean;
  @Prop({ required: true }) academicYearLabel: string; // real current year, never hardcoded
}

export const ECEObservationSchema = SchemaFactory.createForClass(ECEObservation);
ECEObservationSchema.index({ schoolSlug: 1, studentId: 1, createdAt: -1 });
ECEObservationSchema.index({ schoolSlug: 1, 'skillMappings.skillId': 1 });
ECEObservationSchema.index({ schoolSlug: 1, observedById: 1, createdAt: -1 }); // coverage reporting
