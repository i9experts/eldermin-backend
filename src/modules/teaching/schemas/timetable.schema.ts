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
      // Pinned during "Regenerate Open Slots" - the partial-regenerate pass
      // treats a locked period as a fixed obstacle and only redistributes
      // unlocked ones around it.
      locked: { type: Boolean, default: false },
      // Groups 2+ contiguous same-day periods into one double/triple
      // (block) period - e.g. a 2-period science lab. All periods sharing
      // a blockId carry identical subject/teacher/roomNo/type; the one
      // with the lowest periodNo is the block's "start" for display and
      // PDF rendering (rowspan) purposes.
      blockId: { type: String, default: null },
      // Which alternating week this slot runs on, for timetables with
      // weekCycleEnabled. 'both' (the default) runs every week and is
      // treated as occupying the slot on both cycles for conflict
      // purposes; 'A'/'B' periods only ever clash with same-letter or
      // 'both' periods in the same slot, never with the opposite letter.
      weekCycle: { type: String, enum: ['both', 'A', 'B'], default: 'both' },
      // Links this period to an ElectiveGroup document when it's one leg
      // of a cross-class elective block (e.g. "Computer Science" drawing
      // students from 3 different sections at once). All periods sharing
      // an electiveGroupId are expected to collide on day/time/teacher/
      // room by design, so the conflict engine treats same-group periods
      // as non-conflicting with each other.
      electiveGroupId: { type: Types.ObjectId, ref: 'ElectiveGroup', default: null },
      electiveGroupName: { type: String, default: null },
      // When set (2+ entries), this single day/time slot is actually a
      // split lesson: the class divides into sub-groups, each with its
      // own teacher/room, running concurrently. teacherId/teacherName/
      // roomNo on the period itself are left blank for a split period -
      // the conflict engine and UI read the per-group values instead.
      splitGroups: {
        type: [{
          label: String,
          teacherId: { type: Types.ObjectId, ref: 'Staff' },
          teacherName: String,
          roomNo: String,
          _id: false,
        }],
        default: [],
      },
      _id: false,
    }],
    default: [],
  }) periods: any[];

  @Prop({ enum: ['draft', 'active', 'archived'], default: 'draft' }) status: string;
  @Prop({ default: 8 }) periodsPerDay: number;
  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] }) workingDays: number[];
  // Whether this timetable alternates on a 2-week A/B cycle. When true,
  // periods with weekCycle 'A' or 'B' only run on their matching week;
  // cycleAnchor is the first day of a "Week A" so parity for any date can
  // be computed as floor(daysSince(anchor) / 7) % 2.
  @Prop({ default: false }) weekCycleEnabled: boolean;
  @Prop({ type: Date, default: null }) cycleAnchor: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}

export const TimetableSchema = SchemaFactory.createForClass(Timetable);
TimetableSchema.index({ tenantId: 1, gradeLevel: 1, sectionName: 1, status: 1 });
TimetableSchema.index({ tenantId: 1, 'periods.teacherId': 1 });
