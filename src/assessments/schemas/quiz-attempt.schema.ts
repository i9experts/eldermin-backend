// ============================================================
// QUIZ ATTEMPT — LMS Phase 2: a student's self-paced run through an
// Assessment subject's linked ExamPaper. Auto-graded for objective
// question types (mcq/true_false) at submit time; short/long/fill_blank/
// matching answers are held for a teacher's manual review
// (AssessmentService.gradeQuizAttempt). Once every answer has a mark,
// the attempt upserts into the SAME MarkEntry collection teacher-entered
// marks already use (see upsertMarkEntryFromAttempt) - Report Cards need
// no changes to pick up a quiz result alongside any other mark.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class QuizAnswer {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Question' }) questionId: Types.ObjectId;
  @Prop() selectedOptionIndex: number; // mcq
  @Prop() textAnswer: string; // true_false ('True'/'False'), short/long/fill_blank/matching
  @Prop({ default: false }) needsManualGrading: boolean;
  @Prop({ type: Boolean, default: null }) isCorrect: boolean | null;
  @Prop({ type: Number, default: null }) marksAwarded: number | null;
}
export const QuizAnswerSchema = SchemaFactory.createForClass(QuizAnswer);

export type QuizAttemptDocument = QuizAttempt & Document;

@Schema({ timestamps: true, collection: 'quiz_attempts' })
export class QuizAttempt {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop() rollNumber: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Assessment' }) assessmentId: Types.ObjectId;
  @Prop({ required: true }) assessmentTitle: string;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'ExamPaper' }) examPaperId: Types.ObjectId;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop({ required: true }) academicYear: string;

  @Prop({ required: true }) totalMarks: number;
  @Prop({ default: 0 }) passingMarks: number;
  @Prop({ type: [QuizAnswerSchema], default: [] }) answers: QuizAnswer[];
  @Prop({ default: 0 }) autoGradedMarks: number;
  // null until every answer has a mark (auto or manual) - a partially
  // graded attempt deliberately has no misleading obtainedMarks yet.
  @Prop({ type: Number, default: null }) obtainedMarks: number | null;

  @Prop({ enum: ['in_progress', 'submitted', 'graded'], default: 'in_progress' }) status: string;
  @Prop({ default: 1 }) attemptNumber: number;
  @Prop({ default: Date.now }) startedAt: Date;
  @Prop() submittedAt: Date;
  @Prop() gradedAt: Date;
  @Prop() gradedBy: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const QuizAttemptSchema = SchemaFactory.createForClass(QuizAttempt);
QuizAttemptSchema.index({ studentId: 1, assessmentId: 1, subject: 1, attemptNumber: 1 }, { unique: true });
QuizAttemptSchema.index({ schoolSlug: 1, assessmentId: 1, subject: 1, status: 1 });
