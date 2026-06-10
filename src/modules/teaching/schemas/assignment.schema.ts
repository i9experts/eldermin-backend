import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type AssignmentDocument = Assignment & Document;

@Schema({ timestamps: true, collection: 'assignments' })
export class Assignment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null }) teacherId: Types.ObjectId;
  @Prop() teacherName: string;
  @Prop({ required: true }) title: string;
  @Prop() description: string;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) gradeLevel: string;
  @Prop() sectionName: string;
  @Prop({ enum: ['homework', 'classwork', 'project', 'quiz', 'test', 'lab_work', 'presentation', 'other', 'assessment'], default: 'homework' }) type: string;
  @Prop({ default: null }) assignedDate: Date;
  @Prop({ default: null }) dueDate: Date;
  @Prop({ default: 100 }) totalMarks: number;
  @Prop({ default: 50 }) passingMarks: number;
  @Prop({ enum: ['draft', 'assigned', 'submitted', 'graded', 'overdue'], default: 'draft' }) status: string;
  @Prop({ default: 0 }) submissionsCount: number;
  @Prop({ default: 0 }) avgScore: number;
  @Prop({ type: [String], default: [] }) attachmentS3Keys: string[];
  @Prop() instructions: string;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);
AssignmentSchema.index({ tenantId: 1, teacherId: 1, dueDate: -1 });
AssignmentSchema.index({ tenantId: 1, subject: 1, gradeLevel: 1, status: 1 });
