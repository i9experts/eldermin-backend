import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CURRICULUM_FRAMEWORKS } from '../../common/constants/curriculum-framework';

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
export class SyllabusSubTopic {
  @Prop({ required: true }) subTopicNo: number;
  @Prop({ required: true }) subTopicName: string;
  @Prop() description: string;
  // Which week of the real term this is planned for (1-based, computed
  // against AcademicYear.terms[].startDate - not a separate, invented
  // week-numbering system). Left unset means not yet scheduled.
  @Prop() plannedWeek: number;

  @Prop({ default: false }) isCovered: boolean;
  @Prop() coveredDate: Date;
  @Prop() coveredBy: string;
  @Prop() notes: string;
}
export const SyllabusSubTopicSchema = SchemaFactory.createForClass(SyllabusSubTopic);

// A single piece of LMS content attached to a syllabus topic - a video
// link, an uploaded document, a reading reference, or an external link.
// Identified by lessonNo (1-based, unique within its topic) rather than a
// Mongo _id, matching this schema's existing topicNo/subTopicNo convention
// so LessonProgress can address a lesson the same composite-key way
// markTopic/markSubTopic already address topics/sub-topics.
@Schema({ _id: false })
export class SyllabusLesson {
  @Prop({ required: true }) lessonNo: number;
  @Prop({ required: true }) title: string;
  @Prop() description: string;
  @Prop({ enum: ['video', 'document', 'reading', 'link'], required: true }) type: string;
  // Video/external link - the frontend detects YouTube/Vimeo URLs and
  // embeds them; anything else renders as a plain "Open link" button. No
  // video is ever hosted by Eldermin itself (see Upload service's 10MB
  // cap/allowlist, which doesn't support video).
  @Prop() url: string;
  // An uploaded document (pdf/doc/image) via the existing Upload service.
  @Prop() fileUrl: string;
  @Prop() fileName: string;
  // When set, SyllabusService.addLesson/updateLesson auto-spawns (and
  // keeps in sync) a real Assignment row in the Teaching module so this
  // lesson surfaces immediately in the already-working Parent Portal
  // "Homework" list - see Assignment.autoSpawnKey.
  @Prop() dueDate?: Date;
  @Prop({ default: 0 }) order: number;
  @Prop() addedBy: string;
  @Prop({ default: Date.now }) addedAt: Date;
}
export const SyllabusLessonSchema = SchemaFactory.createForClass(SyllabusLesson);

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
  @Prop({ type: [SyllabusSubTopicSchema], default: [] }) subTopics: SyllabusSubTopic[];
  @Prop({ type: [SyllabusLessonSchema], default: [] }) lessons: SyllabusLesson[];

  // ── Tracking (merged in from the old SyllabusCoverage collection) ──
  // When subTopics exist, isCovered/coveredDate/coveredBy are DERIVED
  // (all sub-topics covered = topic covered) and kept in sync on every
  // sub-topic update, rather than independently settable - a topic with
  // real sub-topic detail shouldn't be markable as "covered" while a
  // sub-topic underneath it still isn't. Topics with no sub-topics keep
  // working exactly as before (this field is directly settable), so
  // every syllabus created before this change keeps functioning
  // unchanged.
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
  @Prop({ enum: CURRICULUM_FRAMEWORKS, default: 'national' }) framework: string;
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

  // ── LMS: student-facing publish toggle ─────────────────────────
  // Separate from `status` above (which governs the teacher/coordinator
  // planning workflow) - a syllabus can be fully approved for internal
  // tracking purposes while its lesson content still isn't ready to show
  // students, and vice versa. Off by default: a syllabus never becomes
  // visible in Parent Portal "My Courses" just because a teacher started
  // filling in topics.
  @Prop({ default: false }) publishedToStudents: boolean;
  @Prop() publishedAt: Date;
  @Prop() publishedBy: string;
}

export const SyllabusSchema = SchemaFactory.createForClass(Syllabus);
SyllabusSchema.index({ tenantId: 1, gradeLevel: 1, sectionName: 1, subjectName: 1, academicYearLabel: 1, term: 1 });
SyllabusSchema.index({ tenantId: 1, status: 1 });
SyllabusSchema.index({ tenantId: 1, teacherId: 1 });
SyllabusSchema.index({ tenantId: 1, trackStatus: 1 });
SyllabusSchema.index({ tenantId: 1, gradeLevel: 1, publishedToStudents: 1 });
