import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// LESSON PROGRESS — per-student completion state for one LMS lesson
// (a SyllabusLesson, addressed by the same unitNo/topicNo/lessonNo
// composite key the Syllabus schema itself uses). This is the one piece
// of real per-student state an LMS needs that nothing else in Eldermin
// already tracks - Syllabus.topics[].isCovered is the TEACHER's own
// coverage mark, not what any individual student has actually gone
// through.
// ============================================================
export type LessonProgressDocument = LessonProgress & Document;

@Schema({ timestamps: true, collection: 'lesson_progress' })
export class LessonProgress {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Syllabus' }) syllabusId: Types.ObjectId;
  @Prop({ required: true }) unitNo: number;
  @Prop({ required: true }) topicNo: number;
  @Prop({ required: true }) lessonNo: number;
  @Prop({ enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' }) status: string;
  @Prop() completedAt: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const LessonProgressSchema = SchemaFactory.createForClass(LessonProgress);
// One progress row per student per lesson - upserted, never duplicated.
LessonProgressSchema.index({ studentId: 1, syllabusId: 1, unitNo: 1, topicNo: 1, lessonNo: 1 }, { unique: true });
LessonProgressSchema.index({ tenantId: 1, syllabusId: 1 });
