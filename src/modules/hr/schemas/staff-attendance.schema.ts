import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type StaffAttendanceDocument = StaffAttendance & Document;

@Schema({ collection: 'staffAttendance' })
export class StaffAttendance {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus' }) campusId: Types.ObjectId;
  @Prop({ required: true }) date: Date;
  @Prop({ enum: ['present','absent','late','half_day','on_leave','holiday','weekend','remote'], default: 'absent' }) status: string;
  @Prop() checkInTime: string;
  @Prop() checkOutTime: string;
  @Prop({ default: 0 }) lateByMins: number;
  @Prop({ default: 0 }) workingHours: number;
  @Prop() notes: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) markedBy: Types.ObjectId;
  @Prop() markedAt: Date;
}
export const StaffAttendanceSchema = SchemaFactory.createForClass(StaffAttendance);
StaffAttendanceSchema.index({ tenantId: 1, staffId: 1, date: 1 }, { unique: true });
StaffAttendanceSchema.index({ tenantId: 1, date: 1, status: 1 });
StaffAttendanceSchema.index({ tenantId: 1, campusId: 1, date: 1 });
