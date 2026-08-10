import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class CharacterTrait {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) nameEn: string;
  @Prop() nameLocal: string; // e.g. Arabic/Urdu rendering, optional
  @Prop() category: string;
}
export const CharacterTraitSchema = SchemaFactory.createForClass(CharacterTrait);

@Schema({ _id: false })
export class RatingScale {
  @Prop({ default: 1 }) min: number;
  @Prop({ default: 5 }) max: number;
  @Prop({ type: [String], default: [] }) labels: string[]; // optional label per star, e.g. "Needs Support".."Exceptional"
}
export const RatingScaleSchema = SchemaFactory.createForClass(RatingScale);

export type CharacterProgramSettingsDocument = CharacterProgramSettings & Document;

// One document per school. A school can rename the whole programme
// (Tarbiyah is just the default), swap in their own set of
// characteristics, and set their own star-rating scale - real,
// school-editable configuration rather than a fixed Islamic-pillars
// list with a hardcoded 1-5 scale, so a school with their own distinct
// character-building vision doesn't end up looking like a re-skin of
// the built-in Tarbiyah programme.
@Schema({ timestamps: true, collection: 'character_program_settings' })
export class CharacterProgramSettings {
  @Prop({ required: true, unique: true, index: true }) schoolSlug: string;
  @Prop({ required: true, default: 'Tarbiyah' }) moduleDisplayName: string;
  @Prop({ type: [CharacterTraitSchema], default: [] }) characteristics: CharacterTrait[];
  @Prop({ type: RatingScaleSchema, default: {} }) ratingScale: RatingScale;
}

export const CharacterProgramSettingsSchema = SchemaFactory.createForClass(CharacterProgramSettings);
