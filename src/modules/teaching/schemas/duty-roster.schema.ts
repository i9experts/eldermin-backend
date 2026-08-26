import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type DutyRosterDocument = DutyRoster & Document;

// A supervision duty (gate, exam hall, corridor, lunch, bus, library...)
// assigned to a teacher for a day/time slot. Modeled deliberately close to
// a Period so it can run through the exact same conflict engine as
// lessons: a teacher can't be booked to teach and be on duty at the same
// time, and can't hold two duties at once.
@Schema({ timestamps: true, collection: 'duty_rosters' })
export class DutyRoster {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'AcademicYear', default: null }) academicYearId: Types.ObjectId;

  @Prop({ required: true }) title: string;
  @Prop({
    enum: ['gate', 'exam_hall', 'corridor', 'assembly', 'lunch', 'bus', 'library', 'custom'],
    default: 'custom',
  })
  dutyType: string;
  @Prop() location: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) teacherId: Types.ObjectId;
  @Prop({ required: true }) teacherName: string;

  @Prop({ required: true, min: 0, max: 6 }) day: number;
  @Prop({ required: true }) startTime: string;
  @Prop({ required: true }) endTime: string;
  @Prop({ enum: ['both', 'A', 'B'], default: 'both' }) weekCycle: string;

  @Prop({ default: '' }) notes: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}

export const DutyRosterSchema = SchemaFactory.createForClass(DutyRoster);
DutyRosterSchema.index({ tenantId: 1, academicYearId: 1, day: 1 });
DutyRosterSchema.index({ tenantId: 1, teacherId: 1 });
