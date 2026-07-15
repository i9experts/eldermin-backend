// ============================================================
// STUDENT SCHEMA — Student 360 Profile
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentDocument = Student & Document;

// ── Nested: Guardian ──────────────────────────────────────────
@Schema({ _id: false })
export class Guardian {
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['father', 'mother', 'guardian'] }) relation: string;
  @Prop() cnic: string;
  @Prop() phone: string;
  @Prop() email: string;
  @Prop() occupation: string;
  @Prop() employer: string;
  @Prop() monthlyIncome: number;
  @Prop({ default: false }) isPrimary: boolean;
  @Prop({ default: true }) isEmergencyContact: boolean;
}
export const GuardianSchema = SchemaFactory.createForClass(Guardian);

// ── Nested: Academic Record ───────────────────────────────────
@Schema({ _id: true })
export class AcademicRecord {
  @Prop({ required: true }) academicYear: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop() rollNumber: string;
  @Prop() classTeacher: string;
  @Prop() finalResult: string; // Pass / Fail / Promoted
  @Prop() totalMarks: number;
  @Prop() obtainedMarks: number;
  @Prop() percentage: number;
  @Prop() grade_result: string; // A+, A, B etc
  @Prop() position: number;
  @Prop({ default: false }) promoted: boolean;
}
export const AcademicRecordSchema = SchemaFactory.createForClass(AcademicRecord);

// ── Nested: Document ──────────────────────────────────────────
@Schema({ _id: true })
export class StudentDocument_ {
  @Prop({ required: true }) name: string;
  @Prop() type: string;
  @Prop({ enum: ['pending', 'verified', 'expired'], default: 'pending' }) status: string;
  @Prop() fileUrl: string;
  @Prop({ default: Date.now }) uploadedAt: Date;
  @Prop() verifiedBy: string;
  @Prop() expiryDate: Date;
}
export const StudentDocumentSchema = SchemaFactory.createForClass(StudentDocument_);

// ── Nested: Medical Info ──────────────────────────────────────
@Schema({ _id: false })
export class MedicalInfo {
  @Prop() bloodGroup: string;
  @Prop({ type: [String], default: [] }) allergies: string[];
  @Prop({ type: [String], default: [] }) medications: string[];
  @Prop({ type: [String], default: [] }) conditions: string[];
  @Prop() doctorName: string;
  @Prop() doctorPhone: string;
  @Prop() insuranceProvider: string;
  @Prop() insurancePolicyNumber: string;
  @Prop() specialNeedsDetail: string;
}
export const MedicalInfoSchema = SchemaFactory.createForClass(MedicalInfo);

// ── Main: Student ─────────────────────────────────────────────
@Schema({ timestamps: true, collection: 'students' })
export class Student {
  // ── Identity ───────────────────────────────────────────────
  @Prop({ required: true, unique: true }) studentId: string; // STU-2025-XXXX
  @Prop({ required: true }) firstName: string;
  @Prop({ required: true }) lastName: string;
  @Prop() arabicName: string;
  @Prop({ required: true }) dateOfBirth: Date;
  @Prop({ enum: ['male', 'female'], required: true }) gender: string;
  @Prop({ default: 'Pakistani' }) nationality: string;
  @Prop() religion: string;
  @Prop() bForm: string;      // NADRA B-Form number
  @Prop() passportNumber: string;
  @Prop() photo: string;      // URL

  // ── Contact ────────────────────────────────────────────────
  @Prop() address: string;
  @Prop() city: string;
  @Prop() province: string;
  @Prop() postalCode: string;
  @Prop() personalEmail: string;
  @Prop() personalPhone: string; // for older students

  // ── Guardians ──────────────────────────────────────────────
  @Prop({ type: [GuardianSchema], default: [] })
  guardians: Guardian[];

  // ── Medical ────────────────────────────────────────────────
  @Prop({ type: MedicalInfoSchema, default: {} })
  medical: MedicalInfo;

  // ── Current Enrollment ─────────────────────────────────────
  @Prop({ required: true }) currentGrade: string;
  @Prop() currentSection: string;
  @Prop() currentRollNumber: string;
  @Prop() currentAcademicYear: string;
  @Prop() classTeacherId: string;
  @Prop() classTeacher: string;
  @Prop() houseGroup: string;   // e.g. Red, Blue, Green, Yellow

  // ── Admission Info ─────────────────────────────────────────
  @Prop() admissionDate: Date;
  @Prop() admissionNumber: string;
  @Prop({ type: Types.ObjectId, ref: 'Enrollment' }) enrollmentId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Applicant' }) applicantId: Types.ObjectId;
  @Prop() previousSchool: string;

  // ── Academic History ───────────────────────────────────────
  @Prop({ type: [AcademicRecordSchema], default: [] })
  academicHistory: AcademicRecord[];

  // ── Documents ──────────────────────────────────────────────
  @Prop({ type: [StudentDocumentSchema], default: [] })
  documents: StudentDocument_[];

  // ── Flags ──────────────────────────────────────────────────
  @Prop({ default: false }) siblingInSchool: boolean;
  @Prop({ type: [String], default: [] }) siblingIds: string[];
  @Prop({ default: false }) specialNeeds: boolean;
  @Prop({ default: false }) scholarshipHolder: boolean;
  @Prop() scholarshipDetail: string;
  @Prop({ default: false }) transportRequired: boolean;
  @Prop() transportRoute: string;
  @Prop({ default: false }) hostelResident: boolean;

  // ── Status ─────────────────────────────────────────────────
  @Prop({
    enum: ['active', 'inactive', 'graduated', 'transferred', 'expelled', 'on_leave'],
    default: 'active',
  })
  status: string;

  @Prop() leftDate: Date;
  @Prop() leftReason: string;
  @Prop() transferCertificateIssued: boolean;

  // ── Family Linking ──────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'Family' }) familyId: Types.ObjectId;
  @Prop() familyCode: string; // denormalized for fast list display

  // ── Multi-tenancy ──────────────────────────────────────────
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop() campusId: string;
}

export const StudentSchema = SchemaFactory.createForClass(Student);

// Indexes
StudentSchema.index({ schoolSlug: 1, currentGrade: 1 });
StudentSchema.index({ schoolSlug: 1, status: 1 });
StudentSchema.index({ schoolSlug: 1, currentAcademicYear: 1 });
StudentSchema.index({ studentId: 1 }, { unique: true });
StudentSchema.index({
  firstName: 'text', lastName: 'text', studentId: 'text',
});

// Auto-generate studentId
StudentSchema.pre('validate', async function () {
  if (this.isNew && !this.studentId) {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    this.studentId = `STU-${year}-${random}`;
  }
});
