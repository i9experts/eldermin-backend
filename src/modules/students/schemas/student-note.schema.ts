import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type StudentNoteDocument = StudentNote & Document;

@Schema({ timestamps: true, collection: 'studentNotes' })
export class StudentNote {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ enum: ['academic','pastoral','medical','behavioural','positive','counselling','safeguarding','general'], default: 'general' }) category: string;
  @Prop() title: string;
  @Prop({ required: true }) content: string;
  @Prop({ enum: ['all_staff','class_teacher_only','management_only','counsellor_only'], default: 'all_staff' }) visibility: string;
  @Prop({ default: false }) isFollowUpRequired: boolean;
  @Prop() followUpDate: Date;
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
  @Prop() createdByName: string;
}
export const StudentNoteSchema = SchemaFactory.createForClass(StudentNote);
StudentNoteSchema.index({ tenantId: 1, studentId: 1, category: 1 });
