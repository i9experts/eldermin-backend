import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class PaperSection {
  @Prop({ required: true }) title: string; // "Section A: Multiple Choice"
  @Prop() instructions: string;
  @Prop({ type: [Types.ObjectId], ref: 'Question', default: [] }) questionIds: Types.ObjectId[];
}
export const PaperSectionSchema = SchemaFactory.createForClass(PaperSection);

@Schema({ _id: false })
export class OMRBubblePosition {
  @Prop({ required: true }) label: string; // 'A' | 'B' | 'C' | 'D'
  @Prop({ required: true }) xMm: number;
  @Prop({ required: true }) yMm: number;
}
export const OMRBubblePositionSchema = SchemaFactory.createForClass(OMRBubblePosition);

@Schema({ _id: false })
export class OMRQuestionRow {
  @Prop({ required: true }) questionNumber: number;
  @Prop({ type: [OMRBubblePositionSchema], default: [] }) bubbles: OMRBubblePosition[];
}
export const OMRQuestionRowSchema = SchemaFactory.createForClass(OMRQuestionRow);

@Schema({ _id: false })
export class OMRMarker {
  @Prop({ required: true }) xMm: number;
  @Prop({ required: true }) yMm: number;
}
export const OMRMarkerSchema = SchemaFactory.createForClass(OMRMarker);

@Schema({ _id: false })
export class OMRLayout {
  @Prop({ required: true, default: 210 }) pageWidthMm: number;
  @Prop({ required: true, default: 297 }) pageHeightMm: number;
  // Four alignment markers, always in this order: top-left, top-right,
  // bottom-left, bottom-right - the detection pipeline relies on this
  // exact order to build its correction transform.
  @Prop({ type: [OMRMarkerSchema], default: [] }) markers: OMRMarker[];
  @Prop({ type: [OMRQuestionRowSchema], default: [] }) questions: OMRQuestionRow[];
  @Prop({ default: 3 }) bubbleRadiusMm: number;
}
export const OMRLayoutSchema = SchemaFactory.createForClass(OMRLayout);

export type ExamPaperDocument = ExamPaper & Document;

// A real exam paper compiled from the real Question Bank. Language
// drives the rendering direction (RTL for Urdu/Arabic, LTR for English)
// and the base font choice, with fontSize/urduFontStyle below as the
// paper-level overrides a school can actually pick at creation time -
// resolved into the real HTML/CSS at generation time in the service.
// Bilingual side-by-side papers (a real, common Pakistani-school
// pattern) are a deliberate V2 - this is a real, single-primary-language
// paper first.
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
  // Worksheets are untimed classroom handouts, not timed exams - duration
  // only applies to 'exam' papers and is left unset for 'worksheet' ones.
  @Prop() duration: number; // minutes
  @Prop() generalInstructions: string;
  // 'exam': the existing real exam/test paper (default, unchanged
  // behaviour). 'worksheet': an early-years printable worksheet, scoped
  // to a real SNC ECE standard/indicator below, rendered with its own
  // large-print, activity-style PDF template instead of the exam layout.
  @Prop({ enum: ['exam', 'worksheet'], default: 'exam' }) paperType: string;
  // Worksheet-only: the SNC ECE indicator this worksheet is built for, so
  // a teacher printing it instantly knows exactly which early-years
  // standard it covers. Denormalized (code/text) the same way as on
  // Question, to avoid an extra lookup at render time.
  @Prop({ type: Types.ObjectId, ref: 'ECEIndicator', default: null })
  eceIndicatorId: Types.ObjectId | null;
  @Prop({ type: String, default: null }) eceStandardCode: string | null;
  @Prop({ type: String, default: null }) eceStandardText: string | null;
  // Globally-standardised print layouts a school admin picks from rather
  // than a free-form design - keeps every paper leaving the school
  // structurally consistent no matter who set it up. 'standard': single
  // question column, header + QR/barcode on the question sheet itself
  // (existing default). 'compact': two-column question layout to save
  // paper on long objective papers. 'formal': adds a separate board-exam
  // style cover page (candidate/invigilator fields, seal box, signed
  // declaration) ahead of the question content.
  @Prop({ required: true, enum: ['standard', 'compact', 'formal'], default: 'standard' })
  paperFormat: string;
  // Base body text size for the generated PDF - a school printing for
  // younger grades or low-vision candidates needs this larger than the
  // long-standing 13px default; 'small'/'large' are relative to it.
  @Prop({ enum: ['small', 'medium', 'large'], default: 'medium' })
  fontSize: string;
  // Urdu-only: which Perso-Arabic rendering style to use. 'nastaliq' (the
  // calligraphic style Urdu readers traditionally expect, via the real
  // Noto Nastaliq Urdu font, embedded at generation time - see
  // assessment.service.ts) is the default; 'naskh' keeps the previous
  // Noto Sans/Naskh Arabic rendering for schools that prefer its more
  // compact, upright letterforms. Ignored for english/arabic papers.
  @Prop({ enum: ['nastaliq', 'naskh'], default: 'nastaliq' })
  urduFontStyle: string;
  @Prop({ type: [PaperSectionSchema], default: [] }) sections: PaperSection[];
  // Unique, human-readable identifier printed with the QR code - lets a
  // physical paper be traced back to this record even without scanning
  // (e.g. reading it aloud over the phone).
  @Prop({ required: true, unique: true }) paperCode: string;
  @Prop({ required: true }) createdBy: string;
  // Computed once, the first time personalized OMR sheets are generated
  // for this paper - identical for every student's copy, since only the
  // printed identity (name/roll/sheetCode) differs between copies, not
  // the bubble grid itself.
  @Prop({ type: OMRLayoutSchema, default: null }) omrLayout: OMRLayout | null;
}

export const ExamPaperSchema = SchemaFactory.createForClass(ExamPaper);
ExamPaperSchema.index({ schoolSlug: 1, subject: 1, grade: 1 });
ExamPaperSchema.index({ schoolSlug: 1, createdAt: -1 });
