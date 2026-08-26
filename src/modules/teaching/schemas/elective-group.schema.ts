import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type ElectiveGroupDocument = ElectiveGroup & Document;

// A cross-class subject block: one lesson slot (day/time/teacher/room)
// that several different class-sections' students draw into at once, e.g.
// "Computer Science" pulling students out of three different Grade 10
// sections for the same period. The group owns the single canonical
// day/time/teacher/room; TeachingService projects a matching Period
// (carrying this group's _id as electiveGroupId) into every member
// timetable so the existing per-class grid, drag-and-drop, and PDF export
// all keep working unmodified - the conflict engine is the only place
// that needs to know these periods are one logical booking, not N.
@Schema({ timestamps: true, collection: 'elective_groups' })
export class ElectiveGroup {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'AcademicYear', default: null }) academicYearId: Types.ObjectId;

  @Prop({ required: true }) name: string;
  @Prop({ required: true }) subject: string;
  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null }) teacherId: Types.ObjectId;
  @Prop() teacherName: string;
  @Prop() roomNo: string;
  @Prop({ enum: ['regular', 'lab', 'pe'], default: 'regular' }) type: string;

  @Prop({ required: true, min: 0, max: 6 }) day: number;
  @Prop({ required: true }) periodNo: number;
  @Prop({ required: true }) startTime: string;
  @Prop({ required: true }) endTime: string;
  @Prop({ enum: ['both', 'A', 'B'], default: 'both' }) weekCycle: string;

  // The class-sections whose students take this elective. Each entry maps
  // to exactly one Timetable document that a matching Period gets synced
  // into/out of whenever the group is created, edited, or deleted.
  @Prop({
    type: [{
      timetableId: { type: Types.ObjectId, ref: 'Timetable' },
      gradeLevel: String,
      sectionName: String,
      _id: false,
    }],
    default: [],
  })
  members: { timetableId: Types.ObjectId; gradeLevel: string; sectionName: string }[];

  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}

export const ElectiveGroupSchema = SchemaFactory.createForClass(ElectiveGroup);
ElectiveGroupSchema.index({ tenantId: 1, academicYearId: 1 });
