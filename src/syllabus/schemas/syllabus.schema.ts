import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// SYLLABUS - unified design + tracking
// Previously split across two disconnected collections:
//   - academics' `syllabi` (design only: units/topics, objectives,
//     assessment breakdown, approval workflow) - no tracking at all
//   - teaching's `syllabusCoverage` (tracking only: chapter-level
//     coverage %, on_track/behind status) - no design detail at all
// A teacher marking progress and a coordinator reviewing "the syllabus"
// were never looking at the same data. This merges both into one real
// document per grade+section+subject+year+term: the design lives on each
// topic, and so does its own coverage state - one source of truth for
// designing, tracking, reporting, and the dashboard.
// ============================================================

@Schema({ _id: false })
export class SyllabusTopic {
  @Prop({ required: true }) topicNo: number;
  @Prop({ required: true }) topicName: string;
  @Prop() description: string;
  @Prop({ type: [String], default: [] }) learningObjectives: string[];
  @Prop({ type: [String], default: [] }) sloReferences: string[];
  @Prop() assessmentType: string;
  @Prop() pageFrom: number;
  @Prop() pageTo: number;
  @Prop({ default: 1 }) estimatedLessons: number;

  // ── Tracking (merged in from the old SyllabusCoverage collection) ──
  @Prop({ default: false }) isCovered: boolean;
  @Prop() coveredDate: Date;
  @Prop() coveredBy: string; // teacher name
  @Prop() actualLessonsUsed: number;
  @Prop() notes: string;
}
export const SyllabusTopicSchema = SchemaFactory.createForClass(SyllabusTopic);

@Schema({ _id: false })
export class SyllabusUnit {
  @Prop({ required: true }) unitNo: number;
  @Prop({ required: true }) unitName: string;
  @Prop({ default: 0 }) weeks: number;
  @Prop({ default: 0 }) periods: number;
  @Prop({ type: [SyllabusTopicSchema], default: [] }) topics: SyllabusTopic[];
}
export const SyllabusUnitSchema = SchemaFactory.createForClass(SyllabusUnit);

export type SyllabusDocument = Syllabus & Document;

@Schema({ timestamps: true, collection: 'syllabi' })
export class Syllabus {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  // Denormalized from the creating teacher's own campus at creation time
  // (same convention as Teaching module's LessonPlan/Assignment) - a
  // syllabus tracked at one campus's Grade 6 Section A is a genuinely
  // separate coverage record from another campus's, even if the subject
  // name and grade level string happen to match.
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;

  // ── Design ──────────────────────────────────────────────────
  @Prop({ required: true }) subjectName: string;
  @Prop({ type: Types.ObjectId, ref: 'Subject' }) subjectId: Types.ObjectId;
  @Prop({ required: true }) gradeLevel: string;
  @Prop() sectionName: string; // blank/undefined = applies to all sections of this grade
  @Prop({ required: true }) academicYearLabel: string;
  @Prop() term: string; // Term 1, Term 2, Term 3
  @Prop({ enum: ['cambridge', 'ib', 'national', 'american', 'custom'], default: 'national' }) framework: string;
  @Prop() recommendedTextbook: string;
  @Prop() publisherName: string;
  @Prop() edition: string;
  @Prop({ default: 0 }) totalWeeks: number;
  @Prop({ default: 0 }) totalPeriods: number;
  @Prop({ type: [SyllabusUnitSchema], default: [] }) units: SyllabusUnit[];
  @Prop({
    type: {
      midTerm: { type: Number, default: 30 },
      finalExam: { type: Number, default: 50 },
      classwork: { type: Number, default: 10 },
      homework: { type: Number, default: 10 },
    },
    default: {},
  })
  assessmentBreakdown: { midTerm: number; finalExam: number; classwork: number; homework: number };

  // ── Teacher assignment (merged in from SyllabusCoverage) ───────
  @Prop({ type: Types.ObjectId, ref: 'Staff' }) teacherId: Types.ObjectId;
  @Prop() teacherName: string;

  // ── Tracking rollup (cached summary, kept in sync on every topic
  // update - fast dashboard/report queries without recomputing from
  // every topic on every read) ──────────────────────────────────
  @Prop({ default: 0 }) totalTopics: number;
  @Prop({ default: 0 }) coveredTopics: number;
  @Prop({ default: 0 }) coveragePct: number;
  @Prop({ enum: ['not_started', 'on_track', 'behind', 'completed'], default: 'not_started' }) trackStatus: string;
  @Prop() lastTrackedAt: Date;

  // ── Approval workflow ───────────────────────────────────────
  @Prop({ enum: ['draft', 'active', 'approved', 'archived'], default: 'draft' }) status: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
  @Prop() createdByName: string;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;
}

export const SyllabusSchema = SchemaFactory.createForClass(Syllabus);
SyllabusSchema.index({ tenantId: 1, gradeLevel: 1, sectionName: 1, subjectName: 1, academicYearLabel: 1, term: 1 });
SyllabusSchema.index({ tenantId: 1, status: 1 });
SyllabusSchema.index({ tenantId: 1, teacherId: 1 });
SyllabusSchema.index({ tenantId: 1, trackStatus: 1 });
