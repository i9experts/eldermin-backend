import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type ClassDiaryEntryDocument = ClassDiaryEntry & Document;

@Schema({ _id: false })
export class DiaryPeriod {
  @Prop({ required: true }) subject: string;
  @Prop() title: string;
  @Prop() description: string;
  @Prop() classworkDescription: string;
  @Prop() homeworkDescription: string;
}
export const DiaryPeriodSchema = SchemaFactory.createForClass(DiaryPeriod);

@Schema({ timestamps: true, collection: 'class_diary_entries' })
export class ClassDiaryEntry {
  @Prop({ required: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null }) teacherId: Types.ObjectId;
  @Prop() teacherName: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop({ required: true }) gradeLevel: string;
  @Prop() sectionName: string;
  @Prop({ required: true }) diaryDate: Date;
  @Prop({ type: [DiaryPeriodSchema], default: [] }) periods: DiaryPeriod[];
  @Prop({ default: false }) shared: boolean;
  @Prop({ default: null }) sharedAt: Date;
  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null }) sharedBy: Types.ObjectId | null;
  @Prop({ default: 0 }) notifiedGuardianCount: number;
}

export const ClassDiaryEntrySchema = SchemaFactory.createForClass(ClassDiaryEntry);
ClassDiaryEntrySchema.index({ tenantId: 1, gradeLevel: 1, sectionName: 1, diaryDate: -1 });
ClassDiaryEntrySchema.index({ tenantId: 1, teacherId: 1, diaryDate: -1 });
ClassDiaryEntrySchema.index({ schoolSlug: 1, shared: 1, gradeLevel: 1, sectionName: 1, diaryDate: -1 });
