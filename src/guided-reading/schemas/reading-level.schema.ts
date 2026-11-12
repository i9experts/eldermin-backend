import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReadingLevelDocument = ReadingLevel & Document;

// A school-defined rung on its own guided-reading ladder (e.g. "Level 1",
// "Level 2A") - deliberately NOT Fountas & Pinnell/Lexile/DRA, since the
// school tags its own readers with its own numbering. `order` decides the
// ladder's sequence (and what counts as "next level up" for progression),
// independent of what `name` happens to be labelled.
@Schema({ timestamps: true, collection: 'guided_reading_levels' })
export class ReadingLevel {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop() description?: string;
  @Prop({ required: true }) order: number;
  @Prop() color?: string;
  @Prop({ default: true }) isActive: boolean;
}

export const ReadingLevelSchema = SchemaFactory.createForClass(ReadingLevel);
ReadingLevelSchema.index({ schoolSlug: 1, order: 1 });
