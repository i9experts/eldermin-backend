import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// ECE ONTOLOGY: Domain -> Skill -> Indicator, plus Age Bands.
// Every one of these is a real, seeded, school-editable collection -
// never a hardcoded array in frontend code. This is a deliberate,
// direct correction of a real bug pattern (grade/subject dropdowns
// disconnected from real school data) found and fixed elsewhere in
// this platform this year - repeating it here would be worse, because
// the ontology IS the product.
// ============================================================

export type ECEDomainDocument = ECEDomain & Document;

@Schema({ timestamps: true, collection: 'ece_domains' })
export class ECEDomain {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string; // "Physical Development" - school can rename
  // Stable key, never shown to users - used for framework-independent
  // reporting later (cross-framework benchmarking, V4) even after a
  // school renames the display label.
  @Prop({ required: true }) canonicalKey: string;
  @Prop({ default: 0 }) order: number;
  @Prop({ default: true }) isActive: boolean;
}
export const ECEDomainSchema = SchemaFactory.createForClass(ECEDomain);
ECEDomainSchema.index({ schoolSlug: 1, isActive: 1, order: 1 });

export type ECESkillDocument = ECESkill & Document;

@Schema({ timestamps: true, collection: 'ece_skills' })
export class ECESkill {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ECEDomain' }) domainId: Types.ObjectId;
  // Kept as a simple string in V1 rather than a fourth collection level -
  // promote to its own collection if schools need sub-domain-level
  // reporting in V2.
  @Prop() subDomainName: string; // e.g. "Fine Motor"
  @Prop({ required: true }) name: string; // "Pencil Control"
  @Prop({ required: true }) canonicalKey: string;
  @Prop({ type: [Types.ObjectId], ref: 'ECEAgeBand', default: [] }) ageBandIds: Types.ObjectId[];
  @Prop({ default: true }) isActive: boolean;
}
export const ECESkillSchema = SchemaFactory.createForClass(ECESkill);
ECESkillSchema.index({ schoolSlug: 1, domainId: 1, isActive: 1 });

export type ECEIndicatorDocument = ECEIndicator & Document;

@Schema({ timestamps: true, collection: 'ece_indicators' })
export class ECEIndicator {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ECESkill' }) skillId: Types.ObjectId;
  @Prop({ required: true }) text: string; // "Uses scissors safely to cut along a straight line"
  @Prop({ type: Types.ObjectId, ref: 'ECEAgeBand' }) ageBandId: Types.ObjectId;
  @Prop({ default: true }) isActive: boolean;
}
export const ECEIndicatorSchema = SchemaFactory.createForClass(ECEIndicator);
ECEIndicatorSchema.index({ schoolSlug: 1, skillId: 1, isActive: 1 });

export type ECEAgeBandDocument = ECEAgeBand & Document;

@Schema({ timestamps: true, collection: 'ece_age_bands' })
export class ECEAgeBand {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) label: string; // "3-4 years"
  @Prop({ required: true }) minMonths: number;
  @Prop({ required: true }) maxMonths: number;
  @Prop({ default: 0 }) order: number;
}
export const ECEAgeBandSchema = SchemaFactory.createForClass(ECEAgeBand);
ECEAgeBandSchema.index({ schoolSlug: 1, order: 1 });
