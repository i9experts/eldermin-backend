// ============================================================
// ASSESSMENT SCHEMAS — Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// ASSESSMENT (Exam / Test Definition)
// ============================================================
export type AssessmentDocument = Assessment & Document;

@Schema({ _id: false })
export class SubjectConfig {
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) totalMarks: number;
  @Prop({ default: 0 }) passingMarks: number;
  @Prop() examiner: string;
  @Prop() date: Date;
  @Prop() startTime: string;
  @Prop() duration: number; // minutes
  @Prop() venue: string;
}
export const SubjectConfigSchema = SchemaFactory.createForClass(SubjectConfig);

@Schema({ timestamps: true, collection: 'assessments' })
export class Assessment {
  @Prop({ required: true }) title: string;
  @Prop() description: string;

  @Prop({
    enum: ['quiz','class_test','unit_test','mid_term','final_exam',
           'assignment','project','practical','oral'],
    required: true,
  })
  type: string;

  @Prop({ required: true }) grade: string;
  @Prop() section: string; // null = all sections
  @Prop({ required: true }) academicYear: string;
  @Prop() term: string; // Term 1, Term 2, Term 3

  @Prop({ type: [SubjectConfigSchema], default: [] })
  subjects: SubjectConfig[];

  @Prop({ required: true }) startDate: Date;
  @Prop() endDate: Date;

  @Prop({
    enum: ['draft','scheduled','ongoing','completed','result_published','cancelled'],
    default: 'draft',
  })
  status: string;

  @Prop({ default: false }) resultPublished: boolean;
  @Prop() resultPublishedAt: Date;
  @Prop() resultPublishedBy: string;

  @Prop({ default: false }) gradeCardsGenerated: boolean;

  // Grading config
  @Prop({
    type: Object,
    default: {
      'A+': { min: 90, gpa: 4.0 },
      'A':  { min: 80, gpa: 3.7 },
      'B+': { min: 70, gpa: 3.3 },
      'B':  { min: 60, gpa: 3.0 },
      'C':  { min: 50, gpa: 2.0 },
      'D':  { min: 40, gpa: 1.0 },
      'F':  { min: 0,  gpa: 0.0 },
    },
  })
  gradingScale: Record<string, { min: number; gpa: number }>;

  @Prop() createdBy: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
  // Denormalized from the creating user's own campus at creation time,
  // same convention as Syllabus/LessonPlan/BehaviourRecord elsewhere.
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
}

export const AssessmentSchema = SchemaFactory.createForClass(Assessment);
AssessmentSchema.index({ schoolSlug: 1, grade: 1, status: 1 });
AssessmentSchema.index({ schoolSlug: 1, academicYear: 1, type: 1 });
AssessmentSchema.index({ schoolSlug: 1, campusId: 1 });

// ============================================================
// QUESTION BANK
// ============================================================
export type QuestionDocument = Question & Document;

@Schema({ _id: true })
export class QuestionOption {
  @Prop({ required: true }) text: string;
  @Prop({ default: false }) isCorrect: boolean;
}
export const QuestionOptionSchema = SchemaFactory.createForClass(QuestionOption);

@Schema({ timestamps: true, collection: 'question_bank' })
export class Question {
  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) grade: string;
  @Prop() topic: string;
  @Prop() chapter: string;

  @Prop({
    enum: ['mcq','short','long','true_false','fill_blank','matching'],
    required: true,
  })
  type: string;

  @Prop({
    enum: ['remember','understand','apply','analyze','evaluate','create'],
    default: 'understand',
  })
  bloomsLevel: string;

  @Prop({
    enum: ['easy','medium','hard'],
    default: 'medium',
  })
  difficulty: string;

  @Prop({ required: true }) questionText: string;
  @Prop() questionImage: string;

  @Prop({ type: [QuestionOptionSchema], default: [] })
  options: QuestionOption[];

  @Prop() correctAnswer: string;     // for short/long/fill_blank
  @Prop() answerExplanation: string;
  @Prop({ default: 1 }) marks: number;
  @Prop({ type: [String], default: [] }) tags: string[];

  @Prop() addedBy: string;
  @Prop({ default: 0 }) usageCount: number;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
QuestionSchema.index({ schoolSlug: 1, subject: 1, grade: 1 });
QuestionSchema.index({ schoolSlug: 1, topic: 1, difficulty: 1 });

// ============================================================
// MARK ENTRY (Student marks per assessment per subject)
// ============================================================
export type MarkEntryDocument = MarkEntry & Document;

@Schema({ timestamps: true, collection: 'assessment_marks' })
export class MarkEntry {
  @Prop({ type: Types.ObjectId, ref: 'Assessment', required: true })
  assessmentId: Types.ObjectId;

  @Prop({ required: true }) assessmentTitle: string;

  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) rollNumber: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  @Prop({ required: true }) subject: string;
  @Prop({ required: true }) totalMarks: number;
  @Prop() passingMarks: number;

  @Prop({ default: null }) obtainedMarks: number;
  @Prop({ default: false }) isAbsent: boolean;
  @Prop({ default: false }) isExempt: boolean;

  @Prop() percentage: number;
  @Prop() grade_result: string;    // A+, A, B+...
  @Prop() gpa: number;
  @Prop({ enum: ['pass','fail','absent','exempt'] }) result: string;

  @Prop() remarks: string;
  @Prop() enteredBy: string;
  @Prop() verifiedBy: string;
  @Prop({ default: false }) verified: boolean;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const MarkEntrySchema = SchemaFactory.createForClass(MarkEntry);
MarkEntrySchema.index({ assessmentId: 1, studentId: 1, subject: 1 }, { unique: true });
MarkEntrySchema.index({ schoolSlug: 1, grade: 1, subject: 1 });
MarkEntrySchema.index({ studentId: 1, academicYear: 1 });

// ============================================================
// REPORT CARD (Aggregated per student per assessment)
// ============================================================
export type ReportCardDocument = ReportCard & Document;

@Schema({ _id: true })
class SubjectReport {
  @Prop() subject: string;
  @Prop() totalMarks: number;
  @Prop() obtainedMarks: number;
  @Prop() percentage: number;
  @Prop() grade: string;
  @Prop() gpa: number;
  @Prop() result: string;
  @Prop() remarks: string;
}
const SubjectReportSchema = SchemaFactory.createForClass(SubjectReport);

@Schema({ timestamps: true, collection: 'report_cards' })
export class ReportCard {
  @Prop({ type: Types.ObjectId, ref: 'Assessment', required: true })
  assessmentId: Types.ObjectId;

  @Prop({ required: true }) assessmentTitle: string;
  @Prop({ required: true }) assessmentType: string;

  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) rollNumber: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop() academicYear: string;
  @Prop() term: string;

  @Prop({ type: [SubjectReportSchema], default: [] })
  subjects: SubjectReport[];

  // Aggregated
  @Prop() totalMaxMarks: number;
  @Prop() totalObtainedMarks: number;
  @Prop() overallPercentage: number;
  @Prop() overallGrade: string;
  @Prop() overallGPA: number;
  @Prop({ enum: ['pass', 'fail'] }) overallResult: string;
  @Prop() classPosition: number;
  @Prop() totalStudents: number;

  // Teacher comments
  @Prop() classTeacherRemarks: string;
  @Prop() principalRemarks: string;

  @Prop({ default: false }) published: boolean;
  @Prop() publishedAt: Date;

  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const ReportCardSchema = SchemaFactory.createForClass(ReportCard);
ReportCardSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });
ReportCardSchema.index({ schoolSlug: 1, grade: 1, academicYear: 1 });
