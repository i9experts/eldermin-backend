import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type SubjectGroupDocument = SubjectGroup & Document;

// A named bundle of Subjects (e.g. "Grade 1 Core Bundle") that an admin can
// assign to a class in one action, rather than opening every member
// subject individually to add the same grade/section. Same
// tenant/institution/campus scoping convention as ElectiveGroup - campusId
// null means "applies to every campus", consistent with Subject itself.
@Schema({ timestamps: true, collection: 'subject_groups' })
export class SubjectGroup {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;

  @Prop({ required: true }) name: string;
  @Prop() description: string;
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Subject' }], default: [] }) subjectIds: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}

export const SubjectGroupSchema = SchemaFactory.createForClass(SubjectGroup);
SubjectGroupSchema.index({ tenantId: 1, campusId: 1 });
