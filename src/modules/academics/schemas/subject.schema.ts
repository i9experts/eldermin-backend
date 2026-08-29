import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type SubjectDocument = Subject & Document;

@Schema({ timestamps: true, collection: 'subjects' })
export class Subject {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  // Same convention as Syllabus/ElectiveGroup: null means "applies to every
  // campus in the school" - existing subjects created before this field
  // existed keep that meaning unchanged, no migration needed.
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string;
  @Prop({ enum: ['core','elective','co_curricular','islamic','language','stem','arts','pe','other'], default: 'core' }) category: string;
  @Prop({ type: [String], default: [] }) gradeLevels: string[];
  // Optional section-level narrowing within a gradeLevel. No entry here for
  // a given grade implicitly means "all sections of that grade" - existing
  // subjects (which only ever set gradeLevels) keep working exactly as
  // before this field existed.
  @Prop({
    type: [{ gradeLevel: String, sectionName: String, _id: false }],
    default: [],
  })
  sections: { gradeLevel: string; sectionName: string }[];
  @Prop({ default: 40 }) periodsPerWeek: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop() description: string;
  @Prop({ type: [String], default: [] }) textbooks: string[];
  @Prop({ default: false }) hasLab: boolean;
  @Prop() departmentName: string;
  @Prop({ default: 0 }) creditHours: number;
}
export const SubjectSchema = SchemaFactory.createForClass(Subject);
SubjectSchema.index({ tenantId: 1, code: 1 }, { unique: true });
SubjectSchema.index({ tenantId: 1, gradeLevels: 1 });
SubjectSchema.index({ tenantId: 1, campusId: 1 });
