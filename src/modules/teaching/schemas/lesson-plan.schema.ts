import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type LessonPlanDocument = LessonPlan & Document;

@Schema({ timestamps: true, collection: 'lessonPlans' })
export class LessonPlan {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null }) teacherId: Types.ObjectId;
  @Prop() teacherName: string;
  @Prop({ type: Types.ObjectId, ref: 'AcademicYear' }) academicYearId: Types.ObjectId;

  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) gradeLevel: string;
  @Prop() sectionName: string;
  @Prop({ required: true }) topic: string;
  @Prop() description: string;
  @Prop({ required: true }) planDate: Date;
  @Prop() weekNumber: number;
  @Prop({ default: 40 }) durationMins: number;

  @Prop({ type: [String], default: [] }) learningObjectives: string[];
  @Prop({ type: [String], default: [] }) resources: string[];
  @Prop() teachingMethodology: string;
  @Prop() priorKnowledge: string;
  @Prop() activities: string;
  @Prop() assessment: string;
  @Prop() homework: string;
  @Prop() reflection: string;

  @Prop({ type: [String], default: [] }) sloTags: string[];
  @Prop({ default: 0 }) syllabusPageFrom: number;
  @Prop({ default: 0 }) syllabusPageTo: number;

  @Prop({ enum: ['draft', 'submitted', 'approved', 'rejected', 'overdue'], default: 'draft' }) status: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) approvedBy: Types.ObjectId;
  @Prop() approvedAt: Date;
  @Prop() rejectionReason: string;
  @Prop() approverNotes: string;
}

export const LessonPlanSchema = SchemaFactory.createForClass(LessonPlan);
LessonPlanSchema.index({ tenantId: 1, teacherId: 1, planDate: -1 });
LessonPlanSchema.index({ tenantId: 1, status: 1, planDate: 1 });
LessonPlanSchema.index({ tenantId: 1, subject: 1, gradeLevel: 1 });
