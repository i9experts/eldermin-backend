// ============================================================
// STUDENT NOTE — free-text staff notes on a student (Notes tab,
// Student 360). Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentNoteDocument = StudentNote & Document;

@Schema({ timestamps: true, collection: 'student_notes' })
export class StudentNote {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({
    enum: ['academic', 'pastoral', 'medical', 'behavioural', 'positive', 'counselling', 'safeguarding', 'general'],
    default: 'general',
  })
  category: string;

  @Prop() title: string;
  @Prop({ required: true }) content: string;

  @Prop({
    enum: ['all_staff', 'class_teacher_only', 'management_only', 'counsellor_only'],
    default: 'all_staff',
  })
  visibility: string;

  @Prop({ default: false }) isFollowUpRequired: boolean;
  @Prop() followUpDate: Date;

  @Prop() createdByName: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const StudentNoteSchema = SchemaFactory.createForClass(StudentNote);
StudentNoteSchema.index({ schoolSlug: 1, studentId: 1, category: 1 });
