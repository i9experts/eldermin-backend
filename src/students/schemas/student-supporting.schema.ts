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
    enum: ['present', 'absent', 'late', 'excused', 'half_day'],
    required: true,
  })
  status: string;

  @Prop() checkInTime: string;
  @Prop() checkOutTime: string;
  @Prop() markedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) markedById: Types.ObjectId;
  @Prop() remarks: string;
  @Prop() parentNotified: boolean;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const StudentAttendanceSchema = SchemaFactory.createForClass(StudentAttendance);
StudentAttendanceSchema.index({ studentId: 1, date: -1 });
StudentAttendanceSchema.index({ schoolSlug: 1, date: -1 });
StudentAttendanceSchema.index({ schoolSlug: 1, grade: 1, date: -1 });
StudentAttendanceSchema.index(
  { studentId: 1, date: 1 },
  { unique: true }
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
