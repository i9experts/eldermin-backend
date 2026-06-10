import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type SyllabusCoverageDocument = SyllabusCoverage & Document;

@Schema({ timestamps: true, collection: 'syllabusCoverage' })
export class SyllabusCoverage {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'AcademicYear' }) academicYearId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) teacherId: Types.ObjectId;
  @Prop() teacherName: string;
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) gradeLevel: string;
  @Prop() sectionName: string;

  @Prop({ default: 0 }) totalTopics: number;
  @Prop({ default: 0 }) coveredTopics: number;
  @Prop({ default: 0 }) coveragePct: number;

  @Prop({
    type: [{
      chapterNo: Number,
      chapterName: String,
      totalLessons: Number,
      coveredLessons: Number,
      isCovered: Boolean,
      coveredDate: Date,
      notes: String,
      _id: false,
    }],
    default: [],
  }) chapters: any[];

  @Prop({ enum: ['on_track', 'behind', 'completed', 'not_started'], default: 'not_started' }) trackStatus: string;
  @Prop() lastUpdatedAt: Date;
}

export const SyllabusCoverageSchema = SchemaFactory.createForClass(SyllabusCoverage);
SyllabusCoverageSchema.index(
  { tenantId: 1, teacherId: 1, subject: 1, gradeLevel: 1, academicYearId: 1 },
  { unique: true },
);
