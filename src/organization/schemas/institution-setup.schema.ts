// ============================================================
// INSTITUTION SETUP SCHEMAS — Board Members, Committees,
// Meetings, Workflows | Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// BOARD MEMBER
// ============================================================
export type BoardMemberDocument = BoardMember & Document;

@Schema({ timestamps: true, collection: 'board_members' })
export class BoardMember {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) firstName: string;
  @Prop({ required: true }) lastName: string;
  @Prop({ lowercase: true, trim: true }) email: string;
  @Prop() phone: string;
  @Prop() profilePhotoUrl: string;
  @Prop() biography: string;
  @Prop({ enum: ['male', 'female', 'other', 'prefer_not_to_say'] }) gender: string;

  @Prop({
    required: true,
    enum: ['chair', 'vice-chair', 'secretary', 'treasurer', 'member'],
    default: 'member',
  })
  boardRole: string;

  // The fundamental international governance classification (OECD
  // Principles / UK Corporate Governance Code) — determines conflict-of-
  // interest exposure and is central to board composition disclosures.
  // Independent = no material relationship with the organization beyond
  // the directorship itself; Executive = also holds a management role;
  // Non-Executive = neither independent nor an executive (e.g. a founder
  // or major donor's representative).
  @Prop({ enum: ['independent', 'non_executive', 'executive'], default: 'non_executive' })
  directorType: string;

  @Prop() designation: string;

  // Structured term tracking replaces a free-text 'tenure' string — this
  // is what actually enables term-limit enforcement and expiration alerts,
  // both standard governance-code requirements.
  @Prop() appointedDate: Date;
  @Prop() termStartDate: Date;
  @Prop() termEndDate: Date;
  @Prop({ default: 1 }) termNumber: number;

  @Prop({ type: [String], default: [] })
  expertiseAreas: string[]; // e.g. Finance, Legal, Education, Fundraising, HR, Marketing, Audit

  // Annual conflict-of-interest declaration — a standard requirement under
  // most nonprofit/trust and corporate governance codes, not optional
  // paperwork.
  @Prop({ default: false }) conflictOfInterestDeclared: boolean;
  @Prop() conflictOfInterestDetails: string;
  @Prop() conflictOfInterestDate: Date;

  @Prop({ default: false }) codeOfConductSigned: boolean;
  @Prop() codeOfConductSignedDate: Date;
  @Prop({ default: false }) orientationCompleted: boolean;

  @Prop({ default: true }) isVoluntary: boolean;
  @Prop() annualRemuneration: number;

  @Prop({ enum: ['active', 'inactive', 'resigned', 'term_expired'], default: 'active' })
  status: string;

  @Prop() notes: string;
}

export const BoardMemberSchema = SchemaFactory.createForClass(BoardMember);
BoardMemberSchema.index({ schoolSlug: 1, status: 1 });

// ============================================================
// COMMITTEE
// ============================================================
export type CommitteeDocument = Committee & Document;

@Schema({ timestamps: true, collection: 'committees' })
export class Committee {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) name: string;

  @Prop({
    required: true,
    enum: ['academic', 'finance', 'disciplinary', 'examination', 'sports', 'other'],
    default: 'other',
  })
  type: string;

  @Prop() purpose: string;
  @Prop() chairperson: string;
  @Prop({
    type: [{ name: String, phone: String, email: String, whatsapp: String }],
    default: [],
  })
  members: { name: string; phone?: string; email?: string; whatsapp?: string }[];
  @Prop() establishedDate: Date;

  @Prop({ enum: ['active', 'inactive'], default: 'active' })
  status: string;

  @Prop() meetingFrequency: string;
}

export const CommitteeSchema = SchemaFactory.createForClass(Committee);
CommitteeSchema.index({ schoolSlug: 1, status: 1 });

// ============================================================
// MEETING
// ============================================================
export type MeetingDocument = Meeting & Document;

@Schema({ _id: false })
export class AgendaItem {
  @Prop({ required: true }) order: number;
  @Prop({ required: true }) topic: string;
  @Prop() description: string;
  @Prop() presenter: string;
  @Prop() durationMinutes: number;
  @Prop({ enum: ['discussion', 'decision', 'information', 'update'], default: 'discussion' })
  itemType: string;
}
export const AgendaItemSchema = SchemaFactory.createForClass(AgendaItem);

// ── Meeting Minutes (structured, linked 1:1 to a Meeting) ──────────────
// A real governance minutes record, not the free-text `minutes` string
// above (kept untouched for backward compatibility with meetings recorded
// before this existed). Embedded on Meeting rather than a separate
// collection — it's always read/written alongside its one meeting, never
// queried independently across meetings.
@Schema({ _id: false })
export class MinutesAttendee {
  @Prop({ required: true }) name: string;
  @Prop({ enum: ['present', 'absent', 'apologies'], default: 'present' })
  attendanceStatus: string;
  // 'invited' = was on the original meeting.attendees list; 'adhoc' = showed
  // up without being invited; 'guest' = an observer/guest, not a voting
  // participant.
  @Prop({ enum: ['invited', 'adhoc', 'guest'], default: 'invited' })
  kind: string;
}
export const MinutesAttendeeSchema = SchemaFactory.createForClass(MinutesAttendee);

@Schema({ _id: false })
export class AgendaItemMinutes {
  // Matches an AgendaItem.order on the same meeting — not a Mongo ref,
  // since agenda items are embedded subdocuments with no stable _id of
  // their own (schema above uses `{ _id: false }`).
  @Prop({ required: true }) agendaItemOrder: number;
  // Denormalized so minutes stay readable even if the agenda item itself
  // is later edited or removed from the meeting.
  @Prop() topic: string;
  @Prop() discussion: string;
  @Prop() decision: string;
  @Prop({ enum: ['none', 'unanimous', 'by_consensus', 'by_vote'], default: 'none' })
  voteOutcome: string;
  @Prop() votesFor: number;
  @Prop() votesAgainst: number;
  @Prop() votesAbstain: number;
}
export const AgendaItemMinutesSchema = SchemaFactory.createForClass(AgendaItemMinutes);

@Schema({ _id: false })
export class MinutesActionItem {
  @Prop({ required: true }) description: string;
  @Prop() assignedTo: string;
  @Prop() dueDate: Date;
  @Prop({ enum: ['open', 'in_progress', 'done'], default: 'open' }) status: string;
}
export const MinutesActionItemSchema = SchemaFactory.createForClass(MinutesActionItem);

@Schema({ _id: false })
export class MeetingMinutes {
  @Prop({ type: [MinutesAttendeeSchema], default: [] }) attendance: MinutesAttendee[];
  @Prop() calledToOrder: string; // e.g. "10:05 AM" — free text, not every school tracks this to the minute
  @Prop() adjournedAt: string;
  @Prop({ enum: ['met', 'not_met', 'not_applicable'], default: 'not_applicable' })
  quorumStatus: string;
  @Prop() quorumNote: string; // e.g. "6 of 9 members present, quorum of 5 required"
  @Prop({ type: [AgendaItemMinutesSchema], default: [] }) itemMinutes: AgendaItemMinutes[];
  @Prop({ type: [MinutesActionItemSchema], default: [] }) actionItems: MinutesActionItem[];
  @Prop() generalNotes: string;
  @Prop() nextMeetingDate: Date;
  @Prop() recordedBy: string;
  @Prop() recordedAt: Date;
  // Lightweight, self-contained approval status — deliberately NOT routed
  // through the generic Workflow engine above (that's a multi-step
  // approval-chain *builder* for Finance/HR/Admissions/Procurement/
  // Documents triggers; minutes approval is a single draft→approved
  // transition by the chair, which a workflow definition would be pure
  // overhead for).
  @Prop({ enum: ['draft', 'pending_approval', 'approved'], default: 'draft' })
  status: string;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;
}
export const MeetingMinutesSchema = SchemaFactory.createForClass(MeetingMinutes);

@Schema({ timestamps: true, collection: 'meetings' })
export class Meeting {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) title: string;

  @Prop({ type: Types.ObjectId, ref: 'Committee' }) committeeId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['board', 'committee', 'staff', 'parent', 'emergency', 'other'],
    default: 'other',
  })
  type: string;

  @Prop({ enum: ['regular', 'emergency', 'special', 'agm'], default: 'regular' })
  category: string;

  @Prop({ required: true }) scheduledAt: Date;
  @Prop({ default: 60 }) durationMinutes: number;

  @Prop({ enum: ['in_person', 'virtual', 'hybrid'], default: 'in_person' })
  mode: string;
  @Prop() venue: string;
  @Prop() meetingLink: string;

  @Prop() chairperson: string;
  @Prop() minuteTaker: string;

  // Kept as a simple optional overview/summary alongside the structured
  // items below — some meetings genuinely just need a one-line agenda,
  // and this also preserves what already existed on older meetings.
  @Prop() agenda: string;
  @Prop({ type: [AgendaItemSchema], default: [] }) agendaItems: AgendaItem[];

  @Prop({ type: [String], default: [] }) attendees: string[];

  @Prop({ enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' })
  status: string;

  // Kept as-is for backward compatibility with meetings recorded before
  // the structured minutes recorder below existed — still readable, never
  // migrated or overwritten.
  @Prop() minutes: string;
  @Prop({ type: [String], default: [] }) actionItems: string[];

  @Prop({ type: MeetingMinutesSchema }) meetingMinutes?: MeetingMinutes;
}

export const MeetingSchema = SchemaFactory.createForClass(Meeting);
MeetingSchema.index({ schoolSlug: 1, type: 1 });
MeetingSchema.index({ schoolSlug: 1, scheduledAt: 1 });

// ============================================================
// WORKFLOW
// ============================================================
export type WorkflowDocument = Workflow & Document;

@Schema({ _id: false })
class WorkflowStep {
  @Prop({ required: true }) order: number;
  @Prop({ required: true }) approverRole: string;
  @Prop() sla: string;
  // What the approver at this step needs to check before deciding —
  // a real BPM completeness practice (a step without a clear checklist
  // is just a name in a chain, not an actual defined process).
  @Prop({ type: [String], default: [] }) requiredChecks: string[];
  @Prop({ default: false }) notifyByEmail: boolean;
}
const WorkflowStepSchema = SchemaFactory.createForClass(WorkflowStep);

@Schema({ timestamps: true, collection: 'workflows' })
export class Workflow {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ required: true }) name: string;

  @Prop({
    required: true,
    enum: ['Finance', 'HR', 'Admissions', 'Procurement', 'Documents'],
  })
  module: string;

  @Prop() trigger: string;
  @Prop({ type: [WorkflowStepSchema], default: [] }) steps: WorkflowStep[];
  @Prop() sla: string;

  // Governance/version tracking, same convention as Policy documents —
  // a workflow definition changing over time should leave a trail, not
  // silently overwrite what people were trained on.
  @Prop({ default: '1.0' }) version: string;
  @Prop() escalationContact: string;
  @Prop() escalationAfter: string; // e.g. "48h past SLA"

  @Prop({ enum: ['active', 'inactive'], default: 'active' })
  status: string;

  @Prop() description: string;
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
WorkflowSchema.index({ schoolSlug: 1, module: 1 });

// ============================================================
// AUTHORITY DELEGATION
// A named person temporarily hands their approval authority to someone
// else for a defined period (e.g. Principal delegates to Vice Principal
// while traveling) - without permanently changing anyone's actual role.
// "active"/"revoked" is the only stored status; whether a delegation has
// naturally expired is computed from endDate at read time rather than
// needing a scheduled job to flip a stored value.
// ============================================================
export type AuthorityDelegationDocument = AuthorityDelegation & Document;

@Schema({ timestamps: true, collection: 'authority_delegations' })
export class AuthorityDelegation {
  @Prop({ required: true }) delegatorName: string;
  @Prop() delegatorRole: string;
  @Prop({ required: true }) delegateName: string;
  @Prop() delegateRole: string;
  @Prop({ required: true }) scope: string; // e.g. "All Approvals", "Finance", "HR"
  @Prop() reason: string; // e.g. "Annual Leave", "Hajj/Umrah", "Travel"
  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) endDate: Date;
  @Prop({ enum: ['active', 'revoked'], default: 'active' }) status: string;
  @Prop() revokedAt: Date;
  @Prop() revokedBy: string;
  @Prop({ required: true }) createdBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const AuthorityDelegationSchema = SchemaFactory.createForClass(AuthorityDelegation);
AuthorityDelegationSchema.index({ schoolSlug: 1, status: 1 });
