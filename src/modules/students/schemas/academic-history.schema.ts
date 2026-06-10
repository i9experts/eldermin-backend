import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type AcademicHistoryDocument = AcademicHistory & Document;

@Schema({ timestamps: true, collection: 'academicHistory' })
export class AcademicHistory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'AcademicYear' }) academicYearId: Types.ObjectId;
  @Prop() yearLabel: string;
  @Prop() gradeLevelName: string;
  @Prop() sectionName: string;
  @Prop() schoolName: string;
  @Prop({ enum: ['pass','fail','distinction','merit','incomplete','withdrawn','transferred'] }) finalResult: string;
  @Prop() finalPercentage: number;
  @Prop() finalGpa: number;
  @Prop() finalGrade: string;
  @Prop() classRank: number;
  @Prop({ type: [{ subjectName: String, finalMark: Number, maxMark: Number, percentage: Number, grade: String, _id: false }], default: [] }) subjects: any[];
  @Prop({ type: { workingDays: Number, presentDays: Number, percentage: Number }, default: {} }) attendance: any;
  @Prop({ enum: ['promoted','retained','graduated','transferred_out','withdrawn'] }) promotionStatus: string;
  @Prop() teacherComment: string;
  @Prop({ default: false }) isLocked: boolean;
}
export const AcademicHistorySchema = SchemaFactory.createForClass(AcademicHistory);
AcademicHistorySchema.index({ tenantId: 1, studentId: 1, academicYearId: 1 }, { unique: true });
