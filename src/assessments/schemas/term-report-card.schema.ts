// ============================================================
// TERM REPORT CARD — a cumulative, whole-term report per student
// ============================================================
// Distinct from ReportCard (assessment.schema.ts), which is scoped to a
// single exam. This rolls up every assessment in a term's academic
// performance (with a term-wide class position, not a single-exam one)
// plus optional snapshots of Tarbiyah, Qaida/Nazra, attendance, compiled
// teacher feedback and Parent Engagement Score for the same student/term
// - everything a "comprehensive report card" needs in one document,
// generated once and then viewable/printable/publishable like a normal
// report card. Each optional section is only populated when the admin
// chose to include it at generation time (see sectionsIncluded) - a
// school that only wants academics keeps exactly today's experience.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
class TermAssessmentRef {
  @Prop({ type: Types.ObjectId, ref: 'Assessment' }) assessmentId: Types.ObjectId;
  @Prop() title: string;
  @Prop() type: string;
  @Prop() date: Date;
}
const TermAssessmentRefSchema = SchemaFactory.createForClass(TermAssessmentRef);

@Schema({ _id: false })
class TermSubjectSummary {
  @Prop() subject: string;
  @Prop() obtainedMarks: number;
  @Prop() totalMarks: number;
  @Prop() percentage: number;
  @Prop() grade: string;
  @Prop() isAbsent: boolean;
}
const TermSubjectSummarySchema = SchemaFactory.createForClass(TermSubjectSummary);

@Schema({ _id: false })
class TeacherFeedbackEntry {
  // Where this came from - lets the PDF/UI group or icon it, and lets a
  // reader trace a remark back to its source instead of it reading as one
  // anonymous blob of text.
  @Prop({ enum: ['subject_remark', 'tarbiyah', 'behaviour', 'ptm'] }) source: string;
  @Prop() date: Date;
  @Prop() author: string;
  @Prop() subject: string; // only set for source: 'subject_remark'
  @Prop() text: string;
}
const TeacherFeedbackEntrySchema = SchemaFactory.createForClass(TeacherFeedbackEntry);

export type TermReportCardDocument = TermReportCard & Document;

@Schema({ timestamps: true, collection: 'term_report_cards' })
export class TermReportCard {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true, index: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) rollNumber: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop({ required: true }) academicYear: string;
  @Prop({ required: true }) term: string;

  // Which assessments within this academicYear/term fed into the
  // academic summary below - lets the report (and a future admin
  // re-check) show exactly what was combined, not just a final number.
  @Prop({ type: [TermAssessmentRefSchema], default: [] })
  assessmentsIncluded: TermAssessmentRef[];

  @Prop({ type: [TermSubjectSummarySchema], default: [] })
  subjects: TermSubjectSummary[];

  @Prop() totalObtainedMarks: number;
  @Prop() totalMaxMarks: number;
  @Prop() overallPercentage: number;
  @Prop() overallGrade: string;
  @Prop() overallGPA: number;
  @Prop({ enum: ['pass', 'fail'] }) overallResult: string;
  // Term-wide, across every student with a TermReportCard for the same
  // schoolSlug/grade/section/academicYear/term - NOT the same as
  // ReportCard.classPosition, which only ranks within one exam.
  @Prop() classPosition: number;
  @Prop() totalStudents: number;
  @Prop() strongestSubject: string;
  @Prop() weakestSubject: string;

  // Which optional sections were requested at generation time, and
  // whether real data was actually found for each (so the UI/PDF can
  // show "not available" instead of a misleadingly empty section when a
  // school simply hasn't used e.g. Tarbiyah yet).
  @Prop({
    type: Object,
    default: { tarbiyah: false, qaida: false, nazra: false, attendance: false, teacherFeedback: false, parentEngagement: false },
  })
  sectionsIncluded: Record<string, boolean>;

  // Loosely-typed snapshots (same convention as Assessment.gradingScale) -
  // each is a denormalized copy of what BehaviourService/QaidaService/
  // NazraService/StudentsService/ParentEngagementService returned at
  // generation time, not a live reference, so a report once generated
  // reads the same way even if the underlying record changes later.
  @Prop({ type: Object, default: null }) tarbiyah: Record<string, any> | null;
  @Prop({ type: Object, default: null }) qaida: Record<string, any> | null;
  @Prop({ type: Object, default: null }) nazra: Record<string, any> | null;
  @Prop({ type: Object, default: null }) qaidaNazraExtras: Record<string, any> | null;
  @Prop({ type: Object, default: null }) attendance: Record<string, any> | null;
  @Prop({ type: Object, default: null }) parentEngagement: Record<string, any> | null;

  @Prop({ type: [TeacherFeedbackEntrySchema], default: [] })
  teacherFeedback: TeacherFeedbackEntry[];

  // A single authored summary, distinct from the compiled teacherFeedback
  // feed above - same role as ReportCard.classTeacherRemarks/
  // principalRemarks, kept under the same name/permission convention
  // (see AssessmentService.updateReportCardRemarks).
  @Prop() classTeacherRemarks: string;
  @Prop() principalRemarks: string;

  @Prop({ default: false }) published: boolean;
  @Prop() publishedAt: Date;
  @Prop() generatedBy: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const TermReportCardSchema = SchemaFactory.createForClass(TermReportCard);
TermReportCardSchema.index({ studentId: 1, academicYear: 1, term: 1 }, { unique: true });
TermReportCardSchema.index({ schoolSlug: 1, grade: 1, section: 1, academicYear: 1, term: 1 });
