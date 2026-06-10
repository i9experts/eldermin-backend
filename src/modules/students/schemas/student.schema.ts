import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type StudentDocument = Student & Document;

@Schema({ timestamps: true, collection: 'students' })
export class Student {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Campus' }) campusId: Types.ObjectId;
  @Prop({ required: true }) admissionNo: string;
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) userId: Types.ObjectId;
  @Prop({ type: { firstName: String, middleName: String, lastName: String, dateOfBirth: Date, gender: String, nationality: String, bloodGroup: String, photoUrl: String }, default: {} }) personal: Record<string, any>;
  @Prop({ type: { phone: String, email: String }, default: {} }) contact: Record<string, any>;
  @Prop({ type: { academicYearId: Types.ObjectId, gradeLevelId: Types.ObjectId, sectionId: Types.ObjectId, rollNo: String }, default: {} }) currentPlacement: Record<string, any>;
  @Prop({ type: { admissionDate: Date, academicYearId: Types.ObjectId, admissionType: String, previousSchoolName: String }, default: {} }) admission: Record<string, any>;
  @Prop({ enum: ['prospect','applied','admitted','enrolled','alumni','withdrawn','expelled','transferred'], default: 'prospect' }) status: string;
  @Prop({ type: { isSEN: Boolean, isGifted: Boolean, hasTransportService: Boolean, isOnScholarship: Boolean }, default: {} }) flags: Record<string, any>;
  @Prop({ type: { totalAbsenceDays: { type: Number, default: 0 }, currentGpa: { type: Number, default: 0 }, attendancePct: { type: Number, default: 0 } }, default: {} }) stats: Record<string, any>;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ default: true }) isActive: boolean;
}
export const StudentSchema = SchemaFactory.createForClass(Student);
StudentSchema.index({ tenantId: 1, admissionNo: 1 }, { unique: true });
StudentSchema.index({ tenantId: 1, status: 1 });
StudentSchema.index({ tenantId: 1, campusId: 1, status: 1 });
StudentSchema.index({ tenantId: 1, 'currentPlacement.sectionId': 1 });
StudentSchema.index({ 'personal.firstName': 'text', 'personal.lastName': 'text', admissionNo: 'text' }, { name: 'idx_student_text' });
