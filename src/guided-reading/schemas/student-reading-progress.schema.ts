import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentReadingProgressDocument = StudentReadingProgress & Document;

// One row per (student, reader) the student has finished - the record the
// student-facing player (Phase 3) will insert into, and gamification
// (Phase 4) will read for idempotent point-awarding dedup, same pattern as
// PointsTransaction's own sourceType/sourceId uniqueness.
@Schema({ _id: false })
export class CompletedReader {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Reader' }) readerId: Types.ObjectId;
  @Prop({ required: true }) completedAt: Date;
  @Prop({ type: [String], default: [] }) keywordsLookedUp: string[];
  @Prop({ default: 0 }) pointsAwarded: number;
}
export const CompletedReaderSchema = SchemaFactory.createForClass(CompletedReader);

// Per-student guided-reading state: which level they're on (staff-assigned,
// since the school's levels are custom and not auto-derived from a
// standard test score) and which readers they've finished.
@Schema({ timestamps: true, collection: 'student_reading_progress' })
export class StudentReadingProgress {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true })
  studentId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ type: Types.ObjectId, ref: 'ReadingLevel' }) currentLevelId?: Types.ObjectId;
  @Prop() assignedBy?: string;
  @Prop() assignedAt?: Date;

  @Prop({ type: [CompletedReaderSchema], default: [] }) completedReaders: CompletedReader[];
}

export const StudentReadingProgressSchema = SchemaFactory.createForClass(StudentReadingProgress);
StudentReadingProgressSchema.index({ schoolSlug: 1, studentId: 1 }, { unique: true });
