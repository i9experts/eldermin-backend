import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// COMPLAINT / CASE MANAGEMENT WITH SLA
// ============================================================
// A parent/staff/student-facing case system, distinct from the existing
// `support` module (which is Eldermin's own internal platform helpdesk
// for schools contacting Eldermin, not schools handling complaints from
// their own community). Matches EDAP's "Complaint Module" depth: case
// setup, SLA rules by employee/designation, escalation with defined
// durations, re-assignment, remarks, and priority.
// ============================================================

// ── Case Type (setup) ─────────────────────────────────────────
export type ComplaintCaseTypeDocument = ComplaintCaseType & Document;

@Schema({ timestamps: true, collection: 'complaint_case_types' })
export class ComplaintCaseType {
  @Prop({ required: true }) caseGroup: string; // e.g. "Transport", "Academic", "Facilities"
  @Prop({ required: true }) name: string; // e.g. "Bus Delay", "Teacher Conduct"
  @Prop() description: string;
  // SLA rule: how long a case of this type gets before it's overdue -
  // "Service Agreement Level based on Employee/Designation" from EDAP's
  // deck, simplified to a duration-per-case-type (the most common real
  // rule); defaultAssigneeDesignation additionally routes it to the
  // right role by default.
  @Prop({ default: 48 }) slaHours: number;
  @Prop() defaultAssigneeDesignation: string;
  // Escalation ladder: after slaHours * escalationLevels[i].afterMultiplier
  // hours with no resolution, notify escalationLevels[i].notifyDesignation.
  @Prop({
    type: [{ afterHours: Number, notifyDesignation: String, notifyName: String, _id: false }],
    default: [],
  })
  escalationLevels: { afterHours: number; notifyDesignation?: string; notifyName?: string }[];
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const ComplaintCaseTypeSchema = SchemaFactory.createForClass(ComplaintCaseType);
ComplaintCaseTypeSchema.index({ schoolSlug: 1, caseGroup: 1 });

// ── Case ────────────────────────────────────────────────────────

@Schema({ _id: true })
export class CaseRemark {
  @Prop({ required: true }) text: string;
  @Prop({ required: true }) addedBy: string;
  @Prop({ default: Date.now }) addedAt: Date;
}
export const CaseRemarkSchema = SchemaFactory.createForClass(CaseRemark);

@Schema({ _id: true })
export class CaseReassignment {
  @Prop() fromName: string;
  @Prop({ required: true }) toName: string;
  @Prop({ required: true }) reassignedBy: string;
  @Prop({ default: Date.now }) reassignedAt: Date;
  @Prop() reason: string;
}
export const CaseReassignmentSchema = SchemaFactory.createForClass(CaseReassignment);

@Schema({ _id: true })
export class CaseEscalation {
  @Prop({ required: true }) level: number;
  @Prop({ default: Date.now }) escalatedAt: Date;
  @Prop() notifiedName: string;
  @Prop() notificationStatus: string; // honest outcome, matches the pattern used everywhere else
}
export const CaseEscalationSchema = SchemaFactory.createForClass(CaseEscalation);

export type ComplaintCaseDocument = ComplaintCase & Document;

@Schema({ timestamps: true, collection: 'complaint_cases' })
export class ComplaintCase {
  @Prop({ required: true, unique: true }) caseNumber: string; // CASE-2026-0001

  @Prop({ type: Types.ObjectId, ref: 'ComplaintCaseType' }) caseTypeId: Types.ObjectId;
  @Prop({ required: true }) caseGroup: string;
  @Prop({ required: true }) caseType: string;

  @Prop({ required: true }) title: string;
  @Prop({ required: true }) description: string;

  @Prop({ enum: ['parent', 'staff', 'student', 'other'], default: 'parent' }) raisedByType: string;
  @Prop({ required: true }) raisedByName: string;
  @Prop() raisedByPhone: string;
  @Prop() raisedByEmail: string;

  @Prop({ type: Types.ObjectId, ref: 'Student', default: null }) studentId: Types.ObjectId | null;
  @Prop() studentName: string;

  @Prop({ enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' }) priority: string;

  @Prop({ type: Types.ObjectId, ref: 'Staff', default: null }) assignedToId: Types.ObjectId | null;
  @Prop() assignedToName: string;
  @Prop() assignedDesignation: string;

  @Prop({ enum: ['open', 'in_process', 'closed'], default: 'open' }) status: string;

  @Prop({ required: true }) slaHours: number;
  @Prop({ required: true }) dueBy: Date;
  @Prop({ default: 0 }) currentEscalationLevel: number;
  @Prop({ type: [CaseEscalationSchema], default: [] }) escalations: CaseEscalation[];

  @Prop({ type: [CaseRemarkSchema], default: [] }) remarks: CaseRemark[];
  @Prop({ type: [CaseReassignmentSchema], default: [] }) reassignments: CaseReassignment[];

  @Prop() closedAt: Date;
  @Prop() closedBy: string;
  @Prop() resolutionNotes: string;

  @Prop() notifiedAssignmentAt: Date;
  @Prop() notifiedAssignmentStatus: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
}

export const ComplaintCaseSchema = SchemaFactory.createForClass(ComplaintCase);
ComplaintCaseSchema.index({ schoolSlug: 1, status: 1, dueBy: 1 });
ComplaintCaseSchema.index({ schoolSlug: 1, assignedToId: 1, status: 1 });
ComplaintCaseSchema.index({ schoolSlug: 1, priority: 1 });
ComplaintCaseSchema.pre('validate', function () {
  if (this.isNew && !this.caseNumber) {
    const y = new Date().getFullYear();
    const r = Math.floor(1000 + Math.random() * 9000);
    this.caseNumber = `CASE-${y}-${r}`;
  }
});
