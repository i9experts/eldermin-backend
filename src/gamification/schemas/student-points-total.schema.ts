import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// STUDENT POINTS TOTAL — LMS Phase 5 (gamification)
// A cached rollup, kept in sync on every PointsTransaction write via
// $inc - same "cheap read, kept in sync on write" convention as
// Syllabus.totalTopics/coveredTopics and ForumThread.replyCount. A
// leaderboard sorts many students by total on every read; recomputing
// that from points_transactions via aggregation on every page load
// would cost far more than a single $inc per award.
// ============================================================
export type StudentPointsTotalDocument = StudentPointsTotal & Document;

@Schema({ timestamps: true, collection: 'student_points_totals' })
export class StudentPointsTotal {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', unique: true }) studentId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ type: Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop() studentName: string;
  @Prop() currentGrade: string;
  @Prop() currentSection: string;
  @Prop({ default: 0 }) totalPoints: number;
}

export const StudentPointsTotalSchema = SchemaFactory.createForClass(StudentPointsTotal);
StudentPointsTotalSchema.index({ schoolSlug: 1, totalPoints: -1 });
StudentPointsTotalSchema.index({ schoolSlug: 1, currentGrade: 1, currentSection: 1, totalPoints: -1 });
