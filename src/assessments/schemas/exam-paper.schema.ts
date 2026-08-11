import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class PaperSection {
  @Prop({ required: true }) title: string; // "Section A: Multiple Choice"
  @Prop() instructions: string;
  @Prop({ type: [Types.ObjectId], ref: 'Question', default: [] }) questionIds: Types.ObjectId[];
}
export const PaperSectionSchema = SchemaFactory.createForClass(PaperSection);

export type ExamPaperDocument = ExamPaper & Document;

// A real exam paper compiled from the real Question Bank. Language
// drives both the rendering direction (RTL for Urdu/Arabic, LTR for
// English) and the fonts used - handled entirely at generation time in
// the service, not stored as a rendering choice here. Bilingual
// side-by-side papers (a real, common Pakistani-school pattern) are a
// deliberate V2 - this is a real, single-primary-language paper first.
@Schema({ timestamps: true, collection: 'exam_papers' })
export class ExamPaper {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string; // class section, e.g. "A" - optional
  @Prop({ required: true }) academicYear: string;
  @Prop() term: string;
  @Prop({ required: true, enum: ['english', 'urdu', 'arabic'] }) language: string;
  @Prop({ required: true }) duration: number; // minutes
  @Prop() generalInstructions: string;
  @Prop({ type: [PaperSectionSchema], default: [] }) sections: PaperSection[];
  // Unique, human-readable identifier printed with the QR code - lets a
  // physical paper be traced back to this record even without scanning
  // (e.g. reading it aloud over the phone).
  @Prop({ required: true, unique: true }) paperCode: string;
  @Prop({ required: true }) createdBy: string;
}

export const ExamPaperSchema = SchemaFactory.createForClass(ExamPaper);
ExamPaperSchema.index({ schoolSlug: 1, subject: 1, grade: 1 });
ExamPaperSchema.index({ schoolSlug: 1, createdAt: -1 });
