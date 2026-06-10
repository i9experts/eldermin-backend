import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type SyllabusDocument = Syllabus & Document;

@Schema({ timestamps: true, collection: 'syllabi' })
export class Syllabus {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true }) subjectName: string;
  @Prop({ type: Types.ObjectId, ref: 'Subject' }) subjectId: Types.ObjectId;
  @Prop({ required: true }) gradeLevel: string;
  @Prop() academicYearLabel: string;
  @Prop({ enum: ['cambridge','ib','national','american','custom'], default: 'national' }) framework: string;
  @Prop() recommendedTextbook: string;
  @Prop() publisherName: string;
  @Prop() edition: string;
  @Prop({ default: 0 }) totalWeeks: number;
  @Prop({ default: 0 }) totalPeriods: number;
  @Prop({
    type: [{
      unitNo: Number,
      unitName: String,
      weeks: Number,
      periods: Number,
      topics: [{
        topicNo: Number,
        topicName: String,
        description: String,
        learningObjectives: [String],
        sloReferences: [String],
        assessmentType: String,
        pageFrom: Number,
        pageTo: Number,
        _id: false,
      }],
      _id: false,
    }],
    default: [],
  }) units: any[];
  @Prop({ default: 0 }) assessmentWeightage: number;
  @Prop({
    type: {
      midTerm:   { type: Number, default: 30 },
      finalExam: { type: Number, default: 50 },
      classwork: { type: Number, default: 10 },
      homework:  { type: Number, default: 10 },
    },
    default: {},
  }) assessmentBreakdown: any;
  @Prop({ enum: ['draft','active','approved','archived'], default: 'draft' }) status: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;
}
export const SyllabusSchema = SchemaFactory.createForClass(Syllabus);
SyllabusSchema.index({ tenantId: 1, gradeLevel: 1, subjectName: 1, academicYearLabel: 1 });
SyllabusSchema.index({ tenantId: 1, status: 1 });
