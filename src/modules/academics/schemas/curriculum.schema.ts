import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type CurriculumDocument = Curriculum & Document;

@Schema({ timestamps: true, collection: 'curricula' })
export class Curriculum {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['cambridge','ib','national','american','islamic','custom','hybrid'], default: 'national' }) framework: string;
  @Prop({ required: true }) gradeLevel: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Subject' }) subjectId: Types.ObjectId;
  @Prop() subjectName: string;
  @Prop({ type: Types.ObjectId, ref: 'AcademicYear' }) academicYearId: Types.ObjectId;
  @Prop() academicYearLabel: string;
  @Prop({
    type: [{
      sloCode:        String,
      description:    String,
      bloomsLevel:    String,
      strand:         String,
      isAssessed:     Boolean,
      assessmentType: String,
      _id: false,
    }],
    default: [],
  }) slos: any[];
  @Prop({
    type: [{
      standard:    String,
      code:        String,
      description: String,
      _id: false,
    }],
    default: [],
  }) standardsMapping: any[];
  @Prop({ enum: ['draft','active','archived'], default: 'draft' }) status: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;
}
export const CurriculumSchema = SchemaFactory.createForClass(Curriculum);
CurriculumSchema.index({ tenantId: 1, gradeLevel: 1, subjectId: 1, academicYearLabel: 1 });
CurriculumSchema.index({ tenantId: 1, status: 1 });
