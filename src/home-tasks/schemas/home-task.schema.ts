// ============================================================
// HOME TASK — Tarbiyah-at-home parent/student task assignment.
// A teacher assigns a small character-building task to be done at
// home; the parent marks it complete (optionally with notes); the
// teacher MAY later add a rating/review, but completion counts for
// the Parent Engagement Score's "Tarbiyah-at-home" dimension the
// moment the parent marks it done — a task should never score
// against a parent because a teacher never got around to reviewing
// it.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HomeTaskDocument = HomeTask & Document;

@Schema({ timestamps: true, collection: 'home_tasks' })
export class HomeTask {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;

  @Prop({ required: true }) title: string;
  @Prop() description: string;
  // Optional link to one of the existing TARBIYAH_TRAITS keys (behaviour.schema.ts)
  // — not every home task maps to a single trait, so this is nullable.
  @Prop({ type: String, default: null }) traitKey: string | null;

  @Prop({ required: true }) assignedDate: Date;
  @Prop() dueDate: Date;
  @Prop({ required: true }) assignedBy: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) assignedByUserId: Types.ObjectId;

  @Prop({ enum: ['assigned', 'completed'], default: 'assigned' }) status: string;
  @Prop() completedAt: Date;
  @Prop() parentNotes: string;

  // Optional, post-completion teacher follow-up — never required for the
  // task to count as "done" for scoring purposes.
  @Prop({ min: 1, max: 5 }) reviewRating: number;
  @Prop() reviewNotes: string;
  @Prop() reviewedAt: Date;

  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const HomeTaskSchema = SchemaFactory.createForClass(HomeTask);
HomeTaskSchema.index({ schoolSlug: 1, studentId: 1, status: 1 });
HomeTaskSchema.index({ schoolSlug: 1, grade: 1, section: 1, assignedDate: -1 });
