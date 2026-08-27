import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type ExamSessionDocument = ExamSession & Document;

// One exam sitting: a subject, for one class/section (or a combined group,
// e.g. all Grade 10 sections sitting Math together), on a given date/room,
// with one or more invigilators. Deliberately its own collection rather
// than reusing Timetable/Period - an exam schedule runs on real calendar
// dates (not a recurring weekly day-of-week grid), spans a whole hall
// rather than one classroom, and needs invigilator rostering that has
// nothing to do with regular teaching load. It reuses the same
// overlap-based clash detection shape as checkConflicts/checkDutyConflicts
// though, via ExamService.checkExamConflicts, so room/invigilator/student
// double-booking is caught the same way.
@Schema({ timestamps: true, collection: 'exam_sessions' })
export class ExamSession {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'AcademicYear', default: null }) academicYearId: Types.ObjectId;

  @Prop({ required: true }) examName: string; // e.g. "Mid-Term Examination"
  @Prop({ required: true }) subject: string;
  @Prop({ required: true, type: Date }) date: Date;
  @Prop({ required: true }) startTime: string;
  @Prop({ required: true }) endTime: string;
  @Prop({ required: true }) roomNo: string;

  // The class-sections sitting this exam together (usually one, sometimes
  // several combined into one hall for a shared subject) - same members
  // shape as ElectiveGroup, for the same reason: this exam maps onto more
  // than one class's students at once.
  @Prop({
    type: [{ gradeLevel: String, sectionName: String, sectionId: { type: Types.ObjectId, ref: 'Section', default: null }, _id: false }],
    default: [],
  })
  groups: { gradeLevel: string; sectionName: string; sectionId: Types.ObjectId | null }[];

  @Prop({
    type: [{ staffId: { type: Types.ObjectId, ref: 'Staff' }, staffName: String, _id: false }],
    default: [],
  })
  invigilators: { staffId: Types.ObjectId; staffName: string }[];

  @Prop({ default: '' }) notes: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}

export const ExamSessionSchema = SchemaFactory.createForClass(ExamSession);
ExamSessionSchema.index({ tenantId: 1, academicYearId: 1, date: 1 });
ExamSessionSchema.index({ tenantId: 1, 'invigilators.staffId': 1 });
