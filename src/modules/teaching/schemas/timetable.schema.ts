import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type TimetableDocument = Timetable & Document;

@Schema({ timestamps: true, collection: 'timetables' })
export class Timetable {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'AcademicYear', default: null }) academicYearId: Types.ObjectId;
  @Prop() academicYearLabel: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId;

  @Prop({ required: true }) gradeLevel: string;
  @Prop({ required: true }) sectionName: string;
  @Prop({ type: Types.ObjectId, ref: 'Section', default: null }) sectionId: Types.ObjectId;

  @Prop({
    type: [{
      day: { type: Number, min: 0, max: 6 },
      periodNo: Number,
      startTime: String,
      endTime: String,
      subject: String,
      teacherId: { type: Types.ObjectId, ref: 'Staff' },
      teacherName: String,
      roomNo: String,
      type: { type: String, enum: ['regular', 'lab', 'pe', 'break', 'assembly', 'free'], default: 'regular' },
      _id: false,
    }],
    default: [],
  }) periods: any[];

  @Prop({ enum: ['draft', 'active', 'archived'], default: 'draft' }) status: string;
  @Prop({ default: 8 }) periodsPerDay: number;
  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] }) workingDays: number[];
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}

export const TimetableSchema = SchemaFactory.createForClass(Timetable);
TimetableSchema.index({ tenantId: 1, gradeLevel: 1, sectionName: 1, status: 1 });
TimetableSchema.index({ tenantId: 1, 'periods.teacherId': 1 });
