import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class DetectedAnswer {
  @Prop({ required: true }) questionNumber: number;
  @Prop() detectedOption: string; // 'A' | 'B' | 'C' | 'D' | null (blank/ambiguous)
  @Prop({ required: true }) confidence: number; // 0-1, how confident the detection is
  @Prop({ default: false }) isAmbiguous: boolean; // multiple bubbles filled above threshold
}
export const DetectedAnswerSchema = SchemaFactory.createForClass(DetectedAnswer);

@Schema({ _id: false })
export class ConfirmedAnswer {
  @Prop({ required: true }) questionNumber: number;
  @Prop() confirmedOption: string;
}
export const ConfirmedAnswerSchema = SchemaFactory.createForClass(ConfirmedAnswer);

export type OMRAnswerSheetDocument = OMRAnswerSheet & Document;

// One record per student per paper. The bubble coordinate map itself
// lives on ExamPaper.omrLayout (identical for every student on the same
// paper - only the printed identity differs), not duplicated here.
//
// status progression: pending_capture -> uploaded -> processed (auto-
// detected) -> needs_review (any ambiguous/low-confidence answer exists)
// -> confirmed (a teacher has reviewed and approved every answer).
// Scores are only ever computed from confirmed answers - never from raw
// detection output, since OMR detection is never assumed reliable enough
// to skip human confirmation.
@Schema({ timestamps: true, collection: 'omr_answer_sheets' })
export class OMRAnswerSheet {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ExamPaper', index: true }) examPaperId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true, unique: true }) sheetCode: string; // printed on this specific student's copy
  @Prop() uploadedImageUrl: string;
  @Prop({
    required: true,
    enum: ['pending_capture', 'uploaded', 'processed', 'needs_review', 'confirmed'],
    default: 'pending_capture',
  })
  status: string;
  @Prop({ type: [DetectedAnswerSchema], default: [] }) detectedAnswers: DetectedAnswer[];
  @Prop({ type: [ConfirmedAnswerSchema], default: [] }) confirmedAnswers: ConfirmedAnswer[];
  @Prop() score: number;
  @Prop() totalMarks: number;
  @Prop() processedAt: Date;
  @Prop() confirmedBy: string;
  @Prop() confirmedAt: Date;
  // Real, honest diagnostic for whatever went wrong during detection -
  // e.g. "could not locate all 4 alignment markers" - surfaced to the
  // reviewing teacher rather than silently producing a blank result.
  @Prop() processingError: string;
}

export const OMRAnswerSheetSchema = SchemaFactory.createForClass(OMRAnswerSheet);
OMRAnswerSheetSchema.index({ schoolSlug: 1, examPaperId: 1, studentId: 1 }, { unique: true });
OMRAnswerSheetSchema.index({ schoolSlug: 1, status: 1 });
