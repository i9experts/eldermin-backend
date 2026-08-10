import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MontessoriMaterialDocument = MontessoriMaterial & Document;

// A specialized layer on top of the canonical ontology (PRD §6.5) rather
// than a separate curriculum system - linkedSkillIds ties a material's
// Direct Aim back to real canonical Skills, so Montessori work still
// feeds the same Development Profile every other observation does.
// Real, seeded/editable registry, same principle as everything else in
// this module.
@Schema({ timestamps: true, collection: 'ece_montessori_materials' })
export class MontessoriMaterial {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string; // "Pink Tower"
  @Prop({
    required: true,
    enum: ['practical_life', 'sensorial', 'language', 'mathematics', 'culture'],
  })
  area: string;
  @Prop() ageRangeLabel: string; // "2.5-4"
  @Prop() prerequisites: string;
  @Prop() directAim: string;
  @Prop() indirectAim: string;
  @Prop({ type: [String], default: [] }) presentationSteps: string[];
  @Prop() controlOfError: string;
  @Prop({ type: [String], default: [] }) pointsOfInterest: string[];
  @Prop({ type: [String], default: [] }) vocabulary: string[];
  @Prop({ type: [String], default: [] }) extensions: string[];
  @Prop({ type: [Types.ObjectId], ref: 'ECESkill', default: [] }) linkedSkillIds: Types.ObjectId[];
  @Prop({ default: true }) isActive: boolean;
}

export const MontessoriMaterialSchema = SchemaFactory.createForClass(MontessoriMaterial);
MontessoriMaterialSchema.index({ schoolSlug: 1, area: 1, isActive: 1 });
