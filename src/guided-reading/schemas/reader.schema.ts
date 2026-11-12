import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReaderDocument = Reader & Document;

// A single tappable vocabulary word tagged to this reader - the content
// team enters word/meaning/example by hand per book (no external
// dictionary API), per the school's own choice.
@Schema({ _id: false })
export class ReaderKeyword {
  @Prop({ required: true }) word: string;
  @Prop({ required: true }) meaning: string;
  @Prop() example?: string;
  @Prop() pageNumber?: number;
}
export const ReaderKeywordSchema = SchemaFactory.createForClass(ReaderKeyword);

// One page of the reader's text, shown alongside the narrated audio so a
// student can follow along while listening.
@Schema({ _id: false })
export class ReaderPage {
  @Prop({ required: true }) pageNumber: number;
  @Prop({ required: true }) text: string;
  @Prop() imageUrl?: string;
}
export const ReaderPageSchema = SchemaFactory.createForClass(ReaderPage);

@Schema({ timestamps: true, collection: 'guided_readers' })
export class Reader {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ReadingLevel', index: true })
  levelId: Types.ObjectId;

  @Prop({ required: true }) title: string;
  @Prop() author?: string;
  @Prop() synopsis?: string;

  @Prop() coverImageUrl?: string;
  @Prop() coverImageKey?: string;

  // Human-narrated audio, uploaded per book (no TTS) - the "listen" half of
  // listen/read/tap-keywords.
  @Prop() audioUrl?: string;
  @Prop() audioKey?: string;

  @Prop({ type: [ReaderPageSchema], default: [] }) pages: ReaderPage[];
  @Prop({ type: [ReaderKeywordSchema], default: [] }) keywords: ReaderKeyword[];

  @Prop() estimatedMinutes?: number;
  @Prop({ default: true }) isActive: boolean;
}

export const ReaderSchema = SchemaFactory.createForClass(Reader);
ReaderSchema.index({ schoolSlug: 1, levelId: 1 });
