import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ── Policy ────────────────────────────────────────────────────
export type PolicyDocument = Policy & Document;

@Schema({ timestamps: true, collection: 'compliance_policies' })
export class Policy {
  @Prop({ required: true }) title: string;
  @Prop() description: string;
  @Prop({
    enum: ['hr', 'academic', 'safeguarding', 'data_privacy',
           'health_safety', 'financial', 'it', 'general'],
    required: true,
  })
  category: string;
  @Prop() policyNumber: string;
  @Prop() version: string;
  @Prop() content: string;
  @Prop() fileUrl: string;
  @Prop() fileKey: string;
  @Prop() effectiveDate: Date;
  @Prop() reviewDate: Date;
  @Prop() expiryDate: Date;
  @Prop({
    enum: ['draft', 'active', 'under_review', 'archived', 'expired'],
    default: 'draft',
  })
  status: string;
  @Prop() owner: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) ownerId: Types.ObjectId;
  @Prop({ default: false }) requiresAcknowledgement: boolean;
  @Prop({ default: 0 }) acknowledgedCount: number;
  @Prop({ default: 0 }) totalStaff: number;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const PolicySchema = SchemaFactory.createForClass(Policy);
PolicySchema.index({ schoolSlug: 1, category: 1, status: 1 });

// ── PolicyAcknowledgement ─────────────────────────────────────
export type PolicyAcknowledgementDocument = PolicyAcknowledgement & Document;

@Schema({ timestamps: true, collection: 'policy_acknowledgements' })
export class PolicyAcknowledgement {
  @Prop({ type: Types.ObjectId, ref: 'Policy', required: true }) policyId: Types.ObjectId;
  @Prop({ required: true }) policyTitle: string;
  @Prop({ required: true }) staffId: string;
  @Prop({ required: true }) staffName: string;
  @Prop({ required: true }) acknowledgedAt: Date;
  @Prop() comments: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const PolicyAcknowledgementSchema = SchemaFactory.createForClass(PolicyAcknowledgement);

// ── SafeguardingCase ──────────────────────────────────────────
export type SafeguardingCaseDocument = SafeguardingCase & Document;

@Schema({ timestamps: true, collection: 'safeguarding_cases' })
export class SafeguardingCase {
  @Prop({ required: true, unique: true }) caseNumber: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) description: string;
  @Prop({
    enum: ['physical', 'emotional', 'sexual', 'neglect',
           'bullying', 'cyberbullying', 'radicalisation', 'other'],
    required: true,
  })
  type: string;
  @Prop({ enum: ['low', 'medium', 'high', 'critical'], default: 'medium' }) severity: string;
  @Prop() studentName: string;
  @Prop({ type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop() studentGrade: string;
  @Prop() reportedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) reportedById: Types.ObjectId;
  @Prop({ required: true }) reportedDate: Date;
  @Prop() assignedTo: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assignedToId: Types.ObjectId;
  @Prop({
    enum: ['open', 'under_investigation', 'referred_external',
           'resolved', 'closed', 'escalated'],
    default: 'open',
  })
  status: string;
  @Prop() actionsTaken: string;
  @Prop() externalReferral: string;
  @Prop() externalAgency: string;
  @Prop({ default: false }) parentNotified: boolean;
  @Prop() parentNotifiedDate: Date;
  @Prop({ default: false }) policeInvolved: boolean;
  @Prop({ default: false }) socialServicesInvolved: boolean;
  @Prop() resolutionDate: Date;
  @Prop() resolutionNotes: string;
  @Prop({ default: false }) confidential: boolean;
  @Prop({ type: [String], default: [] }) attachments: string[];
  @Prop({ type: [{ date: Date, note: String, addedBy: String }], default: [] })
  progressNotes: { date: Date; note: string; addedBy: string }[];
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const SafeguardingCaseSchema = SchemaFactory.createForClass(SafeguardingCase);
SafeguardingCaseSchema.index({ schoolSlug: 1, status: 1, severity: 1 });
SafeguardingCaseSchema.pre('validate', function () {
  if (this.isNew && !this.caseNumber) {
    const y = new Date().getFullYear();
    const r = Math.floor(100 + Math.random() * 900);
    this.caseNumber = `SC-${y}-${r}`;
  }
});

// ── AuditLog ──────────────────────────────────────────────────
export type AuditLogDocument = AuditLog & Document;

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) module: string;
  @Prop() resourceType: string;
  @Prop() resourceId: string;
  @Prop() resourceTitle: string;
  @Prop() performedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) performedById: Types.ObjectId;
  @Prop() ipAddress: string;
  @Prop() userAgent: string;
  @Prop() oldValue: string;
  @Prop() newValue: string;
  @Prop({ enum: ['create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'other'] }) type: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ schoolSlug: 1, createdAt: -1 });
AuditLogSchema.index({ schoolSlug: 1, performedBy: 1 });
AuditLogSchema.index({ schoolSlug: 1, module: 1 });

// ── Accreditation ─────────────────────────────────────────────
export type AccreditationDocument = Accreditation & Document;

@Schema({ _id: true })
class AccreditationRequirement {
  @Prop({ required: true }) title: string;
  @Prop() description: string;
  @Prop({ enum: ['not_started', 'in_progress', 'completed', 'not_applicable'], default: 'not_started' }) status: string;
  @Prop() evidence: string;
  @Prop() evidenceUrl: string;
  @Prop() dueDate: Date;
  @Prop() completedDate: Date;
  @Prop() assignedTo: string;
  @Prop({ default: false }) isMandatory: boolean;
}
const AccreditationRequirementSchema = SchemaFactory.createForClass(AccreditationRequirement);

@Schema({ timestamps: true, collection: 'accreditations' })
export class Accreditation {
  @Prop({ required: true }) name: string;
  @Prop() body: string;
  @Prop() description: string;
  @Prop({
    enum: ['not_started', 'preparing', 'submitted', 'under_review',
           'accredited', 'conditionally_accredited', 'not_accredited', 'expired'],
    default: 'not_started',
  })
  status: string;
  @Prop() applicationDate: Date;
  @Prop() inspectionDate: Date;
  @Prop() decisionDate: Date;
  @Prop() expiryDate: Date;
  @Prop() nextReviewDate: Date;
  @Prop({ default: 0 }) overallScore: number;
  @Prop({ default: 0 }) readinessPercentage: number;
  @Prop({ type: [AccreditationRequirementSchema], default: [] }) requirements: AccreditationRequirement[];
  @Prop() inspector: string;
  @Prop() notes: string;
  @Prop() certificateUrl: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const AccreditationSchema = SchemaFactory.createForClass(Accreditation);
