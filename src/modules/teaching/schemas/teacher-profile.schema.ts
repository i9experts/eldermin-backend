import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type TeacherProfileDocument = TeacherProfile & Document;

@Schema({ timestamps: true, collection: 'teacherProfiles' })
export class TeacherProfile {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Staff' }) staffId: Types.ObjectId;
  @Prop() employeeId: string;
  @Prop() firstName: string;
  @Prop() lastName: string;
  @Prop() designation: string;
  @Prop() department: string;
  @Prop() photoUrl: string;
  // Denormalized from the linked Staff record at creation time - lets the
  // Teacher Directory be filtered/scoped by campus without a join, the
  // same way Room/PeriodTemplate/Timetable already carry their own
  // campusId in this module.
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;

  @Prop({ type: [String], default: [] }) subjectsCanTeach: string[];
  @Prop({ type: [String], default: [] }) gradeLevelsCanTeach: string[];
  @Prop({ type: [{ sectionId: Types.ObjectId, sectionName: String, subjectName: String, gradeLevel: String, periodsPerWeek: Number, _id: false }], default: [] }) currentAssignments: any[];

  @Prop({ default: 6 }) maxPeriodsPerDay: number;
  @Prop({ default: 30 }) maxPeriodsPerWeek: number;
  @Prop({ default: 0 }) currentPeriodsPerWeek: number;
  @Prop({ default: false }) isClassTeacher: boolean;
  // Section is an embedded subdocument within Grade.sections[], not a
  // standalone collection - ref: 'Section' below was never resolvable via
  // populate (no such model is ever registered). Storing the parent
  // Grade's id and the section name directly instead, which is exactly
  // what's needed to look this assignment up without relying on a
  // populate that would silently return null.
  //
  // These singular fields only ever held ONE assignment, so a teacher who
  // is class teacher of a second section (common in Early Years, where one
  // lead teacher often covers 2-3 small sections) had their first
  // assignment silently overwritten by the second - every consumer that
  // resolved "this teacher's class" from these fields (attendance,
  // assessments, staff/parent portals) then only ever saw one of their
  // real sections. Kept as a mirror of classTeacherAssignments[0] for any
  // caller not yet migrated to the array; classTeacherAssignments is now
  // the actual source of truth.
  @Prop() classTeacherOfGradeId: string;
  @Prop() classTeacherOfGradeName: string;
  @Prop() classTeacherOfSectionName: string;
  @Prop() classTeacherOfName: string; // denormalized display label, e.g. "Grade 3 - Girls"
  @Prop({
    type: [{ gradeId: String, gradeName: String, sectionId: String, sectionName: String, name: String, _id: false }],
    default: [],
  })
  classTeacherAssignments: Array<{ gradeId: string; gradeName: string; sectionId: string; sectionName: string; name: string }>;

  @Prop({ type: [String], default: [] }) certifications: string[];
  @Prop({ type: [String], default: [] }) specializations: string[];

  // Soft-constraint scheduling preferences, read by the whole-school
  // timetable solver (TimetableSolverService). Unlike a hard constraint
  // (double-booking), violating these doesn't invalidate a generated
  // timetable - it costs penalty points the solver tries to minimize, so a
  // school with too many teachers all wanting Friday off still gets a
  // schedule, just not necessarily everyone's favourite one.
  @Prop({ type: [Number], default: [] }) preferredFreeDays: number[]; // 0=Sun..6=Sat
  @Prop({ default: 4 }) maxConsecutivePeriods: number;
  @Prop({ default: true }) avoidGaps: boolean; // penalize idle periods between this teacher's lessons on a day

  @Prop({ default: 'active', enum: ['active', 'on_leave', 'absent', 'inactive'] }) status: string;
  @Prop({ default: 0 }) attendancePct: number;
  @Prop({ default: 0 }) lessonPlanCompliancePct: number;
  @Prop({ default: 0 }) avgStudentPerformance: number;
  @Prop({ default: 0 }) overallRating: number;
}

export const TeacherProfileSchema = SchemaFactory.createForClass(TeacherProfile);
TeacherProfileSchema.index({ tenantId: 1, staffId: 1 }, { unique: true });
TeacherProfileSchema.index({ tenantId: 1, status: 1 });
