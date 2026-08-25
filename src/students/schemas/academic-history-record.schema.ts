// ============================================================
// ACADEMIC HISTORY RECORD — one past academic year's outcome for a
// student, shown in the History tab (Student 360). Named
// "...Record" to avoid clashing with the unrelated, embedded
// AcademicRecord sub-schema already on the Student document itself
// (see student.schema.ts) — that one backs a different, still-unused
// embedded `academicHistory[]` field.
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AcademicHistoryRecordDocument = AcademicHistoryRecord & Document;

@Schema({ timestamps: true, collection: 'academic_history_records' })
export class AcademicHistoryRecord {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop() yearLabel: string;
  @Prop() gradeLevelName: string;
  @Prop() sectionName: string;
  @Prop() schoolName: string;

  @Prop({ enum: ['pass', 'fail', 'distinction', 'merit', 'incomplete', 'withdrawn', 'transferred'] })
  finalResult: string;

  @Prop() finalPercentage: number;
  @Prop() finalGpa: number;
  @Prop() finalGrade: string;
  @Prop() classRank: number;

  @Prop({
    enum: ['promoted', 'retained', 'graduated', 'transferred_out', 'withdrawn'],
  })
  promotionStatus: string;

  @Prop() teacherComment: string;
  @Prop({ default: false }) isLocked: boolean;

  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const AcademicHistoryRecordSchema = SchemaFactory.createForClass(AcademicHistoryRecord);
AcademicHistoryRecordSchema.index({ schoolSlug: 1, studentId: 1, yearLabel: 1 });
