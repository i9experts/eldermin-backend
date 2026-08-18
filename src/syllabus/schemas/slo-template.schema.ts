import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SyllabusUnit, SyllabusUnitSchema } from './syllabus.schema';

// ============================================================
// SLO TEMPLATE - reusable, sourced curriculum content
//
// Deliberately separate from Syllabus itself: a template is reference
// content a coordinator applies to *start* a real syllabus, not a real
// syllabus on its own - it carries no tracking, no teacher assignment,
// no academic year. Reuses SyllabusUnit/Topic/SubTopic directly so
// "apply this template" is a straightforward copy of units into a new
// syllabus document, rather than a separate parallel structure to keep
// in sync.
//
// isVerified + sourceDocument exist specifically so nothing pretending
// to be official curriculum content ever gets treated as such without
// a real, named source behind it - unverified/AI-drafted content must
// be clearly distinguishable from something extracted from an actual
// curriculum document.
// ============================================================

export type SloTemplateDocument = SloTemplate & Document;

@Schema({ timestamps: true, collection: 'slo_templates' })
export class SloTemplate {
  @Prop({ required: true }) subjectName: string;
  @Prop({ required: true }) gradeLevel: string;
  @Prop({ required: true, enum: ['cambridge', 'ib', 'national', 'national-pk', 'american', 'custom'] }) framework: string;

  @Prop({ type: [SyllabusUnitSchema], default: [] }) units: SyllabusUnit[];

  // Whether this content has been confirmed against a real, named
  // source document - never defaults to true, since that would let
  // unverified content silently masquerade as sourced.
  @Prop({ default: false }) isVerified: boolean;
  @Prop() sourceDocument: string; // e.g. "SNC Mathematics Grade 3, Ministry of Federal Education, 2020"
  @Prop() sourceNotes: string;
  @Prop() verifiedBy: string;
  @Prop() verifiedDate: Date;

  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const SloTemplateSchema = SchemaFactory.createForClass(SloTemplate);
SloTemplateSchema.index({ schoolSlug: 1, subjectName: 1, gradeLevel: 1, framework: 1 });
