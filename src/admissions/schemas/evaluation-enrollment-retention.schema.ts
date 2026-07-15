// ============================================================
// EVALUATION + ENROLLMENT + RETENTION SCHEMAS
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// ENTRANCE TEST
// ============================================================
export type EntranceTestDocument = EntranceTest & Document;

@Schema({ _id: true })
class SubjectScore {
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) maxScore: number;
  @Prop() obtainedScore: number;
}
const SubjectScoreSchema = SchemaFactory.createForClass(SubjectScore);

@Schema({ timestamps: true, collection: 'admission_entrance_tests' })
export class EntranceTest {
  @Prop({ type: Types.ObjectId, ref: 'Applicant', required: true })
  applicantId: Types.ObjectId;

  @Prop({ required: true }) applicantName: string;

  @Prop({ required: true }) scheduledDate: Date;
  @Prop({ required: true }) scheduledTime: string;
  @Prop({ required: true }) venue: string;

  @Prop({ type: [String], default: [] }) subjects: string[];
  @Prop({ type: [SubjectScoreSchema], default: [] }) subjectScores: SubjectScore[];

  @Prop({
    enum: ['pending','scheduled','in_progress','completed','cancelled'],
    default: 'scheduled',
  })
  status: string;

  @Prop({ default: 100 }) maxScore: number;
  @Prop() obtainedScore: number;
  @Prop() percentage: number;
  @Prop({ enum: ['pass', 'fail', 'borderline'] }) result: string;
  @Prop() examiner: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) examinerId: Types.ObjectId;
  @Prop() remarks: string;
  @Prop() durationMinutes: number;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const EntranceTestSchema = SchemaFactory.createForClass(EntranceTest);
EntranceTestSchema.index({ schoolSlug: 1, scheduledDate: 1 });
EntranceTestSchema.index({ applicantId: 1 });

// ============================================================
// INTERVIEW
// ============================================================
export type InterviewDocument = Interview & Document;

@Schema({ _id: true })
class InterviewScore {
  @Prop({ required: true }) criteria: string;
  @Prop({ required: true }) score: number;
  @Prop({ required: true }) maxScore: number;
}
const InterviewScoreSchema = SchemaFactory.createForClass(InterviewScore);

@Schema({ timestamps: true, collection: 'admission_interviews' })
export class Interview {
  @Prop({ type: Types.ObjectId, ref: 'Applicant', required: true })
  applicantId: Types.ObjectId;

  @Prop({ required: true }) applicantName: string;

  @Prop({ required: true }) scheduledDate: Date;
  @Prop({ required: true }) scheduledTime: string;
  @Prop() venue: string;

  @Prop({ type: [String], default: [] }) interviewers: string[];
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] }) interviewerIds: Types.ObjectId[];

  @Prop({
    enum: ['student', 'parent', 'both'],
    default: 'both',
  })
  type: string;

  @Prop({
    enum: ['pending','scheduled','in_progress','completed','cancelled'],
    default: 'scheduled',
  })
  status: string;

  @Prop({ type: [InterviewScoreSchema], default: [] }) scores: InterviewScore[];
  @Prop({ enum: ['recommended', 'not_recommended', 'borderline'] }) decision: string;
  @Prop() remarks: string;
  @Prop() completedAt: Date;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const InterviewSchema = SchemaFactory.createForClass(Interview);
InterviewSchema.index({ schoolSlug: 1, scheduledDate: 1 });
InterviewSchema.index({ applicantId: 1 });

// ============================================================
// ENROLLMENT
// ============================================================
export type EnrollmentDocument = Enrollment & Document;

@Schema({ timestamps: true, collection: 'admission_enrollments' })
export class Enrollment {
  @Prop({ type: Types.ObjectId, ref: 'Applicant', required: true })
  applicantId: Types.ObjectId;

  @Prop({ required: true }) applicationNumber: string;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) gradeEnrolled: string;
  @Prop() section: string;
  @Prop() classAssigned: string;
  @Prop() rollNumber: string;

  @Prop({
    enum: ['pending_fee','fee_paid','documents_pending','enrolled','deferred'],
    default: 'pending_fee',
  })
  status: string;

  // Fee
  @Prop({ default: 0 }) admissionFee: number;
  @Prop({ default: false }) admissionFeePaid: boolean;
  @Prop() feePaidDate: Date;
  @Prop() feeReceiptNumber: string;

  // Checklist
  @Prop({ default: false }) documentsComplete: boolean;
  @Prop({ default: false }) uniformIssued: boolean;
  @Prop({ default: false }) idCardIssued: boolean;
  @Prop({ default: false }) welcomeKitGiven: boolean;
  @Prop() orientationDate: Date;

  // Student profile link (created after enrollment)
  @Prop({ type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop() enrolledAt: Date;
  @Prop() enrolledBy: string;
  @Prop() notes: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
  @Prop() campusId: string;
}

export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment);
EnrollmentSchema.index({ schoolSlug: 1, status: 1 });
EnrollmentSchema.index({ schoolSlug: 1, academicYear: 1 });
EnrollmentSchema.index({ applicantId: 1 }, { unique: true });

// ============================================================
// RETENTION
// ============================================================
export type RetentionDocument = Retention & Document;

@Schema({ timestamps: true, collection: 'admission_retention' })
export class Retention {
  @Prop({ type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop({ required: true }) academicYear: string;

  @Prop({
    enum: ['active', 'at_risk', 'withdrawn', 're_enrolled', 'waitlisted'],
    default: 'active',
  })
  status: string;

  @Prop({
    enum: ['pending', 'confirmed', 'declined'],
  })
  reEnrollmentStatus: string;

  @Prop() withdrawalReason: string;
  @Prop() withdrawalDate: Date;

  @Prop({ type: [String], default: [] }) atRiskFactors: string[];
  @Prop() counsellorAssigned: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) counsellorId: Types.ObjectId;

  @Prop() lastInteractionDate: Date;
  @Prop() nextFollowUpDate: Date;
  @Prop() notes: string;
  @Prop() waitlistPosition: number;

  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const RetentionSchema = SchemaFactory.createForClass(Retention);
RetentionSchema.index({ schoolSlug: 1, status: 1 });
RetentionSchema.index({ schoolSlug: 1, nextFollowUpDate: 1 });
