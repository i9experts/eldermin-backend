// ============================================================
// APPLICANT SCHEMA — Admission Lifecycle
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApplicantDocument = Applicant & Document;

export type ApplicationStatus =
  | 'draft' | 'submitted' | 'under_review' | 'shortlisted'
  | 'waitlisted' | 'accepted' | 'rejected' | 'withdrawn';

export type ApplicationStage =
  | 'application' | 'document_review' | 'entrance_test'
  | 'interview' | 'decision' | 'enrollment';

// ── Nested: Document ──────────────────────────────────────────
@Schema({ _id: true })
export class SubmittedDocument {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) type: string;
  @Prop({
    enum: ['pending', 'verified', 'rejected', 'expired'],
    default: 'pending',
  })
  status: string;
  @Prop({ default: Date.now }) uploadedAt: Date;
  @Prop() verifiedBy: string;
  @Prop() remarks: string;
  @Prop() fileUrl: string;
}
export const SubmittedDocumentSchema = SchemaFactory.createForClass(SubmittedDocument);

// ── Main: Applicant ───────────────────────────────────────────
@Schema({ timestamps: true, collection: 'admission_applicants' })
export class Applicant {
  @Prop({ required: true, unique: true })
  applicationNumber: string;

  // Student Personal Info
  @Prop({ required: true, trim: true }) firstName: string;
  @Prop({ required: true, trim: true }) lastName: string;
  @Prop({ required: true }) dateOfBirth: Date;
  @Prop({ enum: ['male', 'female'], required: true }) gender: string;
  @Prop({ default: 'Pakistani' }) nationality: string;
  @Prop() religion: string;

  // Academic Info
  @Prop({ required: true }) gradeApplied: string;
  @Prop() previousSchool: string;
  @Prop() previousGrade: string;
  @Prop() lastGPA: string;

  // Guardian Info
  @Prop({ required: true }) fatherName: string;
  @Prop() motherName: string;
  @Prop({ required: true }) guardianPhone: string;
  @Prop({ lowercase: true, trim: true }) guardianEmail: string;
  @Prop() address: string;
  @Prop() city: string;

  // Status & Stage
  @Prop({
    enum: ['draft','submitted','under_review','shortlisted',
           'waitlisted','accepted','rejected','withdrawn'],
    default: 'draft',
  })
  status: ApplicationStatus;

  @Prop({
    enum: ['application','document_review','entrance_test',
           'interview','decision','enrollment'],
    default: 'application',
  })
  stage: ApplicationStage;

  // Documents
  @Prop({ type: [SubmittedDocumentSchema], default: [] })
  documents: SubmittedDocument[];

  // Relations
  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  leadId: Types.ObjectId;

  @Prop() assignedTo: string;
  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedToId: Types.ObjectId;

  // Flags
  @Prop({ default: false }) siblingInSchool: boolean;
  @Prop({ default: false }) specialNeeds: boolean;
  @Prop() specialNeedsDetail: string;

  @Prop() notes: string;
  @Prop() submittedAt: Date;

  // Decision
  @Prop() decisionDate: Date;
  @Prop() decisionBy: string;
  @Prop() rejectionReason: string;

  // Multi-tenancy
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
  @Prop() campusId: string;
  @Prop({ default: true }) isActive: boolean;
}

export const ApplicantSchema = SchemaFactory.createForClass(Applicant);

// Indexes
ApplicantSchema.index({ schoolSlug: 1, status: 1 });
ApplicantSchema.index({ schoolSlug: 1, stage: 1 });
ApplicantSchema.index({ schoolSlug: 1, gradeApplied: 1 });
ApplicantSchema.index({ schoolSlug: 1, academicYear: 1 });
ApplicantSchema.index({ applicationNumber: 1 }, { unique: true });

// Auto-generate applicationNumber before save
ApplicantSchema.pre('validate', async function () {
  if (this.isNew && !this.applicationNumber) {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    this.applicationNumber = `APP-${year}-${random}`;
  }
});
