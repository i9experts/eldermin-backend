import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type StudentAttendanceDocument = StudentAttendance & Document;

@Schema({ collection: 'studentAttendance' })
export class StudentAttendance {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Section' }) sectionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'AcademicYear' }) academicYearId: Types.ObjectId;
  @Prop({ required: true }) date: Date;
  @Prop({ enum: ['present','absent','late','half_day_am','half_day_pm','on_leave','holiday','medical'], default: 'absent' }) status: string;
  @Prop({ default: false }) parentNotified: boolean;
  @Prop() absenceReason: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) markedBy: Types.ObjectId;
  @Prop() markedAt: Date;
}
export const StudentAttendanceSchema = SchemaFactory.createForClass(StudentAttendance);
StudentAttendanceSchema.index({ tenantId: 1, studentId: 1, date: 1 }, { unique: true });
StudentAttendanceSchema.index({ tenantId: 1, sectionId: 1, date: 1 });
