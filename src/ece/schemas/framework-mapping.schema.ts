import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ECEFrameworkMappingDocument = ECEFrameworkMapping & Document;

// The join layer that makes the canonical-ontology architecture work: a
// single canonical Skill can be labeled and grouped differently by each
// framework a school runs, without ever duplicating the Skill itself.
// This is what makes cross-framework, cross-campus reporting possible
// later (V4) without a rewrite - see PRD section 6.2.
@Schema({ timestamps: true, collection: 'ece_framework_mappings' })
export class ECEFrameworkMapping {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ECEFramework' }) frameworkId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ECESkill' }) skillId: Types.ObjectId;
  @Prop({ required: true }) displayDomainName: string;
  @Prop({ required: true }) displaySkillName: string;
}

export const ECEFrameworkMappingSchema = SchemaFactory.createForClass(ECEFrameworkMapping);
ECEFrameworkMappingSchema.index({ schoolSlug: 1, frameworkId: 1, skillId: 1 }, { unique: true });
