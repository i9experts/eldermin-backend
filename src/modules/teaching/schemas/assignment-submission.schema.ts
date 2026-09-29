import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type AssignmentSubmissionDocument = AssignmentSubmission & Document;

// One row per (assignment, student) - the real per-student submission/
// grading record the old Assignment.submissionsCount/avgScore fields
// were standing in for without ever being backed by anything. Created
// as a "pending" roster snapshot the moment an assignment is assigned
// to a class (see TeachingService.materializeSubmissions), so a teacher
// always sees the full class list - who has and hasn't turned work in -
// not just the students who happened to submit.
@Schema({ timestamps: true, collection: 'assignmentSubmissions' })
export class AssignmentSubmission {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Assignment', index: true }) assignmentId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop() studentName: string;

  // pending -> (submitted | late) -> graded, or pending -> missed (cron,
  // once dueDate has passed with nothing turned in). isLate is tracked
  // separately from status so grading a late submission doesn't erase
  // the fact that it was late.
  @Prop({ enum: ['pending', 'submitted', 'late', 'graded', 'missed'], default: 'pending' }) status: string;
  @Prop({ default: false }) isLate: boolean;

  @Prop() textResponse?: string;
  @Prop({ type: [String], default: [] }) attachmentS3Keys: string[];
  @Prop() submittedAt?: Date;

  // Denormalized from the assignment's totalMarks at submission-stub
  // creation time, so a later edit to the assignment's own totalMarks
  // doesn't retroactively rescale marks already given out.
  @Prop({ default: 100 }) maxGrade: number;
  @Prop({ type: Number, default: null }) grade: number | null;
  @Prop() feedback?: string;
  @Prop() gradedAt?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) gradedBy: Types.ObjectId | null;
}

export const AssignmentSubmissionSchema = SchemaFactory.createForClass(AssignmentSubmission);
AssignmentSubmissionSchema.index({ tenantId: 1, assignmentId: 1, studentId: 1 }, { unique: true });
AssignmentSubmissionSchema.index({ tenantId: 1, studentId: 1, status: 1 });
