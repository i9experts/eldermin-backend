// ============================================================
// STUDENT ATTENDANCE + FEE + BEHAVIOUR SCHEMAS
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// STUDENT ATTENDANCE
// ============================================================
export type StudentAttendanceDocument = StudentAttendance & Document;

@Schema({ timestamps: true, collection: 'student_attendance' })
export class StudentAttendance {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  @Prop({ required: true }) date: Date;

  @Prop({
    enum: ['present', 'absent', 'late', 'excused', 'half_day', 'half_day_am', 'half_day_pm', 'on_leave', 'medical'],
    required: true,
  })
  status: string;

  @Prop() checkInTime: string;
  @Prop() checkOutTime: string;
  @Prop() markedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) markedById: Types.ObjectId;
  @Prop() remarks: string;
  @Prop() parentNotified: boolean;

  // Only set when the school's AttendanceSettings mode is 'subject_wise'
  // (see teaching/schemas/attendance-settings.schema.ts) - lets a class
  // teacher mark a separate status per subject for the same day, rather
  // than one whole-day status. Absent/null for every 'daily'-mode record,
  // including every record that existed before this field did - the
  // upsert filter in markAttendance/bulkMarkAttendance below matches on
  // this field too, so it stays exactly one record per student per day
  // for daily mode and one per student per day per subject for
  // subject-wise mode, never colliding between the two.
  @Prop({ type: String, default: null }) subject: string | null;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const StudentAttendanceSchema = SchemaFactory.createForClass(StudentAttendance);
StudentAttendanceSchema.index({ studentId: 1, date: -1 });
StudentAttendanceSchema.index({ schoolSlug: 1, date: -1 });
StudentAttendanceSchema.index({ schoolSlug: 1, grade: 1, date: -1 });
// One record per student, day AND subject (subject is null for daily-mode records). Replaces the old unique {studentId, date}, which
// made a second subject on the same day a duplicate-key error. The old index is dropped by
// scripts/migrate-student-attendance-index.ts (create-new-first); until then both exist and the code works either way
// (attendance-upsert.util.ts answers a clear 409 for a subject save that hits the old index).
// scripts/drop-stale-attendance-index.ts (already on main) drops the same stale index; either script may be used.
StudentAttendanceSchema.index(
  { studentId: 1, date: 1, subject: 1 },
  { unique: true, name: 'studentId_1_date_1_subject_1' }
);

// ============================================================
// STUDENT FEE LEDGER (lightweight — links to Finance module)
// ============================================================
export type StudentFeeDocument = StudentFee & Document;

@Schema({ timestamps: true, collection: 'student_fees' })
export class StudentFee {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;

  @Prop({ required: true }) month: string;       // e.g. "2025-02"
  @Prop({ required: true }) academicYear: string;
  @Prop({ required: true }) feeType: string;     // Tuition, Transport, etc.
  @Prop({ required: true }) amount: number;
  @Prop({ default: 0 }) discount: number;
  @Prop({ default: 0 }) fine: number;
  @Prop() netAmount: number;

  @Prop({
    enum: ['pending', 'paid', 'partial', 'overdue', 'waived'],
    default: 'pending',
  })
  status: string;

  @Prop() paidAmount: number;
  @Prop() paidDate: Date;
  @Prop() receiptNumber: string;
  @Prop() paymentMethod: string;
  @Prop() collectedBy: string;
  @Prop() dueDate: Date;
  @Prop() remarks: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const StudentFeeSchema = SchemaFactory.createForClass(StudentFee);
StudentFeeSchema.index({ studentId: 1, month: -1 });
StudentFeeSchema.index({ schoolSlug: 1, status: 1 });
StudentFeeSchema.index({ schoolSlug: 1, month: -1 });

// ============================================================
// BEHAVIOUR RECORD
// ============================================================
export type BehaviourDocument = Behaviour & Document;

@Schema({ timestamps: true, collection: 'student_behaviour' })
export class Behaviour {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  @Prop({ required: true }) date: Date;

  @Prop({
    enum: ['positive', 'negative', 'neutral'],
    required: true,
  })
  type: string;

  @Prop({
    enum: [
      'achievement', 'good_conduct', 'helping', 'leadership',
      'academic_excellence', 'community_service',         // positive
      'late_coming', 'uniform_violation', 'misconduct',
      'bullying', 'cheating', 'property_damage', 'absenteeism', // negative
      'counselling', 'parent_meeting', 'warning',         // neutral
    ],
    required: true,
  })
  category: string;

  @Prop({ required: true }) description: string;

  @Prop({
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  severity: string;

  @Prop() actionTaken: string;
  @Prop() parentNotified: boolean;
  @Prop() parentNotifiedDate: Date;
  @Prop() followUpDate: Date;
  @Prop() followUpNote: string;
  @Prop({ default: false }) resolved: boolean;

  @Prop() reportedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) reportedById: Types.ObjectId;
  @Prop() witnessedBy: string;

  // Points system
  @Prop({ default: 0 }) points: number; // positive or negative

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const BehaviourSchema = SchemaFactory.createForClass(Behaviour);
BehaviourSchema.index({ studentId: 1, date: -1 });
BehaviourSchema.index({ schoolSlug: 1, type: 1 });
BehaviourSchema.index({ schoolSlug: 1, date: -1 });

// ============================================================
// ASSESSMENT RESULT (links to Assessment module)
// ============================================================
export type AssessmentResultDocument = AssessmentResult & Document;

@Schema({ _id: true })
class SubjectResult {
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) maxMarks: number;
  @Prop({ required: true }) obtainedMarks: number;
  @Prop() grade: string;
  @Prop() remarks: string;
}
const SubjectResultSchema = SchemaFactory.createForClass(SubjectResult);

@Schema({ timestamps: true, collection: 'assessment_results' })
export class AssessmentResult {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  @Prop({ required: true }) assessmentTitle: string;
  @Prop({
    enum: ['quiz', 'test', 'exam', 'assignment', 'project', 'mid_term', 'final'],
  })
  assessmentType: string;

  @Prop({ required: true }) date: Date;
  @Prop({ type: [SubjectResultSchema], default: [] }) subjectResults: SubjectResult[];

  @Prop() totalMaxMarks: number;
  @Prop() totalObtainedMarks: number;
  @Prop() percentage: number;
  @Prop() overallGrade: string;
  @Prop() position: number;
  @Prop() remarks: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const AssessmentResultSchema = SchemaFactory.createForClass(AssessmentResult);
AssessmentResultSchema.index({ studentId: 1, date: -1 });
AssessmentResultSchema.index({ schoolSlug: 1, grade: 1, assessmentType: 1 });
