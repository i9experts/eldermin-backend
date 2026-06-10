import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type TeacherProfileDocument = TeacherProfile & Document;

@Schema({ timestamps: true, collection: 'teacherProfiles' })
export class TeacherProfile {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop() employeeId: string;
  @Prop() firstName: string;
  @Prop() lastName: string;
  @Prop() designation: string;
  @Prop() department: string;
  @Prop() photoUrl: string;

  @Prop({ type: [String], default: [] }) subjectsCanTeach: string[];
  @Prop({ type: [String], default: [] }) gradeLevelsCanTeach: string[];
  @Prop({ type: [{ sectionId: Types.ObjectId, sectionName: String, subjectName: String, gradeLevel: String, periodsPerWeek: Number, _id: false }], default: [] }) currentAssignments: any[];

  @Prop({ default: 6 }) maxPeriodsPerDay: number;
  @Prop({ default: 30 }) maxPeriodsPerWeek: number;
  @Prop({ default: 0 }) currentPeriodsPerWeek: number;
  @Prop({ default: false }) isClassTeacher: boolean;
  @Prop({ type: Types.ObjectId, ref: 'Section', default: null }) classTeacherOf: Types.ObjectId;
  @Prop() classTeacherOfName: string;

  @Prop({ type: [String], default: [] }) certifications: string[];
  @Prop({ type: [String], default: [] }) specializations: string[];

  @Prop({ default: 'active', enum: ['active', 'on_leave', 'absent', 'inactive'] }) status: string;
  @Prop({ default: 0 }) attendancePct: number;
  @Prop({ default: 0 }) lessonPlanCompliancePct: number;
  @Prop({ default: 0 }) avgStudentPerformance: number;
  @Prop({ default: 0 }) overallRating: number;
}

export const TeacherProfileSchema = SchemaFactory.createForClass(TeacherProfile);
TeacherProfileSchema.index({ tenantId: 1, staffId: 1 }, { unique: true });
TeacherProfileSchema.index({ tenantId: 1, status: 1 });
