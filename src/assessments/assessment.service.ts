// ============================================================
// ASSESSMENT SERVICE — Eldermin ERP | NestJS
// ============================================================

import { teacherScopeVerdict } from '../auth/teacher-scope-verdict';
import { mayTeacherAccessClassSubject } from '../staff-portal/teacher-class-access.util';
import { notifyGuardiansOfStudents } from '../common/utils/notify-guardians.util';
import { assertValidObjectId } from '../common/utils/object-id.util';
import { TEACHING_ADMIN_ROLES } from '../auth/role-sets';
import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException, BadGatewayException, InternalServerErrorException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import * as bwipjs from 'bwip-js';
import * as fs from 'fs';
import { randomBytes } from 'crypto';
import { PdfService } from '../pdf/pdf.service';
import { GamificationService } from '../gamification/gamification.service';

// Base64-encoded once at module load, not per-request - the file is read
// and re-encoded on every PDF generation otherwise, for a font that never
// changes. Embedding it as a data: URI inside the generated HTML is what
// makes real Nastaliq rendering work regardless of what fonts (if any)
// are installed on the Puppeteer/Chromium host - unlike the Noto Sans/
// Naskh Arabic fallback below, which relies on the production image's
// `font-noto-arabic` apk package (see Dockerfile) and isn't embedded.
const NOTO_NASTALIQ_URDU_BASE64 = fs.readFileSync(
  require.resolve('@fontsource/noto-nastaliq-urdu/files/noto-nastaliq-urdu-arabic-400-normal.woff2'),
).toString('base64');

import {
  Assessment, AssessmentDocument,
  Question, QuestionDocument,
  MarkEntry, MarkEntryDocument,
  ReportCard, ReportCardDocument,
} from './schemas/assessment.schema';
import { ExamPaper, ExamPaperDocument } from './schemas/exam-paper.schema';
import { OMRAnswerSheet, OMRAnswerSheetDocument } from './schemas/omr-answer-sheet.schema';
import { QuizAttempt, QuizAttemptDocument } from './schemas/quiz-attempt.schema';
import { TermReportCard, TermReportCardDocument } from './schemas/term-report-card.schema';
import { BehaviourService } from '../behaviour/behaviour.service';
import { QaidaService } from '../behaviour/qaida.service';
import { NazraService } from '../behaviour/nazra.service';
import { QaidaNazraExtrasService } from '../behaviour/qaida-nazra-extras.service';
import { StudentsService } from '../students/students.service';
import { ParentEngagementService } from '../parent-engagement/parent-engagement.service';
import { detectOMRAnswers } from './omr-detection.util';
import { UploadService } from '../upload/upload.service';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Campus, Grade, GradeDocument } from '../organization/schemas/organization.schema';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { TeacherProfile, TeacherProfileDocument } from '../modules/teaching/schemas/teacher-profile.schema';
import { isTeacherCaller, resolveTeacherIdentity, teacherClassesOf, teacherSubjectAssignmentsOf, sameSubject, TeacherClassRef, TeacherSubjectClassRef } from '../staff-portal/teacher-identity.util';
import { sameGrade, sameSection } from '../common/utils/class-match.util';
import { GroupInstitution } from '../organization/schemas/group-institution.schema';
import { Subject, SubjectDocument } from '../modules/academics/schemas/subject.schema';
import { resolveCampusScope, ScopedUser } from '../auth/scope.util';
import {
  AnalyticsMarkRow, computeStudentOverallStats, gradeDistribution, classComparison,
  QuizAnswerRow, computeQuizInsights, rankStudentStats,
} from './analytics.util';

import {
  CreateAssessmentDto, UpdateAssessmentDto, AssessmentQueryDto,
  CreateQuestionDto, QuestionQueryDto,
  BulkMarkEntryDto, VerifyMarksDto, MarkQueryDto,
  GenerateReportCardsDto, UpdateReportCardRemarksDto,
  PublishResultDto, ReportCardQueryDto,
  GenerateTermReportCardsDto, TermReportCardQueryDto, PublishTermReportCardsDto,
} from './dto/assessment.dto';

const paged = (page = 1, limit = 20) => ({ skip: (page - 1) * limit, limit });

// Grade from percentage using default scale
const getGrade = (pct: number, scale?: Record<string, any>): { grade: string; gpa: number } => {
  const defaultScale = [
    { grade: 'A+', min: 90, gpa: 4.0 },
    { grade: 'A',  min: 80, gpa: 3.7 },
    { grade: 'B+', min: 70, gpa: 3.3 },
    { grade: 'B',  min: 60, gpa: 3.0 },
    { grade: 'C',  min: 50, gpa: 2.0 },
    { grade: 'D',  min: 40, gpa: 1.0 },
    { grade: 'F',  min: 0,  gpa: 0.0 },
  ];
  for (const entry of defaultScale) {
    if (pct >= entry.min) return { grade: entry.grade, gpa: entry.gpa };
  }
  return { grade: 'F', gpa: 0.0 };
};

export const TEACHER_MARKS_LOCKED_MESSAGE =
  'Results for this assessment are published (or the assessment is cancelled): marks can no longer be changed. Contact an administrator.';

// Shared by bulkEnterMarks and updateMarkEntry so a single mark edited from
// the Mark Sheet (admin's "Edit" action) is scored exactly the same way a
// freshly bulk-entered one is - same percentage rounding, grade scale and
// pass/fail cutoff, no drift between the two entry points.
function computeMarkOutcome(obtainedMarks: number | undefined, isAbsent: boolean | undefined, isExempt: boolean | undefined, totalMarks: number, passingMarks: number) {
  if (isAbsent) return { percentage: undefined, grade_result: undefined, gpa: undefined, result: 'absent' };
  if (isExempt) return { percentage: undefined, grade_result: undefined, gpa: undefined, result: 'exempt' };
  if (obtainedMarks === undefined || obtainedMarks === null) return { percentage: undefined, grade_result: undefined, gpa: undefined, result: undefined };
  const percentage = parseFloat(((obtainedMarks / totalMarks) * 100).toFixed(1));
  const { grade, gpa } = getGrade(percentage);
  const result = percentage >= ((passingMarks / totalMarks) * 100) ? 'pass' : 'fail';
  return { percentage, grade_result: grade, gpa, result };
}

@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);

  constructor(
    @InjectModel(Assessment.name) private assessmentModel: Model<AssessmentDocument>,
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
    @InjectModel(MarkEntry.name) private markModel: Model<MarkEntryDocument>,
    @InjectModel(ReportCard.name) private reportCardModel: Model<ReportCardDocument>,
    @InjectModel(ExamPaper.name) private examPaperModel: Model<ExamPaperDocument>,
    @InjectModel(OMRAnswerSheet.name) private omrSheetModel: Model<OMRAnswerSheetDocument>,
    @InjectModel(QuizAttempt.name) private quizAttemptModel: Model<QuizAttemptDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel('School') private schoolModel: Model<any>,
    @InjectModel(Campus.name) private campusModel: Model<any>,
    @InjectModel(GroupInstitution.name) private institutionModel: Model<any>,
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
    @InjectModel(Subject.name) private subjectModel: Model<SubjectDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    private configService: ConfigService,
    private pdfService: PdfService,
    private uploadService: UploadService,
    // LMS Phase 5 (gamification) - appended at the end and optional, same
    // convention as StudentsService.behaviourRecordModel, so the existing
    // strictly-typed `new AssessmentService(...)` test construction
    // (exam-paper-error-handling.spec.ts) keeps compiling unchanged.
    @Optional() private gamificationService?: GamificationService,
    // Comprehensive Term Report Card - same trailing-optional convention
    // as gamificationService above, for the same reason (keeps every
    // existing direct `new AssessmentService(...)` test construction,
    // e.g. assessment-test-fakes.ts, compiling with no changes). Always
    // present in the real app via AssessmentModule's imports/forFeature.
    @Optional() @InjectModel(TermReportCard.name) private termReportCardModel?: Model<TermReportCardDocument>,
    @Optional() private behaviourService?: BehaviourService,
    @Optional() private qaidaService?: QaidaService,
    @Optional() private nazraService?: NazraService,
    @Optional() private qaidaNazraExtrasService?: QaidaNazraExtrasService,
    @Optional() private studentsService?: StudentsService,
    @Optional() private parentEngagementService?: ParentEngagementService,
  ) {}

  /** TEACHER callers only: my Staff identity + the classes I teach, resolved from the DB (never the JWT claims). 403 when no Staff record. */
  private async teacherContext(user: any): Promise<{ staffId: string; classes: TeacherClassRef[]; subjectClasses: TeacherSubjectClassRef[]; isClassTeacher: boolean; classTeacherClasses: TeacherClassRef[] }> {
    const me = await resolveTeacherIdentity(this.staffModel, this.teacherProfileModel, user);
    const profile: any = await this.teacherProfileModel.findOne({ staffId: new Types.ObjectId(me.staffId) })
      .select('isClassTeacher classTeacherOfGradeName classTeacherOfSectionName classTeacherAssignments currentAssignments').lean();
    // A teacher can legitimately be class teacher of more than one section
    // (common in Early Years) - classTeacherAssignments holds all of them;
    // falls back to the legacy singular fields for a profile that predates
    // that array and hasn't been touched since.
    const classTeacherClasses: TeacherClassRef[] = profile?.classTeacherAssignments?.length
      ? profile.classTeacherAssignments.map((a: any) => ({ grade: a.gradeName, section: a.sectionName || undefined }))
      : (profile?.isClassTeacher && profile.classTeacherOfGradeName
        ? [{ grade: profile.classTeacherOfGradeName, section: profile.classTeacherOfSectionName || undefined }] : []);
    return {
      staffId: me.staffId,
      classes: teacherClassesOf(profile),
      subjectClasses: teacherSubjectAssignmentsOf(profile),
      isClassTeacher: classTeacherClasses.length > 0,
      classTeacherClasses,
    };
  }

  /**
   * Quiz-attempt scope for the TEACHER role (owner decision 2026-10-07, mirrors the app's isMyAttempt): a CLASS teacher sees/grades ALL
   * subjects of their own class; a SUBJECT teacher only attempts whose class AND subject match one of their currentAssignments; both
   * roles = the union. Grade/section tolerant (class-match.util), subject trim/case/space tolerant. No classes -> nothing.
   */
  private canTeacherAccessAttempt(t: { subjectClasses: TeacherSubjectClassRef[]; classTeacherClasses: TeacherClassRef[] }, a: { grade?: any; section?: any; subject?: any }): boolean {
    if (this.classIncludes(t.classTeacherClasses, a.grade, a.section)) return true;
    return t.subjectClasses.some(c => this.classIncludes([c], a.grade, a.section) && sameSubject(c.subject, a.subject));
  }

  /** An attempt normally stores its section; when it is missing, resolve it from the student's current section (one batched read). */
  private async fillMissingAttemptSections(rows: any[], schoolSlug: string): Promise<any[]> {
    const missing = rows.filter(a => !a.section && a.studentId);
    if (!missing.length || !this.studentModel?.find) return rows;
    const students: any[] = await (this.studentModel as any).find({ _id: { $in: missing.map(a => a.studentId) }, schoolSlug }).select('currentSection').lean();
    const byId = new Map(students.map((s: any) => [String(s._id), s.currentSection]));
    return rows.map(a => (!a.section && byId.get(String(a.studentId)) ? { ...a, section: byId.get(String(a.studentId)) } : a));
  }

  private classIncludes(classes: TeacherClassRef[], grade: any, section: any): boolean {
    return classes.some(c => sameGrade(c.grade, grade) && (!c.section || sameSection(c.section, section)));
  }

  // Same institution/campus resolution as CertificatesService.resolveBranding
  // and IdCardsService - an institution's own name/logo take priority over
  // the raw School document when the assessment's campus belongs to a
  // branded multi-campus group.
  private async resolveBranding(schoolSlug: string, campusId?: any): Promise<{ name: string; logo: string; campusName: string }> {
    const school: any = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    let institutionName: string | undefined, institutionLogo: string | undefined;
    let campusName = '';
    if (campusId) {
      const campus: any = await this.campusModel.findOne({ _id: campusId, schoolSlug }).lean();
      campusName = campus?.name || '';
      if (campus?.institutionId) {
        const inst: any = await this.institutionModel.findOne({ _id: campus.institutionId, schoolSlug }).lean();
        institutionName = inst?.name; institutionLogo = inst?.logoUrl;
      }
    }
    return {
      name: institutionName || school?.name || 'School',
      logo: institutionLogo || school?.logo || '',
      campusName,
    };
  }

  // ============================================================
  // AI BLOOM'S LEVEL CLASSIFICATION
  // Assists a teacher's judgement, never replaces it - the suggested
  // level and reasoning are returned for the teacher to accept or
  // override; nothing is written to the database by this method itself.
  // Same secure server-side proxy pattern already used by
  // AnalyticsService and the ECE AI Observation Assistant - the API key
  // never reaches the browser.
  // ============================================================
  private async callClaude(systemPrompt: string, userMessage: string, maxTokens: number): Promise<string> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new InternalServerErrorException('AI assistance is not configured on this server.');

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
    } catch {
      throw new BadGatewayException('Could not reach the AI assistance service.');
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new BadGatewayException(`AI request failed (${response.status}): ${errBody.slice(0, 200)}`);
    }

    const result = await response.json();
    const textBlock = (result?.content || []).find((b: any) => b.type === 'text');
    return textBlock?.text || '';
  }

  async classifyBloomsLevel(questionText: string, questionType: string, options?: string[]) {
    const systemPrompt = `You classify exam/quiz questions against Bloom's Taxonomy for a K-12 school assessment system.
Return ONLY a JSON object, no markdown, no preamble:
{
  "bloomsLevel": one of "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
  "reasoning": string (1-2 sentences explaining why this level fits, referencing the actual cognitive demand of the question)
}
Bloom's levels, from lowest to highest cognitive demand:
- remember: recall facts, terms, basic concepts (e.g. "What is the capital of France?")
- understand: explain ideas or concepts (e.g. "Explain why plants need sunlight.")
- apply: use information in a new situation (e.g. "Calculate the area of this triangle.")
- analyze: draw connections, compare/contrast, break into parts (e.g. "Compare the causes of two historical events.")
- evaluate: justify a decision or judgement (e.g. "Which solution is more effective, and why?")
- create: produce new or original work (e.g. "Design an experiment to test this hypothesis.")
You are assisting a teacher's professional judgement, not replacing it - classify based on the actual cognitive demand of THIS question, not the subject matter alone.`;

    const userMessage = `Question type: ${questionType}\nQuestion: "${questionText}"${options?.length ? `\nOptions: ${JSON.stringify(options)}` : ''}`;
    const text = await this.callClaude(systemPrompt, userMessage, 200);

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      const validLevels = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
      if (!validLevels.includes(parsed.bloomsLevel)) {
        return { bloomsLevel: null, reasoning: null, note: 'Could not determine a confident classification for this question.' };
      }
      return { bloomsLevel: parsed.bloomsLevel, reasoning: parsed.reasoning || null };
    } catch {
      return { bloomsLevel: null, reasoning: null, note: 'Could not parse a classification this time - try rephrasing the question or set it manually.' };
    }
  }

  // ============================================================
  // EXAM PAPER GENERATION
  // Compiles real Question Bank items into a formatted, printable paper.
  // Urdu/Arabic route through real HTML+Puppeteer rendering (proper RTL
  // and script shaping - pdf-lib genuinely cannot do this correctly, it
  // just places raw glyphs with no ligature/joining support), not the
  // lightweight pdf-lib pipeline used for receipts/challans.
  //
  // Deliberately NOT in scope here: OMR/scan-based auto-grading of
  // answer sheets. That's a real, separate computer-vision undertaking
  // (needs an OMR SDK or custom vision logic, standardized alignment
  // markers, real scanner hardware) - this feature only generates and
  // formats the paper with a real QR code for identification.
  // ============================================================

  private generatePaperCode(): string {
    const rand = randomBytes(3).toString('hex').toUpperCase();
    const stamp = Date.now().toString(36).toUpperCase();
    return `PAPER-${stamp}-${rand}`;
  }

  async createExamPaper(schoolSlug: string, createdBy: string, dto: any) {
    // Every questionId submitted must actually belong to this school - a
    // section's questionIds are only Mongo-ID-shape-validated at the DTO
    // layer, so without this check a guessed/enumerated ObjectId from
    // another tenant would get silently woven into this paper and its
    // question text/options/correct answers later rendered straight into
    // this school's PDF (see getExamPapers/getExamPaperById below, which
    // had the same unscoped-lookup gap on the read side).
    const submittedQuestionIds: string[] = [...new Set((dto.sections || []).flatMap((s: any) => s.questionIds || []) as string[])];
    if (submittedQuestionIds.length > 0) {
      const owned = await this.questionModel.countDocuments({ _id: { $in: submittedQuestionIds }, schoolSlug });
      if (owned !== submittedQuestionIds.length) throw new BadRequestException("One or more selected questions were not found in this school's question bank.");
    }
    const paper = new this.examPaperModel({ ...dto, schoolSlug, createdBy, paperCode: this.generatePaperCode() });
    try {
      return await paper.save();
    } catch (err: any) {
      if (err.name === 'ValidationError' || err.name === 'CastError') throw new BadRequestException(err.message);
      if (err.code === 11000) throw new ConflictException('A paper with this code already exists - please try creating it again.');
      throw err;
    }
  }

  async getExamPapers(schoolSlug: string, query: any) {
    const filter: any = { schoolSlug };
    if (query.subject) filter.subject = query.subject;
    if (query.grade) filter.grade = query.grade;
    const papers = await this.examPaperModel.find(filter).sort({ createdAt: -1 }).lean();
    // Real total marks per paper (sum of actual question marks), not a
    // separately-stored number that could silently drift out of sync
    // with the questions actually in the paper.
    const allQuestionIds = [...new Set(papers.flatMap((p: any) => p.sections.flatMap((s: any) => s.questionIds.map(String))))];
    const questions = await this.questionModel.find({ _id: { $in: allQuestionIds }, schoolSlug }).select('marks').lean();
    const marksById = new Map(questions.map((q: any) => [String(q._id), q.marks]));
    return papers.map((p: any) => ({
      ...p,
      totalMarks: p.sections.reduce((sum: number, s: any) => sum + s.questionIds.reduce((s2: number, qid: any) => s2 + (marksById.get(String(qid)) || 0), 0), 0),
      questionCount: p.sections.reduce((sum: number, s: any) => sum + s.questionIds.length, 0),
    }));
  }

  async getExamPaperById(id: string, schoolSlug: string) {
    const paper: any = await this.examPaperModel.findOne({ _id: id, schoolSlug }).lean();
    if (!paper) throw new NotFoundException('Exam paper not found');
    const allQuestionIds = paper.sections.flatMap((s: any) => s.questionIds);
    const questions = await this.questionModel.find({ _id: { $in: allQuestionIds }, schoolSlug }).lean();
    const questionMap = new Map(questions.map((q: any) => [String(q._id), q]));
    return {
      ...paper,
      sections: paper.sections.map((s: any) => ({
        ...s,
        questions: s.questionIds.map((qid: any) => questionMap.get(String(qid))).filter(Boolean),
      })),
    };
  }

  async updateExamPaper(id: string, schoolSlug: string, dto: any) {
    let paper;
    try {
      paper = await this.examPaperModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    } catch (err: any) {
      if (err.name === 'ValidationError' || err.name === 'CastError') throw new BadRequestException(err.message);
      if (err.code === 11000) throw new ConflictException('A paper with this code already exists.');
      throw err;
    }
    if (!paper) throw new NotFoundException('Exam paper not found');
    return paper;
  }

  async deleteExamPaper(id: string, schoolSlug: string) {
    const res = await this.examPaperModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!res) throw new NotFoundException('Exam paper not found');
    return { message: 'Exam paper deleted' };
  }

  private readonly LANGUAGE_CONFIG: Record<string, { dir: string; lang: string; font: string; labels: Record<string, string> }> = {
    english: {
      dir: 'ltr', lang: 'en', font: "'Times New Roman', Georgia, serif",
      labels: {
        instructions: 'Instructions', duration: 'Time Allowed', marks: 'Total Marks', name: 'Name', roll: 'Roll No', section: 'Section',
        father: "Father's Name", campus: 'Campus / Centre', date: 'Date', invigilator: "Invigilator's Signature",
        declaration: 'I have read and understood the instructions above and agree to abide by the examination rules.',
        coverTitle: 'Examination Answer Sheet',
      },
    },
    urdu: {
      // Default/fallback only - generateExamPaperPdf below overrides this
      // per-paper via urduFontStyle: 'nastaliq' (the default) embeds the
      // real Noto Nastaliq Urdu font so it renders in the traditional
      // calligraphic style Urdu readers expect, regardless of host fonts;
      // 'naskh' keeps this upright Noto Sans/Naskh Arabic style instead.
      dir: 'rtl', lang: 'ur', font: "'Noto Sans Arabic', 'Noto Naskh Arabic', sans-serif",
      labels: {
        instructions: 'ہدایات', duration: 'وقت', marks: 'کل نمبر', name: 'نام', roll: 'رول نمبر', section: 'سیکشن',
        father: 'والد کا نام', campus: 'کیمپس', date: 'تاریخ', invigilator: 'نگران کے دستخط',
        declaration: 'میں نے مندرجہ بالا ہدایات پڑھ اور سمجھ لی ہیں اور امتحانی قواعد کی پابندی کروں گا/گی۔',
        coverTitle: 'امتحانی جوابی شیٹ',
      },
    },
    arabic: {
      dir: 'rtl', lang: 'ar', font: "'Noto Sans Arabic', 'Noto Naskh Arabic', sans-serif",
      labels: {
        instructions: 'التعليمات', duration: 'الوقت المحدد', marks: 'الدرجة الكلية', name: 'الاسم', roll: 'رقم القيد', section: 'الشعبة',
        father: 'اسم الأب', campus: 'الحرم / المركز', date: 'التاريخ', invigilator: 'توقيع المراقب',
        declaration: 'لقد قرأت وفهمت التعليمات أعلاه وأوافق على الالتزام بقواعد الامتحان.',
        coverTitle: 'ورقة إجابة الامتحان',
      },
    },
  };

  // Globally-standardised print layouts - keeps every paper a school
  // generates structurally consistent regardless of who set it up,
  // rather than leaving formatting to whoever fills the CreatePaperModal
  // in that moment.
  private readonly PAPER_FORMATS = ['standard', 'compact', 'formal'];

  // Relative to the long-standing 13px body default - scales every
  // font-size in the generated stylesheet proportionally (headers,
  // section titles, options, instructions, not just body text) so the
  // whole printed paper gets larger/smaller together instead of the
  // body text alone outgrowing its surrounding labels.
  private readonly FONT_SCALE: Record<string, number> = { small: 0.85, medium: 1, large: 1.2 };

  async generateExamPaperPdf(id: string, schoolSlug: string): Promise<Buffer> {
    const paper: any = await this.getExamPaperById(id, schoolSlug);
    // Early-years worksheets are an untimed, large-print activity handout,
    // not a timed exam - rendered with their own template entirely rather
    // than branching the dense exam-paper CSS below per activity type.
    if (paper.paperType === 'worksheet') {
      return this.generateWorksheetPdf(paper, schoolSlug);
    }
    const branding = await this.resolveBranding(schoolSlug, paper.campusId);
    const cfg = this.LANGUAGE_CONFIG[paper.language] || this.LANGUAGE_CONFIG.english;
    const format = this.PAPER_FORMATS.includes(paper.paperFormat) ? paper.paperFormat : 'standard';
    const scale = this.FONT_SCALE[paper.fontSize] || 1;
    const px = (basePx: number) => Math.round(basePx * scale);

    // Urdu defaults to real Nastaliq (embedded below as a @font-face data:
    // URI, not a system font) unless the paper explicitly asked for the
    // Naskh style; Arabic always stays Naskh - Nastaliq is specifically an
    // Urdu calligraphic tradition, not conventionally used for Arabic text.
    const useNastaliq = paper.language === 'urdu' && paper.urduFontStyle !== 'naskh';
    const bodyFont = useNastaliq ? "'Noto Nastaliq Urdu', 'Noto Sans Arabic', sans-serif" : cfg.font;
    const nastaliqFontFace = useNastaliq ? `
          @font-face {
            font-family: 'Noto Nastaliq Urdu';
            src: url(data:font/woff2;base64,${NOTO_NASTALIQ_URDU_BASE64}) format('woff2');
            font-weight: 400;
            font-style: normal;
          }` : '';

    const totalMarks = paper.sections.reduce((sum: number, s: any) => sum + s.questions.reduce((s2: number, q: any) => s2 + (q.marks || 0), 0), 0);
    const qrDataUrl = await QRCode.toDataURL(paper.paperCode, { width: 90, margin: 0 });

    // Real Code128 barcode alongside the QR code - the original request
    // specifically named "Barcodes", and while a QR code is the more
    // capable, modern choice for identification (more data, more robust
    // to print-quality issues), a school's EXISTING scanning hardware may
    // only read traditional 1D barcodes, so both are generated from the
    // same underlying paperCode rather than choosing one over the other.
    let barcodeDataUrl = '';
    try {
      const barcodeBuffer = await bwipjs.toBuffer({
        bcid: 'code128', text: paper.paperCode, scale: 2, height: 10, includetext: false,
      });
      barcodeDataUrl = `data:image/png;base64,${barcodeBuffer.toString('base64')}`;
    } catch {
      barcodeDataUrl = ''; // non-fatal - the QR code alone still identifies the paper
    }

    // Fire-and-forget usage tracking - never block PDF delivery on this.
    const allQuestionIds = paper.sections.flatMap((s: any) => s.questions.map((q: any) => q._id));
    this.questionModel.updateMany({ _id: { $in: allQuestionIds }, schoolSlug }, { $inc: { usageCount: 1 } }).catch(() => {});

    let questionNumber = 0;
    const sectionsHtml = paper.sections.map((section: any) => `
      <div class="section">
        <h3 class="section-title">${this.escapeHtml(section.title)}</h3>
        ${section.instructions ? `<p class="section-instructions">${this.escapeHtmlMultiline(section.instructions)}</p>` : ''}
        ${section.questions.map((q: any) => {
          questionNumber++;
          const optionsHtml = q.type === 'mcq' && q.options?.length
            ? `<div class="options">${q.options.map((o: any, i: number) => `
                <div class="option"><span class="opt-marker">${cfg.dir === 'rtl' ? this.arabicIndicNumeral(i) : String.fromCharCode(65 + i)}</span> ${this.escapeHtml(o.text)}</div>
              `).join('')}</div>`
            : q.type === 'matching' && q.matchingPairs?.length
            ? this.renderMatchingColumns(q.matchingPairs, q._id?.toString() || q.questionText, cfg)
            : Array.from({ length: q.answerLines ?? this.defaultAnswerLines(q.type, q.marks) })
                .map(() => `<div class="answer-space"></div>`).join('');
          const imageHtml = q.questionImage ? `<div class="q-image"><img src="${q.questionImage}" /></div>` : '';
          return `
            <div class="question">
              <div class="question-row">
                <span class="q-number">${questionNumber}.</span>
                <span class="q-text">${this.escapeHtmlMultiline(q.questionText)}</span>
                <span class="q-marks">[${q.marks}]</span>
              </div>
              ${imageHtml}
              ${optionsHtml}
            </div>
          `;
        }).join('')}
      </div>
    `).join('');

    // 'formal' format prepends a standalone, board-exam-style cover page
    // (candidate/invigilator fields, seal box, signed declaration) ahead
    // of the question content, on its own page.
    const coverPageHtml = format === 'formal' ? `
      <div class="cover-page">
        <div class="cover-header">
          ${branding.logo ? `<img class="cover-logo" src="${branding.logo}" />` : ''}
          <img src="${qrDataUrl}" width="90" height="90" />
          <h1>${cfg.labels.coverTitle}</h1>
          <p class="cover-paper-title">${this.escapeHtml(paper.title)}</p>
          <p class="cover-code">${paper.paperCode}</p>
        </div>
        <div class="cover-fields">
          <div class="cover-field"><label>${cfg.labels.name}</label><span>&nbsp;</span></div>
          <div class="cover-field"><label>${cfg.labels.father}</label><span>&nbsp;</span></div>
          <div class="cover-field"><label>${cfg.labels.roll}</label><span>&nbsp;</span></div>
          <div class="cover-field"><label>${cfg.labels.section}</label><span>&nbsp;</span></div>
          <div class="cover-field"><label>${cfg.labels.campus}</label><span>&nbsp;</span></div>
          <div class="cover-field"><label>${cfg.labels.date}</label><span>&nbsp;</span></div>
        </div>
        <div class="cover-meta">
          <p><strong>${this.escapeHtml(paper.subject)}</strong> — ${this.escapeHtml(paper.grade)}${paper.section ? ' - ' + this.escapeHtml(paper.section) : ''}</p>
          <p>${cfg.labels.duration}: ${paper.duration} ${paper.language === 'english' ? 'minutes' : ''} &nbsp;|&nbsp; ${cfg.labels.marks}: ${totalMarks}</p>
        </div>
        <div class="cover-declaration">${cfg.labels.declaration}</div>
        <div class="cover-signoff">
          <div class="cover-seal">${paper.language === 'english' ? 'SEAL' : ''}</div>
          <div class="cover-invigilator"><span>&nbsp;</span><label>${cfg.labels.invigilator}</label></div>
        </div>
      </div>
      <div class="page-break"></div>
    ` : '';

    const html = `
      <!DOCTYPE html>
      <html dir="${cfg.dir}" lang="${cfg.lang}">
      <head>
        <meta charset="UTF-8" />
        <style>${nastaliqFontFace}
          @page { margin: 15mm 12mm; }
          body { font-family: ${bodyFont}; color: #111; font-size: ${px(13)}px; line-height: 1.6; }
          .page-break { page-break-after: always; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0C447C; padding-bottom: 10px; margin-bottom: 14px; }
          .header-left { display: flex; align-items: flex-start; gap: 10px; }
          .header-logo { height: 48px; width: 48px; object-fit: contain; flex-shrink: 0; }
          .header-main h1 { font-size: ${px(18)}px; color: #0C447C; margin: 0 0 4px; }
          .header-main p { margin: 2px 0; font-size: ${px(12)}px; }
          .header-meta { text-align: center; font-size: ${px(10)}px; }
          .header-meta img { display: block; margin: 0 auto 4px; }
          .top-fields { display: flex; gap: 24px; margin-bottom: 14px; font-size: ${px(12)}px; }
          .top-fields span { border-bottom: 1px solid #999; padding-bottom: 2px; min-width: 120px; display: inline-block; }
          .instructions-box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: ${px(12)}px; background: #f9f9f9; }
          .section { margin-bottom: 18px; ${format === 'compact' ? 'column-count: 2; column-gap: 24px;' : ''} }
          .section-title { font-size: ${px(14)}px; background: #0C447C; color: white; padding: 5px 10px; border-radius: 3px; margin-bottom: 8px; ${format === 'compact' ? 'column-span: all;' : ''} }
          .section-instructions { font-size: ${px(11)}px; color: #555; margin: 0 0 8px; font-style: italic; ${format === 'compact' ? 'column-span: all;' : ''} }
          .question { margin-bottom: ${format === 'compact' ? '8px' : '12px'}; ${format === 'compact' ? `break-inside: avoid; font-size: ${px(12)}px;` : ''} }
          .question-row { display: flex; align-items: baseline; gap: 8px; }
          .q-number { font-weight: bold; flex-shrink: 0; }
          .q-text { flex: 1; }
          .q-marks { font-weight: bold; flex-shrink: 0; }
          .options { margin-top: 6px; margin-${cfg.dir === 'rtl' ? 'right' : 'left'}: 24px; display: grid; grid-template-columns: ${format === 'compact' ? '1fr' : '1fr 1fr'}; gap: 4px; }
          .opt-marker { font-weight: bold; margin-${cfg.dir === 'rtl' ? 'left' : 'right'}: 6px; }
          .answer-space { border-bottom: 1px solid #ccc; height: 22px; margin-top: 6px; margin-${cfg.dir === 'rtl' ? 'right' : 'left'}: 24px; }
          .matching-columns { margin-top: 8px; margin-${cfg.dir === 'rtl' ? 'right' : 'left'}: 24px; display: flex; flex-direction: row; gap: 32px; }
          .matching-col { flex: 1; }
          .matching-col-title { font-weight: bold; font-size: ${px(11)}px; margin-bottom: 6px; text-decoration: underline; }
          .matching-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 7px; }
          .matching-blank { border-bottom: 1px solid #333; width: 28px; display: inline-block; margin-${cfg.dir === 'rtl' ? 'left' : 'right'}: 4px; }
          .matching-marker { font-weight: bold; flex-shrink: 0; }
          .q-image { margin: 8px 0 8px ${cfg.dir === 'rtl' ? '0' : '24px'}; }
          .q-image img { max-width: 320px; max-height: 220px; border: 1px solid #ddd; border-radius: 4px; }
          .cover-page {
            display: flex; flex-direction: column; align-items: center;
            min-height: 225mm; padding-top: 15mm; text-align: center;
            /* The whole cover page is one atomic block so the browser
               never splits it mid-way (e.g. through the seal/signature
               row) - if it ever doesn't fit on one page, the entire
               block moves to the next page intact instead. */
            break-inside: avoid; page-break-inside: avoid;
          }
          .cover-logo { height: 60px; width: auto; object-fit: contain; margin-bottom: 8px; }
          .cover-header h1 { font-size: ${px(22)}px; color: #0C447C; margin: 10px 0 4px; }
          .cover-paper-title { font-size: ${px(15)}px; font-weight: bold; margin: 4px 0; }
          .cover-code { font-size: ${px(11)}px; color: #666; margin: 0; }
          .cover-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 40px; width: 100%; max-width: 420px; margin: 28px 0; text-align: ${cfg.dir === 'rtl' ? 'right' : 'left'}; }
          .cover-field label { display: block; font-size: ${px(10)}px; color: #666; margin-bottom: 3px; }
          .cover-field span { display: block; border-bottom: 1px solid #999; height: 18px; }
          .cover-meta { font-size: ${px(12)}px; margin-bottom: 20px; }
          .cover-declaration { max-width: 420px; font-size: ${px(11)}px; color: #444; border: 1px solid #ccc; border-radius: 4px; padding: 10px 14px; margin-bottom: 30px; background: #f9f9f9; }
          .cover-signoff { display: flex; align-items: flex-end; gap: 40px; margin-top: auto; break-inside: avoid; page-break-inside: avoid; }
          .cover-seal { width: 90px; height: 90px; border: 2px dashed #999; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: ${px(10)}px; color: #999; }
          .cover-invigilator span { display: block; border-bottom: 1px solid #999; width: 180px; height: 24px; margin-bottom: 4px; }
          .cover-invigilator label { font-size: ${px(10)}px; color: #666; }
        </style>
      </head>
      <body>
        ${coverPageHtml}
        <div class="header">
          <div class="header-left">
            ${branding.logo ? `<img class="header-logo" src="${branding.logo}" />` : ''}
            <div class="header-main">
              <h1>${this.escapeHtml(paper.title)}</h1>
              <p><strong>${this.escapeHtml(paper.subject)}</strong> — ${this.escapeHtml(paper.grade)}${paper.section ? ' - ' + this.escapeHtml(paper.section) : ''}</p>
              <p>${cfg.labels.duration}: ${paper.duration} ${paper.language === 'english' ? 'minutes' : ''} &nbsp;|&nbsp; ${cfg.labels.marks}: ${totalMarks}</p>
            </div>
          </div>
          <div class="header-meta">
            <img src="${qrDataUrl}" width="70" height="70" />
            ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" style="width:100px; height:auto; margin-top:4px;" />` : ''}
            <p>${paper.paperCode}</p>
          </div>
        </div>
        <div class="top-fields">
          <div>${cfg.labels.name}: <span>&nbsp;</span></div>
          <div>${cfg.labels.roll}: <span>&nbsp;</span></div>
        </div>
        ${paper.generalInstructions ? `<div class="instructions-box"><strong>${cfg.labels.instructions}:</strong> ${this.escapeHtmlMultiline(paper.generalInstructions)}</div>` : ''}
        ${sectionsHtml}
      </body>
      </html>
    `;

    return this.pdfService.htmlToPdfWithOptions(html, {
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
    });
  }

  // ============================================================
  // EARLY YEARS WORKSHEET PDF
  // A single-activity-per-page, large-print printable for early-years
  // teachers - built from the same real Question Bank/ExamPaper records
  // as a regular exam paper (ExamPaper.paperType === 'worksheet'), but
  // deliberately its own template: no timer/marks/answer-key chrome, big
  // glyphs/emoji instead of dense body text, and an optional SNC ECE
  // standard banner (see src/ece) so a printed sheet is traceable back
  // to exactly which early-years indicator it covers.
  // ============================================================
  private async generateWorksheetPdf(paper: any, schoolSlug: string): Promise<Buffer> {
    const branding = await this.resolveBranding(schoolSlug, paper.campusId);
    const cfg = this.LANGUAGE_CONFIG[paper.language] || this.LANGUAGE_CONFIG.english;

    const useNastaliq = paper.language === 'urdu' && paper.urduFontStyle !== 'naskh';
    const bodyFont = useNastaliq ? "'Noto Nastaliq Urdu', 'Noto Sans Arabic', sans-serif" : cfg.font;
    const nastaliqFontFace = useNastaliq ? `
          @font-face {
            font-family: 'Noto Nastaliq Urdu';
            src: url(data:font/woff2;base64,${NOTO_NASTALIQ_URDU_BASE64}) format('woff2');
            font-weight: 400;
            font-style: normal;
          }` : '';

    const standardBannerHtml = (paper.eceStandardCode || paper.eceStandardText) ? `
      <div class="standard-banner">
        ${paper.eceStandardCode ? `<span class="standard-code">${this.escapeHtml(paper.eceStandardCode)}</span>` : ''}
        ${paper.eceStandardText ? `<span class="standard-text">${this.escapeHtml(paper.eceStandardText)}</span>` : ''}
      </div>
    ` : '';

    const activitiesHtml = paper.sections.map((section: any) => `
      <div class="activity-section">
        <h3 class="section-title">${this.escapeHtml(section.title)}</h3>
        ${section.instructions ? `<p class="section-instructions">${this.escapeHtmlMultiline(section.instructions)}</p>` : ''}
        ${section.questions.map((q: any) => this.renderWorksheetActivity(q, cfg)).join('')}
      </div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html dir="${cfg.dir}" lang="${cfg.lang}">
      <head>
        <meta charset="UTF-8" />
        <style>${nastaliqFontFace}
          @page { margin: 14mm 12mm; }
          body { font-family: ${bodyFont}; color: #111; font-size: 15px; line-height: 1.6; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0C447C; padding-bottom: 10px; margin-bottom: 12px; }
          .header-left { display: flex; align-items: center; gap: 10px; }
          .header-logo { height: 48px; width: 48px; object-fit: contain; flex-shrink: 0; }
          .header-main h1 { font-size: 22px; color: #0C447C; margin: 0 0 4px; }
          .header-main p { margin: 2px 0; font-size: 13px; }
          .top-fields { display: flex; gap: 28px; margin-bottom: 10px; font-size: 13px; }
          .top-fields span { border-bottom: 1px solid #999; padding-bottom: 2px; min-width: 140px; display: inline-block; }
          .standard-banner { background: #eef4fb; border: 1px solid #c7dcf0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 12px; color: #0C447C; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
          .standard-code { font-weight: bold; }
          .activity-section { margin-bottom: 22px; page-break-inside: avoid; }
          .section-title { font-size: 17px; background: #0C447C; color: white; padding: 6px 12px; border-radius: 4px; margin-bottom: 10px; }
          .section-instructions { font-size: 13px; color: #555; margin: 0 0 10px; font-style: italic; }
          .activity { margin-bottom: 26px; page-break-inside: avoid; }
          .activity-prompt { font-size: 16px; font-weight: bold; margin-bottom: 10px; }
          /* Tracing: large dotted/outlined guide glyphs, repeated so a
             child traces several times per row, with a hollow stroke
             (not a solid fill) so the outline itself is what's traced. */
          .trace-row { display: flex; flex-wrap: wrap; gap: 18px; direction: ltr; }
          .trace-glyph {
            font-size: 64px; font-weight: bold; line-height: 1;
            color: transparent; -webkit-text-stroke: 1.5px #888;
            letter-spacing: 2px;
          }
          .trace-word .trace-glyph { font-size: 44px; }
          .trace-shape-row { display: flex; gap: 24px; flex-wrap: wrap; }
          .trace-shape svg { width: 90px; height: 90px; }
          /* Counting: the emoji set to count, then a row of circleable
             number options (correct count + decoys, pre-shuffled). */
          .count-emoji-box { font-size: 40px; line-height: 1.5; letter-spacing: 10px; margin-bottom: 14px; direction: ltr; }
          .count-options { display: flex; gap: 20px; }
          .count-option { width: 46px; height: 46px; border: 2px solid #333; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; }
          .matching-columns { margin-top: 8px; margin-${cfg.dir === 'rtl' ? 'right' : 'left'}: 12px; display: flex; flex-direction: row; gap: 32px; }
          .matching-col { flex: 1; }
          .matching-col-title { font-weight: bold; font-size: 13px; margin-bottom: 6px; text-decoration: underline; }
          .matching-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 9px; font-size: 15px; }
          .matching-blank { border-bottom: 1px solid #333; width: 32px; display: inline-block; margin-${cfg.dir === 'rtl' ? 'left' : 'right'}: 4px; }
          .matching-marker { font-weight: bold; flex-shrink: 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            ${branding.logo ? `<img class="header-logo" src="${branding.logo}" />` : ''}
            <div class="header-main">
              <h1>${this.escapeHtml(paper.title)}</h1>
              <p><strong>${this.escapeHtml(paper.subject)}</strong> — ${this.escapeHtml(paper.grade)}${paper.section ? ' - ' + this.escapeHtml(paper.section) : ''}</p>
            </div>
          </div>
        </div>
        <div class="top-fields">
          <div>${cfg.labels.name}: <span>&nbsp;</span></div>
          <div>${cfg.labels.date}: <span>&nbsp;</span></div>
        </div>
        ${standardBannerHtml}
        ${paper.generalInstructions ? `<div class="section-instructions"><strong>${cfg.labels.instructions}:</strong> ${this.escapeHtmlMultiline(paper.generalInstructions)}</div>` : ''}
        ${activitiesHtml}
      </body>
      </html>
    `;

    return this.pdfService.htmlToPdfWithOptions(html, {
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    });
  }

  // Simple dashed-outline SVGs for the four shapes a tracing activity can
  // ask for - kept inline (no external asset) so the PDF stays a single
  // self-contained HTML string like the rest of this service's rendering.
  private readonly TRACE_SHAPE_SVG: Record<string, string> = {
    circle: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="#888" stroke-width="3" stroke-dasharray="6,6"/></svg>`,
    square: `<svg viewBox="0 0 100 100"><rect x="12" y="12" width="76" height="76" fill="none" stroke="#888" stroke-width="3" stroke-dasharray="6,6"/></svg>`,
    triangle: `<svg viewBox="0 0 100 100"><polygon points="50,10 90,88 10,88" fill="none" stroke="#888" stroke-width="3" stroke-dasharray="6,6"/></svg>`,
    star: `<svg viewBox="0 0 100 100"><polygon points="50,6 61,38 95,38 68,58 78,90 50,70 22,90 32,58 5,38 39,38" fill="none" stroke="#888" stroke-width="3" stroke-dasharray="6,6"/></svg>`,
  };

  private renderWorksheetActivity(q: any, cfg: { dir: string }): string {
    const prompt = `<div class="activity-prompt">${this.escapeHtmlMultiline(q.questionText)}</div>`;

    if (q.type === 'tracing') {
      const content = q.traceContent || '';
      if (q.traceType === 'shape') {
        const shapes = content.split(',').map((s: string) => s.trim()).filter(Boolean);
        return `
          <div class="activity">
            ${prompt}
            <div class="trace-shape-row">
              ${shapes.map((shape: string) => `<div class="trace-shape">${this.TRACE_SHAPE_SVG[shape] || this.TRACE_SHAPE_SVG.circle}</div>`).join('')}
            </div>
          </div>
        `;
      }
      // letter / number / word: repeat the content a few times for extra
      // tracing practice per row.
      const repeatCount = q.traceType === 'word' ? 3 : 6;
      const rowClass = q.traceType === 'word' ? 'trace-row trace-word' : 'trace-row';
      return `
        <div class="activity">
          ${prompt}
          <div class="${rowClass}">
            ${Array.from({ length: repeatCount }).map(() => `<span class="trace-glyph">${this.escapeHtml(content)}</span>`).join('')}
          </div>
        </div>
      `;
    }

    if (q.type === 'counting') {
      const emoji = q.countEmoji || '⭐';
      const count = q.correctCount || 0;
      const options = (q.countOptions && q.countOptions.length ? q.countOptions : [count]);
      return `
        <div class="activity">
          ${prompt}
          <div class="count-emoji-box">${Array.from({ length: count }).map(() => this.escapeHtml(emoji)).join(' ')}</div>
          <div class="count-options">
            ${options.map((n: number) => `<div class="count-option">${cfg.dir === 'rtl' ? this.arabicIndicNumeral(n - 1) : n}</div>`).join('')}
          </div>
        </div>
      `;
    }

    if (q.type === 'matching' && q.matchingPairs?.length) {
      return `
        <div class="activity">
          ${prompt}
          ${this.renderMatchingColumns(q.matchingPairs, q._id?.toString() || q.questionText, cfg)}
        </div>
      `;
    }

    // Fallback for any other question type reused on a worksheet.
    return `<div class="activity">${prompt}</div>`;
  }

  // ============================================================
  // EXAMINATION TIMETABLE
  // A school admin's actual ask: a single printable schedule of which
  // subject is examined on which date/time/venue - built from the same
  // SubjectConfig[] array already entered on the Assessment (Create/Edit
  // Assessment's "Subjects Configuration" section), not a new collection.
  // ============================================================
  private fmtTimetableDate(d?: Date | string | null): { date: string; day: string } {
    if (!d) return { date: 'TBA', day: '' };
    const dt = new Date(d);
    return {
      date: dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      day: dt.toLocaleDateString('en-GB', { weekday: 'long' }),
    };
  }

  private fmtTime(t?: string): string {
    if (!t) return '—';
    const [hStr, mStr] = t.split(':');
    const h = Number(hStr);
    if (Number.isNaN(h)) return t;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${(mStr || '00').padStart(2, '0')} ${period}`;
  }

  // Renders a letterheaded timetable from a header line + pre-built table
  // rows HTML - shared by the single-assessment and combined-schedule
  // variants below so both ever produce one identical printed look.
  private renderTimetableHtml(opts: {
    branding: { name: string; logo: string; campusName: string };
    heading: string;
    subheading: string;
    columns: string[];
    rowsHtml: string;
  }): string {
    const { branding, heading, subheading, columns, rowsHtml } = opts;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          @page { margin: 15mm 14mm; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; font-size: 12px; }
          .header { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #0C447C; padding-bottom: 10px; margin-bottom: 16px; }
          .header img { width: 50px; height: 50px; object-fit: contain; }
          .header-text h1 { font-size: 17px; color: #0C447C; margin: 0 0 2px; }
          .header-text p { margin: 1px 0; font-size: 11px; color: #555; }
          .title-block { text-align: center; margin-bottom: 14px; }
          .title-block h2 { font-size: 15px; margin: 0 0 3px; color: #111; }
          .title-block p { font-size: 11px; color: #555; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background: #0C447C; color: white; text-align: left; padding: 7px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; }
          td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11.5px; }
          tr:nth-child(even) td { background: #f8fafc; }
          .unscheduled-row td { color: #b45309; font-style: italic; }
          .footer-note { margin-top: 18px; font-size: 9.5px; color: #999; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          ${branding.logo ? `<img src="${branding.logo}" />` : ''}
          <div class="header-text">
            <h1>${this.escapeHtml(branding.name)}</h1>
            ${branding.campusName ? `<p>${this.escapeHtml(branding.campusName)}</p>` : ''}
          </div>
        </div>
        <div class="title-block">
          <h2>${this.escapeHtml(heading)}</h2>
          <p>${this.escapeHtml(subheading)}</p>
        </div>
        <table>
          <thead><tr>${columns.map(c => `<th>${this.escapeHtml(c)}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p class="footer-note">Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} · Eldermin</p>
      </body>
      </html>
    `;
  }

  async generateTimetablePdf(id: string, schoolSlug: string): Promise<Buffer> {
    const assessment: any = await this.assessmentModel.findOne({ _id: id, schoolSlug }).lean();
    if (!assessment) throw new NotFoundException('Assessment not found');
    const branding = await this.resolveBranding(schoolSlug, assessment.campusId);

    // Subjects with no date yet are shown last, under an "Unscheduled" note,
    // rather than silently dropped - a half-planned timetable is still
    // useful to print and fill in by hand.
    const subjects = [...(assessment.subjects || [])].sort((a: any, b: any) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    const rowsHtml = subjects.map((s: any) => {
      const { date, day } = this.fmtTimetableDate(s.date);
      const unscheduled = !s.date;
      return `
        <tr${unscheduled ? ' class="unscheduled-row"' : ''}>
          <td>${date}</td>
          <td>${this.escapeHtml(day)}</td>
          <td>${this.fmtTime(s.startTime)}</td>
          <td>${this.escapeHtml(s.subject)}</td>
          <td>${s.duration ? `${s.duration} min` : '—'}</td>
          <td>${this.escapeHtml(s.venue) || '—'}</td>
          <td>${s.totalMarks ?? '—'}</td>
        </tr>
      `;
    }).join('');

    const subheading = [
      `${assessment.grade}${assessment.section ? ` - ${assessment.section}` : ''}`,
      assessment.term, assessment.academicYear,
    ].filter(Boolean).join(' · ');

    const html = this.renderTimetableHtml({
      branding,
      heading: `${assessment.title} — Examination Timetable`,
      subheading,
      columns: ['Date', 'Day', 'Time', 'Subject', 'Duration', 'Venue', 'Marks'],
      rowsHtml: rowsHtml || '<tr><td colspan="7" style="text-align:center;color:#999;">No subjects configured yet.</td></tr>',
    });

    return this.pdfService.htmlToPdfWithOptions(html, {
      format: 'A4', printBackground: true,
      margin: { top: '15mm', right: '14mm', bottom: '15mm', left: '14mm' },
    });
  }

  // Combines every subject slot across ALL assessments matching the given
  // filters (grade/section/term/academicYear/type) into one chronological
  // schedule - the real-world case of a Mid Term covering several papers
  // PLUS a separate Practical/Oral assessment in the same window, which a
  // single assessment's own timetable can't show on its own.
  async generateCombinedTimetablePdf(schoolSlug: string, query: {
    grade?: string; section?: string; term?: string; academicYear?: string; type?: string;
  }): Promise<Buffer> {
    const filter: any = { schoolSlug };
    if (query.grade) filter.grade = query.grade;
    if (query.section) filter.section = query.section;
    if (query.term) filter.term = query.term;
    if (query.academicYear) filter.academicYear = query.academicYear;
    if (query.type) filter.type = query.type;

    const assessments: any[] = await this.assessmentModel.find(filter).sort({ startDate: 1 }).lean();
    if (assessments.length === 0) throw new NotFoundException('No assessments found matching those filters.');

    const branding = await this.resolveBranding(schoolSlug, assessments[0].campusId);

    type Row = { date: Date | null; day: string; dateLabel: string; time: string; assessmentTitle: string; subject: string; duration: string; venue: string };
    const rows: Row[] = [];
    for (const a of assessments) {
      for (const s of (a.subjects || [])) {
        const { date, day } = this.fmtTimetableDate(s.date);
        rows.push({
          date: s.date ? new Date(s.date) : null,
          day, dateLabel: date,
          time: this.fmtTime(s.startTime),
          assessmentTitle: a.title,
          subject: s.subject,
          duration: s.duration ? `${s.duration} min` : '—',
          venue: s.venue || '—',
        });
      }
    }
    rows.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    });

    const rowsHtml = rows.map(r => `
      <tr${!r.date ? ' class="unscheduled-row"' : ''}>
        <td>${r.dateLabel}</td>
        <td>${this.escapeHtml(r.day)}</td>
        <td>${r.time}</td>
        <td>${this.escapeHtml(r.assessmentTitle)}</td>
        <td>${this.escapeHtml(r.subject)}</td>
        <td>${r.duration}</td>
        <td>${this.escapeHtml(r.venue)}</td>
      </tr>
    `).join('');

    const subheading = [
      query.grade ? `${query.grade}${query.section ? ` - ${query.section}` : ''}` : 'All Grades',
      query.term, query.academicYear,
    ].filter(Boolean).join(' · ');

    const html = this.renderTimetableHtml({
      branding,
      heading: 'Examination Timetable',
      subheading,
      columns: ['Date', 'Day', 'Time', 'Assessment', 'Subject', 'Duration', 'Venue'],
      rowsHtml: rowsHtml || '<tr><td colspan="7" style="text-align:center;color:#999;">No subjects configured yet.</td></tr>',
    });

    return this.pdfService.htmlToPdfWithOptions(html, {
      format: 'A4', printBackground: true,
      margin: { top: '15mm', right: '14mm', bottom: '15mm', left: '14mm' },
    });
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // escapeHtml alone drops every line break an admin typed - a blank line
  // meant to visually separate two "attempt one of two options" alternatives
  // (e.g. "...write a letter... OR ...write a story...") collapses to a
  // single space per standard HTML whitespace rules, merging both options
  // together on the printed paper. Converting each newline to a real <br>
  // after escaping preserves exactly the spacing the admin typed, including
  // a blank line becoming a visible gap (two consecutive <br>s).
  private escapeHtmlMultiline(text: string): string {
    return this.escapeHtml(text).replace(/\n/g, '<br>');
  }

  // Printed answer space used to be a single hardcoded 22px line no matter
  // the question type or marks - nowhere near enough for an 80-100 word
  // composition. Falls back to this heuristic only when a question has no
  // explicit answerLines set (see Question.answerLines).
  private defaultAnswerLines(type: string, marks: number): number {
    if (type === 'true_false' || type === 'fill_blank') return 1;
    if (type === 'short') return Math.max(2, Math.min(4, Math.ceil((marks || 1) / 2)));
    return Math.max(4, Math.min(15, (marks || 1) * 2)); // long / matching / composition-style
  }

  private arabicIndicNumeral(index: number): string {
    // Options lettered with real Arabic-Indic numerals for RTL papers
    // (١، ٢، ٣...) rather than forcing Latin A/B/C/D into an RTL layout.
    // Composed digit-by-digit (not a fixed small lookup table) so this
    // also covers a matching question's right-hand column, which can run
    // well past the 6 choices an MCQ typically has.
    const digits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(index + 1).split('').map(d => digits[Number(d)] ?? d).join('');
  }

  // "Match the columns" print layout: Column A (left items) numbered
  // 1..N in their stored order; Column B (right items) shown under a
  // deterministic per-question shuffle, lettered (or Arabic-Indic
  // numbered, for RTL papers, matching the MCQ option-marker convention)
  // so a student has to actually match rather than read straight across.
  // The answer key stays derivable: each left row prints a blank for the
  // student to write the matching marker into, and printing this HTML a
  // second time for the same question reproduces the identical shuffle.
  private renderMatchingColumns(pairs: Array<{ left: string; right: string }>, seed: string, cfg: { dir: string }): string {
    const shuffledRight = this.seededShuffle(pairs.map((p) => p.right), seed);
    const marker = (i: number) => cfg.dir === 'rtl' ? this.arabicIndicNumeral(i) : String.fromCharCode(65 + i);
    const colA = cfg.dir === 'rtl' ? 'كالم الف' : 'Column A';
    const colB = cfg.dir === 'rtl' ? 'كالم ب' : 'Column B';
    return `
      <div class="matching-columns">
        <div class="matching-col">
          <div class="matching-col-title">${colA}</div>
          ${pairs.map((p, i) => `
            <div class="matching-row">
              <span class="matching-marker">${i + 1}.</span>
              <span>${this.escapeHtml(p.left)}</span>
              <span class="matching-blank"></span>
            </div>
          `).join('')}
        </div>
        <div class="matching-col">
          <div class="matching-col-title">${colB}</div>
          ${shuffledRight.map((text, i) => `
            <div class="matching-row">
              <span class="matching-marker">${marker(i)}.</span>
              <span>${this.escapeHtml(text)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Deterministic per-question shuffle for a matching question's
  // right-hand column - seeded off the question's own _id (a stable,
  // always-present string) rather than Math.random(), so reprinting the
  // same exam paper PDF twice doesn't silently reshuffle the answer key
  // a teacher may have already written down or shared.
  private seededShuffle<T>(items: T[], seed: string): T[] {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
    const rand = () => {
      h = (Math.imul(1103515245, h) + 12345) | 0;
      return ((h >>> 0) % 1000) / 1000;
    };
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // ============================================================
  // OMR (bubble-sheet scan checking) - MCQ only.
  // Real, working detection algorithm (see omr-detection.util.ts), but
  // NOT yet verified against real photographed sheets - no sample
  // images were available while building this. Expect real-world
  // threshold tuning to be needed. Detection output is never treated as
  // final - every sheet requires a human confirmation pass before a
  // score is computed.
  // ============================================================

  private computeOMRLayout(questionCount: number) {
    const pageWidthMm = 210, pageHeightMm = 297;
    const markerMargin = 15;
    const markers = [
      { xMm: markerMargin, yMm: markerMargin },                       // top-left
      { xMm: pageWidthMm - markerMargin, yMm: markerMargin },         // top-right
      { xMm: markerMargin, yMm: pageHeightMm - markerMargin },        // bottom-left
      { xMm: pageWidthMm - markerMargin, yMm: pageHeightMm - markerMargin }, // bottom-right
    ];

    // Two columns once there are enough questions to need them, so a
    // realistic paper (30-50 MCQs) still fits on one A4 sheet.
    const useTwoColumns = questionCount > 25;
    const perColumn = useTwoColumns ? Math.ceil(questionCount / 2) : questionCount;
    const rowStartYMm = 55;
    const rowHeightMm = 9;
    const col1XMm = 25;
    const col2XMm = pageWidthMm / 2 + 10;
    const optionSpacingMm = 12;

    const questions: { questionNumber: number; bubbles: { label: string; xMm: number; yMm: number }[] }[] = [];
    for (let i = 0; i < questionCount; i++) {
      const qNum = i + 1;
      const col = useTwoColumns && i >= perColumn ? 1 : 0;
      const rowInCol = col === 0 ? i : i - perColumn;
      const baseX = col === 0 ? col1XMm : col2XMm;
      const baseY = rowStartYMm + rowInCol * rowHeightMm;
      const bubbles = ['A', 'B', 'C', 'D'].map((label, idx) => ({
        label, xMm: baseX + 12 + idx * optionSpacingMm, yMm: baseY,
      }));
      questions.push({ questionNumber: qNum, bubbles });
    }

    return { pageWidthMm, pageHeightMm, markers, questions, bubbleRadiusMm: 3 };
  }

  private generateSheetCode(): string {
    const rand = randomBytes(3).toString('hex').toUpperCase();
    const stamp = Date.now().toString(36).toUpperCase();
    return `OMR-${stamp}-${rand}`;
  }

  async generateOMRSheets(schoolSlug: string, examPaperId: string, studentIds: string[]) {
    const paper = await this.examPaperModel.findOne({ _id: examPaperId, schoolSlug });
    if (!paper) throw new NotFoundException('Exam paper not found');

    // MCQ-only questions actually determine the bubble grid - count them
    // for real rather than assuming every question in the paper is MCQ.
    const allQuestionIds = paper.sections.flatMap((s: any) => s.questionIds);
    const mcqCount = await this.questionModel.countDocuments({ _id: { $in: allQuestionIds }, type: 'mcq', schoolSlug });
    if (mcqCount === 0) throw new BadRequestException('This paper has no MCQ questions - OMR sheets only make sense for MCQ-based papers');

    if (!paper.omrLayout) {
      paper.omrLayout = this.computeOMRLayout(mcqCount) as any;
      await paper.save();
    }

    const sheets: any[] = [];
    for (const studentId of studentIds) {
      const existing = await this.omrSheetModel.findOne({ schoolSlug, examPaperId, studentId });
      if (existing) { sheets.push(existing); continue; }
      const sheet = await this.omrSheetModel.create({
        schoolSlug, examPaperId, studentId, sheetCode: this.generateSheetCode(), status: 'pending_capture',
      });
      sheets.push(sheet);
    }
    return sheets;
  }

  async getOMRSheetsForPaper(schoolSlug: string, examPaperId: string) {
    const sheets = await this.omrSheetModel.find({ schoolSlug, examPaperId }).lean();
    const studentIds = sheets.map((s: any) => s.studentId);
    const students = await this.studentModel.find({ _id: { $in: studentIds } }).select('firstName lastName studentId').lean();
    const studentMap = new Map(students.map((s: any) => [String(s._id), s]));
    return sheets.map((s: any) => ({ ...s, student: studentMap.get(String(s.studentId)) }));
  }

  async generateOMRSheetPdf(sheetId: string, schoolSlug: string): Promise<Buffer> {
    const sheet: any = await this.omrSheetModel.findOne({ _id: sheetId, schoolSlug }).lean();
    if (!sheet) throw new NotFoundException('OMR sheet not found');
    const paper: any = await this.examPaperModel.findOne({ _id: sheet.examPaperId, schoolSlug }).lean();
    if (!paper?.omrLayout) throw new BadRequestException('This paper has no OMR layout generated yet');
    const student: any = await this.studentModel.findById(sheet.studentId).lean();

    const qrDataUrl = await QRCode.toDataURL(sheet.sheetCode, { width: 80, margin: 0 });
    const layout = paper.omrLayout;
    const markerSizeMm = 8;

    const markersHtml = layout.markers.map((m: any) => `
      <div style="position:absolute; left:${m.xMm - markerSizeMm / 2}mm; top:${m.yMm - markerSizeMm / 2}mm; width:${markerSizeMm}mm; height:${markerSizeMm}mm; background:#000;"></div>
    `).join('');

    const bubblesHtml = layout.questions.map((q: any) => `
      <div style="position:absolute; left:${q.bubbles[0].xMm - 8}mm; top:${q.bubbles[0].yMm - 2.5}mm; font-size:9px; font-weight:bold;">${q.questionNumber}.</div>
      ${q.bubbles.map((b: any) => `
        <div style="position:absolute; left:${b.xMm - layout.bubbleRadiusMm}mm; top:${b.yMm - layout.bubbleRadiusMm}mm;
          width:${layout.bubbleRadiusMm * 2}mm; height:${layout.bubbleRadiusMm * 2}mm; border:0.4mm solid #000; border-radius:50%;
          display:flex; align-items:center; justify-content:center; font-size:6px;">${b.label}</div>
      `).join('')}
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          @page { margin: 0; size: ${layout.pageWidthMm}mm ${layout.pageHeightMm}mm; }
          body { margin: 0; font-family: Arial, sans-serif; position: relative; width: ${layout.pageWidthMm}mm; height: ${layout.pageHeightMm}mm; }
          .header { position: absolute; left: 30mm; top: 20mm; right: 30mm; }
          .header h1 { font-size: 14px; margin: 0 0 4px; }
          .header p { font-size: 10px; margin: 2px 0; }
          .qr { position: absolute; right: 30mm; top: 18mm; }
          .instructions { position: absolute; left: 25mm; top: 42mm; font-size: 8px; color: #444; }
        </style>
      </head>
      <body>
        ${markersHtml}
        <div class="header">
          <h1>${this.escapeHtml(paper.title)} — OMR Answer Sheet</h1>
          <p><strong>${student ? `${student.firstName} ${student.lastName}` : ''}</strong> — ${this.escapeHtml(paper.grade)}${paper.section ? ' - ' + this.escapeHtml(paper.section) : ''}</p>
          <p>Sheet Code: ${sheet.sheetCode}</p>
        </div>
        <div class="qr"><img src="${qrDataUrl}" width="60" height="60" /></div>
        <div class="instructions">Fill each bubble completely using a dark pen or pencil. Do not fold this sheet.</div>
        ${bubblesHtml}
      </body>
      </html>
    `;

    return this.pdfService.htmlToPdfWithOptions(html, { width: `${layout.pageWidthMm}mm`, height: `${layout.pageHeightMm}mm`, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
  }

  async uploadOMRSheetPhoto(sheetId: string, schoolSlug: string, file: Express.Multer.File) {
    const sheet = await this.omrSheetModel.findOne({ _id: sheetId, schoolSlug });
    if (!sheet) throw new NotFoundException('OMR sheet not found');

    const uploaded = await this.uploadService.uploadFile(file, 'omr-sheets', schoolSlug);
    sheet.uploadedImageUrl = uploaded.url;
    sheet.status = 'uploaded';
    await sheet.save();

    // Run detection immediately - fire-and-forget from the caller's
    // perspective isn't appropriate here since the result determines
    // the response, so this is awaited, not queued.
    return this.processOMRSheet(sheetId, schoolSlug, uploaded.key);
  }

  async processOMRSheet(sheetId: string, schoolSlug: string, imageKey: string) {
    const sheet = await this.omrSheetModel.findOne({ _id: sheetId, schoolSlug });
    if (!sheet) throw new NotFoundException('OMR sheet not found');
    const paper: any = await this.examPaperModel.findOne({ _id: sheet.examPaperId, schoolSlug }).lean();
    if (!paper?.omrLayout) throw new BadRequestException('This paper has no OMR layout');

    let imageBuffer: Buffer;
    try {
      imageBuffer = await this.uploadService.getFileBuffer(imageKey);
    } catch (err: any) {
      sheet.status = 'uploaded';
      sheet.processingError = `Could not retrieve the uploaded image: ${err.message}`;
      await sheet.save();
      return sheet;
    }

    const detection = await detectOMRAnswers({
      imageBuffer,
      pageWidthMm: paper.omrLayout.pageWidthMm,
      pageHeightMm: paper.omrLayout.pageHeightMm,
      markersMm: paper.omrLayout.markers,
      questions: paper.omrLayout.questions,
      bubbleRadiusMm: paper.omrLayout.bubbleRadiusMm,
    });

    if (!detection.markersFound) {
      sheet.status = 'uploaded';
      sheet.processingError = detection.error || 'Detection failed';
      await sheet.save();
      return sheet;
    }

    sheet.detectedAnswers = detection.results.map((r) => ({
      questionNumber: r.questionNumber,
      detectedOption: r.detectedOption || undefined,
      confidence: r.confidence,
      isAmbiguous: r.isAmbiguous,
    })) as any;
    sheet.processingError = null as any;
    sheet.processedAt = new Date();
    const hasIssues = detection.results.some((r) => r.isAmbiguous || r.detectedOption === null);
    sheet.status = hasIssues ? 'needs_review' : 'processed';
    await sheet.save();
    return sheet;
  }

  async confirmOMRSheet(sheetId: string, schoolSlug: string, confirmedBy: string, answers: { questionNumber: number; confirmedOption?: string }[]) {
    const sheet = await this.omrSheetModel.findOne({ _id: sheetId, schoolSlug });
    if (!sheet) throw new NotFoundException('OMR sheet not found');
    const paper: any = await this.examPaperModel.findOne({ _id: sheet.examPaperId, schoolSlug }).lean();

    const allQuestionIds = paper.sections.flatMap((s: any) => s.questionIds);
    const mcqQuestions = await this.questionModel.find({ _id: { $in: allQuestionIds }, type: 'mcq', schoolSlug }).lean();
    // Real correct-answer lookup keyed by question ORDER (question 1, 2,
    // 3... in the same order the OMR layout was generated in), not by
    // ID, since the sheet only ever knows question NUMBERS from the
    // printed grid.
    const correctByNumber = new Map(mcqQuestions.map((q: any, i: number) => {
      const correctOption = q.options?.find((o: any) => o.isCorrect);
      const label = correctOption ? String.fromCharCode(65 + q.options.indexOf(correctOption)) : null;
      return [i + 1, { label, marks: q.marks }];
    }));

    let score = 0, totalMarks = 0;
    for (const [, info] of correctByNumber) totalMarks += info.marks || 0;
    for (const ans of answers) {
      const info = correctByNumber.get(ans.questionNumber);
      if (info && ans.confirmedOption && info.label === ans.confirmedOption) score += info.marks || 0;
    }

    sheet.confirmedAnswers = answers.map((a) => ({ questionNumber: a.questionNumber, confirmedOption: a.confirmedOption })) as any;
    sheet.status = 'confirmed';
    sheet.confirmedBy = confirmedBy;
    sheet.confirmedAt = new Date();
    sheet.score = score;
    sheet.totalMarks = totalMarks;
    await sheet.save();
    return sheet;
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  async getDashboard(schoolSlug: string, academicYear?: string) {
    const base: any = { schoolSlug };
    if (academicYear) base.academicYear = academicYear;

    const [
      total, scheduled, ongoing, completed, published,
      byType, byGrade, byTerm,
      recentAssessments, upcomingAssessments,
      totalQuestions, totalMarksEntered,
    ] = await Promise.all([
      this.assessmentModel.countDocuments(base),
      this.assessmentModel.countDocuments({ ...base, status: 'scheduled' }),
      this.assessmentModel.countDocuments({ ...base, status: 'ongoing' }),
      this.assessmentModel.countDocuments({ ...base, status: 'completed' }),
      this.assessmentModel.countDocuments({ ...base, status: 'result_published' }),
      this.assessmentModel.aggregate([
        { $match: base },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.assessmentModel.aggregate([
        { $match: { ...base, status: { $in: ['ongoing','scheduled','completed'] } } },
        { $group: { _id: '$grade', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.assessmentModel.aggregate([
        { $match: base },
        { $group: { _id: '$term', count: { $sum: 1 } } },
      ]),
      this.assessmentModel.find(base).sort({ createdAt: -1 }).limit(5)
        .select('title type grade status startDate'),
      this.assessmentModel.find({ ...base, startDate: { $gte: new Date() }, status: 'scheduled' })
        .sort({ startDate: 1 }).limit(5),
      this.questionModel.countDocuments({ schoolSlug }),
      this.markModel.countDocuments(base),
    ]);

    // Performance stats across all completed assessments
    const avgPerformance = await this.markModel.aggregate([
      { $match: { ...base, obtainedMarks: { $ne: null }, isAbsent: false } },
      { $group: {
        _id: '$grade',
        avgPct: { $avg: '$percentage' },
        passCount: { $sum: { $cond: [{ $eq: ['$result', 'pass'] }, 1, 0] } },
        failCount: { $sum: { $cond: [{ $eq: ['$result', 'fail'] }, 1, 0] } },
        total: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);

    return {
      stats: { total, scheduled, ongoing, completed, published, totalQuestions, totalMarksEntered },
      byType, byGrade, byTerm,
      avgPerformance,
      recentAssessments,
      upcomingAssessments,
    };
  }

  // ============================================================
  // ASSESSMENTS CRUD
  // ============================================================
  async create(dto: CreateAssessmentDto, requestingUser?: ScopedUser) {
    const assessment = new this.assessmentModel({
      ...dto,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : ((dto as any).campusId ? new Types.ObjectId((dto as any).campusId) : null),
      subjects: dto.subjects.map(s => ({
        ...s,
        date: s.date ? new Date(s.date) : undefined,
        passingMarks: s.passingMarks ?? Math.floor(s.totalMarks * 0.4),
      })),
    });
    return assessment.save();
  }

  async findAll(schoolSlug: string, query: AssessmentQueryDto, requestingUser?: ScopedUser) {
    const { page, limit, search, sortBy, sortOrder,
      grade, section, type, status, academicYear, term, campusId } = query as any;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (grade) filter.grade = grade;
    if (section) filter.section = section;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (academicYear) filter.academicYear = academicYear;
    if (term) filter.term = term;
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];

    const sort: any = {};
    sort[sortBy || 'startDate'] = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.assessmentModel.find(filter).sort(sort).skip(skip).limit(limit!),
      this.assessmentModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async findOne(id: string, schoolSlug: string) {
    const a = await this.assessmentModel.findOne({ _id: id, schoolSlug });
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  async update(id: string, schoolSlug: string, dto: UpdateAssessmentDto) {
    const a = await this.assessmentModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!a) throw new NotFoundException('Assessment not found');
    return a;
  }

  static readonly ASSESSMENT_STATUSES = ['draft', 'scheduled', 'ongoing', 'completed', 'result_published', 'cancelled'];

  async updateStatus(id: string, schoolSlug: string, status: string, requestingUser?: any) {
    assertValidObjectId(id, 'assessment');
    if (!AssessmentService.ASSESSMENT_STATUSES.includes(status)) {
      throw new BadRequestException(`status must be one of: ${AssessmentService.ASSESSMENT_STATUSES.join(', ')}`);
    }
    const existing: any = await this.assessmentModel.findOne({ _id: id, schoolSlug }).select('status').lean();
    if (!existing) throw new NotFoundException('Assessment not found');
    if (requestingUser) {
      const role = requestingUser.role || requestingUser.primaryRole;
      if (!TEACHING_ADMIN_ROLES.includes(role) && (status === 'result_published' || existing.status === 'result_published')) {
        throw new ForbiddenException('Only an administrator can publish or withdraw published results.');
      }
    }
    return this.assessmentModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { status } }, { new: true },
    );
  }

  // Only a 'draft' assessment can be deleted - the Planner's own action
  // list only ever offers "Delete" for that status (every later status has
  // real downstream data: scheduled timetables, ongoing/completed mark
  // entry, published report cards), so this mirrors what the UI already
  // promises rather than silently accepting a delete the UI never offered.
  async deleteAssessment(id: string, schoolSlug: string) {
    const a = await this.assessmentModel.findOne({ _id: id, schoolSlug });
    if (!a) throw new NotFoundException('Assessment not found');
    if (a.status !== 'draft') {
      throw new BadRequestException('Only a draft assessment can be deleted. Cancel it instead if it has already been scheduled.');
    }
    await this.assessmentModel.deleteOne({ _id: id, schoolSlug });
    return { message: 'Assessment deleted' };
  }

  // ============================================================
  // QUESTION BANK
  // ============================================================
  async createQuestion(dto: CreateQuestionDto) {
    const q = new this.questionModel(dto);
    return q.save();
  }

  /** CSV/spreadsheet bulk import for the question bank - lets a school hand
   * subject teachers a fixed template (one row per question) instead of
   * entering each one through AddQuestionModal by hand. Mirrors the
   * per-row created/skipped/error reporting convention already used by
   * bulkImportCOA (finance) and bulkImportFeeAssignments (finance) - never
   * a raw insertMany, so one malformed row never sinks the whole file and
   * every outcome is visible to the uploader, not silently swallowed. */
  async bulkImportQuestions(schoolSlug: string, addedBy: string, rows: any[], tenantId?: string) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('No rows to import.');
    }
    const validTypes = ['mcq', 'short', 'long', 'true_false', 'fill_blank', 'matching'];
    const validBlooms = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
    const validDifficulty = ['easy', 'medium', 'hard'];

    // Resolve each row's free-typed subject/grade against the school's own
    // canonical Subjects/Grades lists instead of trusting the spreadsheet
    // text verbatim. Previously a bulk-imported row like "Maths"/"Grade-5"
    // was stored exactly as typed, while a manually-created question's
    // subject/grade always came from these same canonical `name` values
    // (AddQuestionModal's dropdowns) - so the exam-paper builder's
    // subject/grade filter (an exact client-side string compare) matched
    // manual questions but silently excluded every bulk-imported one whose
    // spelling/spacing drifted even slightly, with no indication why.
    // Matching here is normalized (lowercase, non-alphanumeric stripped) so
    // "Grade 5" / "Grade-5" / "grade5" all resolve to the same canonical
    // Grade, and the exact canonical `name` is stored - guaranteeing every
    // bulk-imported question is reachable by the same filters a manually
    // created one already is.
    const normKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    const [subjectDocs, gradeDocs] = await Promise.all([
      tenantId ? this.subjectModel.find({ tenantId }).select('name').lean() : Promise.resolve([] as any[]),
      this.gradeModel.find({ schoolSlug, isActive: true }).select('name').lean(),
    ]);
    const subjectByKey = new Map<string, string>(subjectDocs.map((s: any) => [normKey(s.name), s.name]));
    const gradeByKey = new Map<string, string>(gradeDocs.map((g: any) => [normKey(g.name), g.name]));

    const results: Array<{ row: number; status: 'created' | 'skipped' | 'error'; message?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] || {};
      const rawSubject = String(raw.subject || '').trim();
      const rawGrade = String(raw.grade || '').trim();
      const type = String(raw.type || '').trim().toLowerCase();
      const questionText = String(raw.questionText || '').trim();

      try {
        if (!rawSubject) throw new Error('"subject" is required.');
        if (!rawGrade) throw new Error('"grade" is required.');
        if (!questionText) throw new Error('"questionText" is required.');
        if (!validTypes.includes(type)) throw new Error(`"type" must be one of: ${validTypes.join(', ')}.`);

        // Fall back to the raw (trimmed) value when the canonical list
        // couldn't be resolved at all (e.g. tenantId missing) rather than
        // blocking every row - but when the list IS available, an
        // unresolvable name is almost always a typo the uploader would
        // want to know about before it silently vanishes from paper
        // generation later.
        const subject = subjectDocs.length === 0 ? rawSubject : subjectByKey.get(normKey(rawSubject));
        if (!subject) {
          throw new Error(`"subject" "${rawSubject}" doesn't match any subject configured for this school. Valid subjects: ${subjectDocs.map((s: any) => s.name).join(', ')}.`);
        }
        const grade = gradeDocs.length === 0 ? rawGrade : gradeByKey.get(normKey(rawGrade));
        if (!grade) {
          throw new Error(`"grade" "${rawGrade}" doesn't match any grade configured for this school. Valid grades: ${gradeDocs.map((g: any) => g.name).join(', ')}.`);
        }

        const difficulty = raw.difficulty ? String(raw.difficulty).trim().toLowerCase() : 'medium';
        if (!validDifficulty.includes(difficulty)) throw new Error(`"difficulty" must be one of: ${validDifficulty.join(', ')}.`);
        const bloomsLevel = raw.bloomsLevel ? String(raw.bloomsLevel).trim().toLowerCase() : 'understand';
        if (!validBlooms.includes(bloomsLevel)) throw new Error(`"bloomsLevel" must be one of: ${validBlooms.join(', ')}.`);

        // Same real Question document a single-row create would end up
        // with, not a hand-picked subset - every column the template
        // exposes maps to the exact schema field it saves as.
        const options: { text: string; isCorrect: boolean }[] = [];
        if (type === 'mcq') {
          for (let n = 1; n <= 6; n++) {
            const text = raw[`option${n}`] ? String(raw[`option${n}`]).trim() : '';
            if (!text) continue;
            const isCorrect = ['true', '1', 'yes', 'y'].includes(String(raw[`option${n}Correct`] || '').trim().toLowerCase());
            options.push({ text, isCorrect });
          }
          if (options.length < 2) throw new Error('An MCQ question needs at least 2 non-empty options (option1, option2, ...).');
          if (!options.some(o => o.isCorrect)) throw new Error('An MCQ question needs exactly one option marked correct (option1Correct=true, etc).');
        }

        // Exact-duplicate protection (question bank has none at all
        // otherwise - same schoolSlug+subject+grade+questionText was
        // previously accepted unlimited times with zero warning). Skipped
        // rather than erroring, since re-uploading the same shared
        // spreadsheet next term with a few new rows added is the expected
        // normal use of this import, not a mistake to block on.
        const dup = await this.questionModel.findOne({ schoolSlug, subject, grade, questionText }).select('_id').lean();
        if (dup) {
          results.push({ row: i + 1, status: 'skipped', message: 'An identical question already exists for this subject/grade - not re-added.' });
          continue;
        }

        const marks = raw.marks !== undefined && raw.marks !== '' && !isNaN(Number(raw.marks)) ? Number(raw.marks) : 1;
        const tags = raw.tags ? String(raw.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        const correctAnswer = raw.correctAnswer ? String(raw.correctAnswer).trim() : undefined;

        await this.questionModel.create({
          schoolSlug, addedBy, subject, grade, type, difficulty, bloomsLevel, questionText, marks, tags,
          topic: raw.topic ? String(raw.topic).trim() : undefined,
          chapter: raw.chapter ? String(raw.chapter).trim() : undefined,
          options: type === 'mcq' ? options : undefined,
          correctAnswer: type !== 'mcq' ? correctAnswer : undefined,
          answerExplanation: raw.answerExplanation ? String(raw.answerExplanation).trim() : undefined,
        });
        results.push({ row: i + 1, status: 'created' });
      } catch (err: any) {
        results.push({ row: i + 1, status: 'error', message: err?.message || 'Import failed.' });
      }
    }

    return {
      created: results.filter(r => r.status === 'created').length,
      skipped: results.filter(r => r.status === 'skipped'),
      errors: results.filter(r => r.status === 'error'),
    };
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async getQuestions(schoolSlug: string, query: QuestionQueryDto) {
    const { page, limit, search, subject, grade, topic, type, difficulty, bloomsLevel } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    // Subject/grade on a question are free-typed strings (bulk import
    // only trims them, no lookup against the canonical Subjects/Grades
    // lists) - matching them case-sensitively against the canonical
    // dropdown value the exam-paper builder sends ("Urdu" vs "urdu",
    // trailing spaces, etc.) silently hid real questions from paper
    // generation while the Question Bank list screen (unfiltered by
    // default) kept showing them fine. Same case-insensitive/trimmed
    // approach as `topic` below fixes both without needing a data
    // migration.
    if (subject) filter.subject = { $regex: `^${this.escapeRegex(subject.trim())}$`, $options: 'i' };
    if (grade) filter.grade = { $regex: `^${this.escapeRegex(grade.trim())}$`, $options: 'i' };
    if (topic) filter.topic = { $regex: this.escapeRegex(topic), $options: 'i' };
    if (type) filter.type = type;
    if (difficulty) filter.difficulty = difficulty;
    if (bloomsLevel) filter.bloomsLevel = bloomsLevel;
    if (search) {
      const safeSearch = this.escapeRegex(search);
      filter.$or = [
        { questionText: { $regex: safeSearch, $options: 'i' } },
        { tags: { $in: [new RegExp(safeSearch, 'i')] } },
      ];
    }

    const [data, total] = await Promise.all([
      this.questionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit!),
      this.questionModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async getQuestionStats(schoolSlug: string, subject?: string, grade?: string) {
    const filter: any = { schoolSlug };
    // Same case-insensitive/trimmed matching as getQuestions - see the
    // comment there.
    if (subject) filter.subject = { $regex: `^${this.escapeRegex(subject.trim())}$`, $options: 'i' };
    if (grade) filter.grade = { $regex: `^${this.escapeRegex(grade.trim())}$`, $options: 'i' };

    const [total, byType, byDifficulty, byBlooms, bySubject] = await Promise.all([
      this.questionModel.countDocuments(filter),
      this.questionModel.aggregate([
        { $match: filter },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      this.questionModel.aggregate([
        { $match: filter },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      ]),
      this.questionModel.aggregate([
        { $match: filter },
        { $group: { _id: '$bloomsLevel', count: { $sum: 1 } } },
      ]),
      this.questionModel.aggregate([
        { $match: filter },
        { $group: { _id: '$subject', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);
    return { total, byType, byDifficulty, byBlooms, bySubject };
  }

  async deleteQuestion(id: string, schoolSlug: string) {
    await this.questionModel.findOneAndDelete({ _id: id, schoolSlug });
    return { message: 'Question deleted' };
  }

  async updateQuestion(id: string, schoolSlug: string, dto: Partial<CreateQuestionDto>) {
    const question = await this.questionModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: dto },
      { new: true },
    );
    if (!question) throw new NotFoundException('Question not found.');
    return question;
  }

  // ============================================================
  // MARK ENTRY
  // ============================================================
  /**
   * TEACHER role only: marks are frozen once the assessment's results are
   * published ('result_published' status / resultPublished flag, see
   * assessment.schema.ts status enum) or the assessment is 'cancelled'.
   * 'draft' is NOT blocked server-side (unchanged behaviour; the app disables entry).
   */
  private assertTeacherMarksNotLocked(assessment: any) {
    if (!assessment) return;
    if (assessment.status === 'result_published' || assessment.status === 'cancelled' || assessment.resultPublished === true) {
      throw new ForbiddenException(TEACHER_MARKS_LOCKED_MESSAGE);
    }
  }

  /**
   * BB6: marks are entered / edited for the teacher's own class + subject only (a class teacher: every subject of their class; a subject teacher: their
   * (class, subject) pairs; the web's assessment carries grade/section and subjects[].subject). An assessment without a section covers the whole grade and
   * is matched by class only (a teacher of section A enters their own students' marks). TEACHER_SCOPE_GUARD_MODE: log = would_deny line, enforce = 403.
   * Used by the bulk entry AND the single-mark edit of the Mark Sheet (PATCH marks/:id); the delete is admin-only at the controller.
   */
  private async assertTeacherMarksScope(user: any, assessment: any, subject: string, route: string): Promise<void> {
    const scope = await this.teacherContext(user);
    if (!mayTeacherAccessClassSubject(scope, { grade: assessment?.grade, section: assessment?.section, subject })) {
      teacherScopeVerdict(user, route, 'teacher_marks_outside_assignment', 'You can only enter marks for your own class and subject.');
    }
  }

  async bulkEnterMarks(dto: BulkMarkEntryDto, requestingUser?: ScopedUser) {
    const assessment = await this.assessmentModel.findById(dto.assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');

    const subjectConfig = assessment.subjects.find(s => s.subject === dto.subject);
    if (!subjectConfig) throw new BadRequestException(`Subject ${dto.subject} not in assessment`);

    // TEACHER role only (other roles keep today's overwrite behaviour):
    // validate EVERYTHING first, then write. Nothing is written when any
    // row is out of bounds or already verified (locked).
    const teacher = isTeacherCaller(requestingUser);
    if (teacher) {
      await this.assertTeacherMarksScope(requestingUser, assessment, dto.subject, 'POST /assessments/marks/bulk');
      this.assertTeacherMarksNotLocked(assessment);
      const bad: string[] = [];
      for (const m of dto.marks) {
        if (m.isAbsent || m.isExempt) continue;
        const v: any = m.obtainedMarks;
        if (v === undefined || v === null) continue;
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > subjectConfig.totalMarks) {
          bad.push(`${m.studentName || m.studentId}${m.rollNumber ? ` (roll ${m.rollNumber})` : ''}: ${v}`);
        }
      }
      if (bad.length) {
        throw new BadRequestException(`Marks must be between 0 and ${subjectConfig.totalMarks} for ${dto.subject}. Invalid for ${bad.length} student(s): ${bad.join('; ')}`);
      }
      const ids = dto.marks.map(m => new Types.ObjectId(m.studentId));
      const locked: any[] = await this.markModel.find({
        assessmentId: new Types.ObjectId(dto.assessmentId), subject: dto.subject, schoolSlug: dto.schoolSlug,
        studentId: { $in: ids }, verified: true,
      }).select('studentId studentName rollNumber').lean() as any;
      if (locked.length) {
        const names = locked.map(l => `${l.studentName || l.studentId}${l.rollNumber ? ` (roll ${l.rollNumber})` : ''}`);
        throw new ConflictException(`Marks for ${locked.length} students are verified and locked: ${names.join('; ')}`);
      }
    }

    const ops = dto.marks.map(m => {
      const { percentage, grade_result, gpa, result } = computeMarkOutcome(
        m.obtainedMarks, m.isAbsent, m.isExempt, subjectConfig.totalMarks, subjectConfig.passingMarks,
      );

      return {
        updateOne: {
          filter: {
            assessmentId: new Types.ObjectId(dto.assessmentId),
            studentId: new Types.ObjectId(m.studentId),
            subject: dto.subject,
            schoolSlug: dto.schoolSlug,
          },
          update: {
            $set: {
              assessmentTitle: assessment.title,
              studentName: m.studentName,
              rollNumber: m.rollNumber,
              grade: dto.grade,
              section: m.section,
              totalMarks: subjectConfig.totalMarks,
              passingMarks: subjectConfig.passingMarks,
              obtainedMarks: m.obtainedMarks,
              isAbsent: m.isAbsent || false,
              isExempt: m.isExempt || false,
              // Mongoose strips undefined keys from $set, so for an
              // absent/exempt row percentage/grade/gpa of an earlier score
              // would survive. Teacher writes clear them explicitly.
              ...(teacher ? { percentage: percentage ?? null, grade_result: grade_result ?? null, gpa: gpa ?? null } : { percentage, grade_result, gpa }),
              result,
              remarks: m.remarks,
              enteredBy: dto.enteredBy,
              academicYear: dto.academicYear,
              schoolSlug: dto.schoolSlug,
            },
          },
          upsert: true,
        },
      };
    });

    await this.markModel.bulkWrite(ops as any);
    return { message: `Marks entered for ${dto.marks.length} students`, subject: dto.subject };
  }

  async getMarks(schoolSlug: string, query: MarkQueryDto) {
    const { page, limit, assessmentId, studentId, grade, section, subject, verified } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (assessmentId) filter.assessmentId = new Types.ObjectId(assessmentId);
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (grade) filter.grade = grade;
    if (section) filter.section = section;
    if (subject) filter.subject = subject;
    if (verified !== undefined) filter.verified = verified;

    const [data, total] = await Promise.all([
      this.markModel.find(filter).sort({ rollNumber: 1 }).skip(skip).limit(limit!),
      this.markModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async verifyMarks(dto: VerifyMarksDto & { schoolSlug: string; verifiedBy: string }) {
    return this.markModel.updateMany(
      {
        assessmentId: new Types.ObjectId(dto.assessmentId),
        subject: dto.subject,
        grade: dto.grade,
        schoolSlug: dto.schoolSlug,
      },
      { $set: { verified: true, verifiedBy: dto.verifiedBy } },
    );
  }

  /** Edits one already-saved mark from the Mark Sheet - the gap that made
   * "enter marks" effectively write-once: the only other entry point,
   * bulkEnterMarks, always seeds blank rows from the class roster rather
   * than loading what's already saved, so there was no way to correct a
   * single student's mark short of re-running the whole subject's entry.
   * Recomputes percentage/grade/gpa/result with the exact same formula
   * bulkEnterMarks uses (computeMarkOutcome), off the mark's own stored
   * totalMarks/passingMarks rather than re-reading the assessment - keeps
   * the edit consistent with whatever was already on screen even if the
   * assessment's subject config has since changed. */
  async updateMarkEntry(id: string, schoolSlug: string, dto: { obtainedMarks?: number; isAbsent?: boolean; isExempt?: boolean; remarks?: string }, requestingUser?: ScopedUser) {
    assertValidObjectId(id, 'mark entry');
    const mark: any = await this.markModel.findOne({ _id: id, schoolSlug });
    if (!mark) throw new NotFoundException('Mark entry not found');

    // Same teacher-only lock bulkEnterMarks enforces - other roles
    // (admin, principal, etc.) keep today's overwrite behaviour.
    if (isTeacherCaller(requestingUser)) {
      const assessment = await this.assessmentModel.findById(mark.assessmentId);
      await this.assertTeacherMarksScope(requestingUser, assessment, mark.subject, 'PATCH /assessments/marks/:id');
      this.assertTeacherMarksNotLocked(assessment);
      if (mark.verified) {
        throw new ConflictException(`Marks for ${mark.studentName || mark.studentId}${mark.rollNumber ? ` (roll ${mark.rollNumber})` : ''} are verified and locked.`);
      }
    }

    const isAbsent = dto.isAbsent ?? mark.isAbsent ?? false;
    const isExempt = dto.isExempt ?? mark.isExempt ?? false;
    const obtainedMarks = (isAbsent || isExempt) ? undefined : (dto.obtainedMarks ?? mark.obtainedMarks);
    if (!isAbsent && !isExempt && obtainedMarks !== undefined) {
      if (typeof obtainedMarks !== 'number' || !Number.isFinite(obtainedMarks) || obtainedMarks < 0 || obtainedMarks > mark.totalMarks) {
        throw new BadRequestException(`Marks must be between 0 and ${mark.totalMarks}.`);
      }
    }
    const { percentage, grade_result, gpa, result } = computeMarkOutcome(obtainedMarks, isAbsent, isExempt, mark.totalMarks, mark.passingMarks);

    mark.obtainedMarks = obtainedMarks;
    mark.isAbsent = isAbsent;
    mark.isExempt = isExempt;
    mark.percentage = percentage ?? null;
    mark.grade_result = grade_result ?? null;
    mark.gpa = gpa ?? null;
    mark.result = result;
    if (dto.remarks !== undefined) mark.remarks = dto.remarks;
    await mark.save();
    return mark;
  }

  /** Deletes one mark entry - e.g. a student added to the roster by mistake,
   * or a row that needs to be re-entered from scratch. Gated at the
   * controller level to admin-type roles only (TEACHING_ADMIN_ROLES) -
   * stricter than editing, since removing a result entirely (rather than
   * correcting it) is the more consequential action. */
  async deleteMarkEntry(id: string, schoolSlug: string) {
    assertValidObjectId(id, 'mark entry');
    const mark = await this.markModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!mark) throw new NotFoundException('Mark entry not found');
    return { success: true };
  }

  // ============================================================
  // LMS PHASE 2 — SELF-PACED ONLINE QUIZZES
  // A student's own run through an Assessment subject's linked ExamPaper.
  // Objective types (mcq/true_false) auto-grade at submit; everything
  // else (short/long/fill_blank/matching) is free text held for a
  // teacher's manual review - never auto-marked "correct" on a fuzzy
  // text match. Once every answer has a mark, the result is upserted
  // into the exact same MarkEntry collection bulkEnterMarks already
  // writes to, so Report Cards pick it up with zero changes.
  // ============================================================
  private readonly AUTO_GRADABLE_TYPES = ['mcq', 'true_false'];

  // Strips answer keys (isCorrect/correctAnswer) before a question ever
  // reaches the student - the only information that must never leak into
  // an in-progress quiz response.
  private sanitizeQuestionForStudent(q: any) {
    return {
      _id: q._id, subject: q.subject, type: q.type, questionText: q.questionText,
      questionImage: q.questionImage, marks: q.marks,
      options: q.type === 'mcq' ? (q.options || []).map((o: any) => ({ text: o.text })) : undefined,
    };
  }

  private async loadExamPaperQuestions(examPaperId: any, schoolSlug: string) {
    const paper = await this.examPaperModel.findOne({ _id: examPaperId, schoolSlug }).lean();
    if (!paper) throw new NotFoundException('This subject has no quiz paper linked - ask your teacher to link one in Paper Generation.');
    const questionIds = (paper as any).sections.flatMap((s: any) => s.questionIds);
    const questions = await this.questionModel.find({ _id: { $in: questionIds }, schoolSlug }).lean();
    const byId = new Map(questions.map((q: any) => [String(q._id), q]));
    // Preserve the paper's own question order, not Mongo's natural order.
    return questionIds.map((id: any) => byId.get(String(id))).filter(Boolean);
  }

  /** Student starts (or resumes, if already in progress) a subject's
   * online quiz. Returns the attempt plus answer-key-free questions. */
  async startQuizAttempt(schoolSlug: string, studentId: string, dto: { assessmentId: string; subject: string }) {
    const assessment = await this.assessmentModel.findOne({ _id: dto.assessmentId, schoolSlug }).lean();
    if (!assessment) throw new NotFoundException('Assessment not found');
    if ((assessment as any).deliveryMode !== 'self_paced_online') throw new BadRequestException('This assessment is not delivered online.');
    const subjectConfig = (assessment as any).subjects.find((s: any) => s.subject === dto.subject);
    if (!subjectConfig) throw new BadRequestException(`Subject ${dto.subject} not in this assessment`);
    if (!subjectConfig.examPaperId) throw new BadRequestException('No quiz paper linked to this subject yet.');

    const existingInProgress = await this.quizAttemptModel.findOne({
      studentId: new Types.ObjectId(studentId), assessmentId: new Types.ObjectId(dto.assessmentId),
      subject: dto.subject, status: 'in_progress',
    }).lean();
    const questions = await this.loadExamPaperQuestions(subjectConfig.examPaperId, schoolSlug);

    if (existingInProgress) {
      return { attempt: existingInProgress, questions: questions.map((q: any) => this.sanitizeQuestionForStudent(q)) };
    }

    const priorAttempts = await this.quizAttemptModel.countDocuments({
      studentId: new Types.ObjectId(studentId), assessmentId: new Types.ObjectId(dto.assessmentId), subject: dto.subject,
    });
    if (priorAttempts >= (subjectConfig.attemptsAllowed || 1)) {
      throw new BadRequestException('No attempts remaining for this quiz.');
    }

    const student: any = await this.studentModel.findOne({ _id: studentId, schoolSlug }).lean();
    if (!student) throw new NotFoundException('Student not found');

    const attempt = await this.quizAttemptModel.create({
      studentId, studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      rollNumber: student.currentRollNumber,
      assessmentId: dto.assessmentId, assessmentTitle: (assessment as any).title, subject: dto.subject,
      examPaperId: subjectConfig.examPaperId, grade: (assessment as any).grade, section: student.currentSection,
      academicYear: (assessment as any).academicYear,
      totalMarks: subjectConfig.totalMarks, passingMarks: subjectConfig.passingMarks,
      attemptNumber: priorAttempts + 1, status: 'in_progress', schoolSlug,
    });
    return { attempt, questions: questions.map((q: any) => this.sanitizeQuestionForStudent(q)) };
  }

  /** Grades every answer against the real question (server-side only -
   * the answer key never reached the student) and upserts a MarkEntry
   * the moment nothing is left needing manual review. */
  async submitQuizAttempt(schoolSlug: string, studentId: string, attemptId: string, answers: { questionId: string; selectedOptionIndex?: number; textAnswer?: string }[]) {
    const attempt = await this.quizAttemptModel.findOne({ _id: attemptId, studentId, schoolSlug });
    if (!attempt) throw new NotFoundException('Quiz attempt not found');
    if (attempt.status !== 'in_progress') throw new BadRequestException('This attempt has already been submitted.');

    const questions = await this.loadExamPaperQuestions(attempt.examPaperId, schoolSlug);
    const answerByQuestionId = new Map(answers.map(a => [a.questionId, a]));

    let autoGradedMarks = 0;
    let anyPending = false;
    const gradedAnswers = questions.map((q: any) => {
      const submitted = answerByQuestionId.get(String(q._id));
      const needsManualGrading = !this.AUTO_GRADABLE_TYPES.includes(q.type);
      let isCorrect: boolean | null = null;
      let marksAwarded: number | null = null;

      if (needsManualGrading) {
        anyPending = true;
      } else if (submitted) {
        if (q.type === 'mcq') {
          const correctIndex = (q.options || []).findIndex((o: any) => o.isCorrect);
          isCorrect = submitted.selectedOptionIndex === correctIndex;
        } else if (q.type === 'true_false') {
          isCorrect = (submitted.textAnswer || '').trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase();
        }
        marksAwarded = isCorrect ? q.marks : 0;
        autoGradedMarks += marksAwarded || 0;
      } else {
        // Left blank - auto-gradable but unanswered scores 0, not pending.
        isCorrect = false;
        marksAwarded = 0;
      }

      return {
        questionId: q._id, selectedOptionIndex: submitted?.selectedOptionIndex,
        textAnswer: submitted?.textAnswer, needsManualGrading, isCorrect, marksAwarded,
      };
    });

    attempt.answers = gradedAnswers as any;
    attempt.autoGradedMarks = autoGradedMarks;
    attempt.submittedAt = new Date();
    if (anyPending) {
      attempt.status = 'submitted';
      attempt.obtainedMarks = null;
    } else {
      attempt.status = 'graded';
      attempt.obtainedMarks = autoGradedMarks;
      attempt.gradedAt = new Date();
    }
    await attempt.save();

    if (attempt.status === 'graded') await this.upsertMarkEntryFromAttempt(attempt);
    return attempt;
  }

  /** Teacher-side review queue - attempts with at least one subjective
   * answer still awaiting a mark. */
  async getQuizAttemptsPendingReview(schoolSlug: string, assessmentId?: string, subject?: string, requestingUser?: ScopedUser) {
    const filter: any = { schoolSlug, status: 'submitted' };
    if (assessmentId) filter.assessmentId = new Types.ObjectId(assessmentId);
    if (subject) filter.subject = subject;
    const rows: any[] = await this.quizAttemptModel.find(filter).sort({ submittedAt: 1 }).lean() as any;
    if (!isTeacherCaller(requestingUser)) return rows;
    // TEACHER role only: just the attempts of classes I teach (class teacher
    // class + currentAssignments), matched with the tolerant grade/section rules.
    const t = await this.teacherContext(requestingUser);
    const resolved = await this.fillMissingAttemptSections(rows, schoolSlug);
    return rows.filter((_, i) => this.canTeacherAccessAttempt(t, resolved[i]));
  }

  async getQuizAttemptForReview(schoolSlug: string, attemptId: string, requestingUser?: ScopedUser) {
    assertValidObjectId(attemptId, 'quiz attempt');
    const attempt = await this.quizAttemptModel.findOne({ _id: attemptId, schoolSlug }).lean();
    if (!attempt) throw new NotFoundException('Quiz attempt not found');
    if (isTeacherCaller(requestingUser)) {
      const t = await this.teacherContext(requestingUser);
      const [resolved] = await this.fillMissingAttemptSections([attempt], schoolSlug);
      if (!this.canTeacherAccessAttempt(t, resolved)) {
        throw new ForbiddenException('You can only review quiz attempts of your own class or of the subjects you teach.');
      }
    }
    const questions = await this.loadExamPaperQuestions((attempt as any).examPaperId, schoolSlug);
    const questionById = new Map(questions.map((q: any) => [String(q._id), q]));
    return {
      ...attempt,
      answers: (attempt as any).answers.map((a: any) => ({ ...a, question: questionById.get(String(a.questionId)) })),
    };
  }

  /** Teacher awards marks for the subjective answers on one attempt.
   * Once nothing is left pending, finalizes obtainedMarks and upserts
   * the MarkEntry - same completion path submitQuizAttempt uses when an
   * attempt happens to need no manual grading at all. */
  async gradeQuizAttempt(schoolSlug: string, attemptId: string, grades: { questionId: string; marksAwarded: number }[], gradedBy: string, requestingUser?: ScopedUser) {
    assertValidObjectId(attemptId, 'quiz attempt');
    const attempt = await this.quizAttemptModel.findOne({ _id: attemptId, schoolSlug });
    if (!attempt) throw new NotFoundException('Quiz attempt not found');
    if (attempt.status === 'in_progress') throw new BadRequestException('This attempt has not been submitted yet.');

    if (isTeacherCaller(requestingUser)) {
      // TEACHER role only. Must teach the attempt's class; no re-grade of an
      // already graded attempt; every mark within 0..that question's marks.
      const t = await this.teacherContext(requestingUser);
      const [resolved] = await this.fillMissingAttemptSections([(attempt as any).toObject ? (attempt as any).toObject() : attempt], schoolSlug);
      if (!this.canTeacherAccessAttempt(t, resolved)) {
        throw new ForbiddenException('You can only grade quiz attempts of your own class or of the subjects you teach.');
      }
      this.assertTeacherMarksNotLocked(await this.assessmentModel.findById((attempt as any).assessmentId));
      if (attempt.status === 'graded') throw new ConflictException('This attempt is already graded.');
      const questions: any[] = await this.loadExamPaperQuestions((attempt as any).examPaperId, schoolSlug);
      const maxById = new Map(questions.map((q: any) => [String(q._id), q.marks]));
      const manual = new Set((attempt.answers as any[]).filter(a => a.needsManualGrading).map(a => String(a.questionId)));
      const bad: string[] = [];
      for (const g of grades) {
        const qid = String(g.questionId);
        const max = maxById.get(qid);
        const v: any = g.marksAwarded;
        if (!manual.has(qid) || max === undefined) bad.push(`${qid}: not a manually graded question of this attempt`);
        else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) bad.push(`${qid}: ${v} (allowed 0..${max})`);
      }
      if (bad.length) throw new BadRequestException(`Invalid marks for ${bad.length} question(s): ${bad.join('; ')}`);
    }

    const gradeByQuestionId = new Map(grades.map(g => [g.questionId, g.marksAwarded]));
    for (const answer of attempt.answers as any[]) {
      if (!answer.needsManualGrading) continue;
      const awarded = gradeByQuestionId.get(String(answer.questionId));
      if (awarded != null) {
        answer.marksAwarded = awarded;
        answer.isCorrect = null; // subjective - "correct" isn't binary, only a mark is recorded
      }
    }
    attempt.markModified('answers');

    const stillPending = (attempt.answers as any[]).some((a: any) => a.needsManualGrading && a.marksAwarded == null);
    if (!stillPending) {
      attempt.obtainedMarks = (attempt.answers as any[]).reduce((sum: number, a: any) => sum + (a.marksAwarded || 0), 0);
      attempt.status = 'graded';
      attempt.gradedAt = new Date();
      attempt.gradedBy = gradedBy;
    }
    await attempt.save();
    if (attempt.status === 'graded') await this.upsertMarkEntryFromAttempt(attempt);
    return attempt;
  }

  // Shared completion path for both a fully-auto-graded submission and a
  // manually-completed review - writes into the same MarkEntry collection
  // and upsert key (assessmentId/studentId/subject/schoolSlug)
  // bulkEnterMarks already uses, so Report Cards aggregate quiz results
  // and teacher-entered marks identically.
  //
  // Data-integrity guard (ALL roles): an existing MarkEntry is overwritten
  // only when it is NOT verified AND it was itself written from a quiz
  // (quizAttemptId set, or the legacy 'Online Quiz (auto)' enteredBy marker
  // from before the marker existed). Manually entered or verified entries
  // are left untouched (logged); with no entry the result is inserted.
  private async upsertMarkEntryFromAttempt(attempt: any) {
    const key = { assessmentId: attempt.assessmentId, studentId: attempt.studentId, subject: attempt.subject, schoolSlug: attempt.schoolSlug };
    const existing: any = await this.markModel.findOne(key).select('verified enteredBy quizAttemptId').lean();
    if (existing) {
      const fromQuiz = !!existing.quizAttemptId || existing.enteredBy === 'Online Quiz (auto)';
      if (existing.verified || !fromQuiz) {
        this.logger.warn(`Quiz attempt ${attempt._id}: not overwriting ${existing.verified ? 'verified' : 'manually entered'} mark for student ${attempt.studentId} (${attempt.subject})`);
        return;
      }
    }
    const percentage = attempt.totalMarks > 0 ? parseFloat(((attempt.obtainedMarks / attempt.totalMarks) * 100).toFixed(1)) : 0;
    const gradeInfo = getGrade(percentage);
    const result = percentage >= ((attempt.passingMarks / (attempt.totalMarks || 1)) * 100) ? 'pass' : 'fail';
    await this.markModel.updateOne(
      key,
      {
        $set: {
          quizAttemptId: attempt._id,
          assessmentTitle: attempt.assessmentTitle, studentName: attempt.studentName, rollNumber: attempt.rollNumber,
          grade: attempt.grade, section: attempt.section, totalMarks: attempt.totalMarks, passingMarks: attempt.passingMarks,
          obtainedMarks: attempt.obtainedMarks, isAbsent: false, isExempt: false,
          percentage, grade_result: gradeInfo.grade, gpa: gradeInfo.gpa, result,
          enteredBy: 'Online Quiz (auto)', academicYear: attempt.academicYear, schoolSlug: attempt.schoolSlug,
        },
      },
      { upsert: true },
    );

    // LMS Phase 5 (gamification) - a non-blocking side effect, same
    // reasoning as CertificatesService.autoIssueCourseCompletion's own
    // call site: a points/badge hiccup must never fail the student's
    // actual quiz result from saving. Points scale with score (0-20);
    // 90%+ also earns the one-time "Quiz Ace" badge.
    if (this.gamificationService) {
      try {
        await this.gamificationService.awardPoints(
          attempt.schoolSlug, String(attempt.studentId), Math.round(percentage / 5), `Quiz: ${attempt.assessmentTitle}`,
          'quiz_attempt', String(attempt._id),
        );
        if (percentage >= 90) {
          await this.gamificationService.awardBadge(attempt.schoolSlug, String(attempt.studentId), 'quiz_ace', {
            sourceType: 'quiz_attempt', sourceId: String(attempt._id),
          });
        }
      } catch {
        // never let a gamification hiccup block the student's own quiz result from saving
      }
    }
  }

  /** Student-facing list: every self-paced subject available to this
   * student (by grade/section) across all assessments, with their own
   * attempt status per subject - powers Parent Portal's quiz list the
   * same way getMyCourses powers "My Courses". */
  async listAvailableQuizzes(schoolSlug: string, studentId: string, grade: string, section: string, campusId?: any) {
    const filter: any = { schoolSlug, grade, deliveryMode: 'self_paced_online', status: { $in: ['scheduled', 'ongoing', 'completed'] } };
    if (campusId) filter.campusId = campusId;
    const assessments = await this.assessmentModel.find(filter).lean();
    const assessmentIds = assessments.map((a: any) => a._id);
    const attempts = await this.quizAttemptModel.find({ studentId: new Types.ObjectId(studentId), assessmentId: { $in: assessmentIds } }).lean();
    const attemptsByKey = new Map<string, any[]>();
    for (const a of attempts) {
      const key = `${a.assessmentId}-${a.subject}`;
      (attemptsByKey.get(key) ?? attemptsByKey.set(key, []).get(key)!).push(a);
    }

    return assessments.flatMap((a: any) =>
      (a.subjects || [])
        .filter((s: any) => s.examPaperId && (!s.section || !section || s.section === section))
        .map((s: any) => {
          const myAttempts = attemptsByKey.get(`${a._id}-${s.subject}`) || [];
          const latest = myAttempts.sort((x: any, y: any) => y.attemptNumber - x.attemptNumber)[0] || null;
          return {
            assessmentId: a._id, assessmentTitle: a.title, type: a.type, subject: s.subject,
            totalMarks: s.totalMarks, passingMarks: s.passingMarks, attemptsAllowed: s.attemptsAllowed || 1,
            attemptsUsed: myAttempts.length,
            latestAttempt: latest ? { id: latest._id, status: latest.status, obtainedMarks: latest.obtainedMarks } : null,
          };
        }),
    );
  }

  async getMarkSheetSummary(assessmentId: string, grade: string, subject: string, schoolSlug: string) {
    const marks = await this.markModel.find({
      assessmentId: new Types.ObjectId(assessmentId), grade, subject, schoolSlug,
    }).sort({ rollNumber: 1 });

    const appeared = marks.filter(m => !m.isAbsent && !m.isExempt);
    const passCount = appeared.filter(m => m.result === 'pass').length;
    const avgPct = appeared.length > 0
      ? appeared.reduce((a, m) => a + (m.percentage || 0), 0) / appeared.length : 0;
    const highest = appeared.reduce((a, m) => Math.max(a, m.obtainedMarks || 0), 0);
    const lowest = appeared.reduce((a, m) => Math.min(a, m.obtainedMarks || Infinity), Infinity);

    return {
      marks, summary: {
        total: marks.length, appeared: appeared.length,
        absent: marks.filter(m => m.isAbsent).length,
        pass: passCount, fail: appeared.length - passCount,
        passRate: appeared.length > 0 ? ((passCount / appeared.length) * 100).toFixed(1) : 0,
        avgPercentage: avgPct.toFixed(1), highest, lowest,
      },
    };
  }

  // ============================================================
  // REPORT CARDS
  // ============================================================
  async generateReportCards(dto: GenerateReportCardsDto) {
    const assessment = await this.assessmentModel.findById(dto.assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');

    // Get all marks for this assessment
    const allMarks = await this.markModel.find({
      assessmentId: new Types.ObjectId(dto.assessmentId),
      schoolSlug: dto.schoolSlug,
    });

    // Group by student
    const studentMap = new Map<string, MarkEntry[]>();
    for (const mark of allMarks) {
      const key = mark.studentId.toString();
      if (!studentMap.has(key)) studentMap.set(key, []);
      studentMap.get(key)!.push(mark);
    }

    // Generate report cards
    const reportCards: any[] = [];
    for (const [studentId, marks] of studentMap) {
      const firstMark = marks[0];
      const validMarks = marks.filter(m => !m.isAbsent && !m.isExempt);

      const totalMax = marks.reduce((a, m) => a + m.totalMarks, 0);
      const totalObtained = validMarks.reduce((a, m) => a + (m.obtainedMarks || 0), 0);
      const pct = totalMax > 0 ? parseFloat(((totalObtained / totalMax) * 100).toFixed(1)) : 0;
      const gradeInfo = getGrade(pct);
      const anyFail = marks.some(m => m.result === 'fail');

      const subjects = marks.map(m => ({
        subject: m.subject,
        totalMarks: m.totalMarks,
        obtainedMarks: m.obtainedMarks || 0,
        percentage: m.percentage || 0,
        grade: m.grade_result || 'F',
        gpa: m.gpa || 0,
        result: m.result || 'fail',
        remarks: m.remarks || '',
      }));

      reportCards.push({
        assessmentId: new Types.ObjectId(dto.assessmentId),
        assessmentTitle: assessment.title,
        assessmentType: assessment.type,
        studentId: new Types.ObjectId(studentId),
        studentName: firstMark.studentName,
        rollNumber: firstMark.rollNumber,
        grade: firstMark.grade,
        section: firstMark.section,
        academicYear: assessment.academicYear,
        term: assessment.term,
        subjects,
        totalMaxMarks: totalMax,
        totalObtainedMarks: totalObtained,
        overallPercentage: pct,
        overallGrade: gradeInfo.grade,
        overallGPA: gradeInfo.gpa,
        overallResult: anyFail ? 'fail' : 'pass',
        schoolSlug: dto.schoolSlug,
      });
    }

    // Upsert report cards
    const ops = reportCards.map(rc => ({
      updateOne: {
        filter: { assessmentId: rc.assessmentId, studentId: rc.studentId, schoolSlug: rc.schoolSlug },
        // published is only defaulted on first insert so regenerating a
        // published assessment never hides it from parents again.
        update: { $set: rc, $setOnInsert: { published: false } },
        upsert: true,
      },
    }));
    await this.reportCardModel.bulkWrite(ops);

    // Assign class positions
    const saved = await this.reportCardModel.find({
      assessmentId: new Types.ObjectId(dto.assessmentId),
      schoolSlug: dto.schoolSlug,
    }).sort({ overallPercentage: -1 });

    const totalStudents = saved.length;
    for (let i = 0; i < saved.length; i++) {
      saved[i].classPosition = i + 1;
      saved[i].totalStudents = totalStudents;
      await saved[i].save();
    }

    // Update assessment status
    await this.assessmentModel.findByIdAndUpdate(dto.assessmentId, {
      $set: { status: 'completed', gradeCardsGenerated: true },
    });

    return { message: `${reportCards.length} report cards generated`, count: reportCards.length };
  }

  async getReportCards(schoolSlug: string, query: ReportCardQueryDto) {
    const { page, limit, assessmentId, studentId, grade, academicYear, published } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (assessmentId) filter.assessmentId = new Types.ObjectId(assessmentId);
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (grade) filter.grade = grade;
    if (academicYear) filter.academicYear = academicYear;
    if (published !== undefined) filter.published = published;

    const [data, total] = await Promise.all([
      this.reportCardModel.find(filter).sort({ classPosition: 1 }).skip(skip).limit(limit!),
      this.reportCardModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async getStudentReportCard(assessmentId: string, studentId: string, schoolSlug: string) {
    const rc = await this.reportCardModel.findOne({
      assessmentId: new Types.ObjectId(assessmentId),
      studentId: new Types.ObjectId(studentId),
      schoolSlug,
    });
    if (!rc) throw new NotFoundException('Report card not found');
    return rc;
  }

  async updateReportCardRemarks(id: string, schoolSlug: string, dto: UpdateReportCardRemarksDto, requestingUser?: ScopedUser) {
    if (isTeacherCaller(requestingUser)) {
      // TEACHER role only: must be the CLASS TEACHER of the card's class,
      // may only write classTeacherRemarks, unknown id is a 404.
      const t = await this.teacherContext(requestingUser);
      const card: any = Types.ObjectId.isValid(id) ? await this.reportCardModel.findOne({ _id: id, schoolSlug }).select('grade section').lean() : null;
      if (!card) throw new NotFoundException('Report card not found');
      if (!this.classIncludes(t.classTeacherClasses, card.grade, card.section)) {
        throw new ForbiddenException('Only the class teacher of this class can edit report card remarks.');
      }
      const $set: any = {};
      if (dto.classTeacherRemarks !== undefined) $set.classTeacherRemarks = dto.classTeacherRemarks;
      if (!Object.keys($set).length) return this.reportCardModel.findOne({ _id: id, schoolSlug });
      return this.reportCardModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set }, { new: true });
    }
    assertValidObjectId(id, 'report card');
    return this.reportCardModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
  }

  async publishResults(dto: PublishResultDto) {
    await this.reportCardModel.updateMany(
      { assessmentId: new Types.ObjectId(dto.assessmentId), schoolSlug: dto.schoolSlug },
      { $set: { published: true, publishedAt: new Date() } },
    );
    const assessment: any = await this.assessmentModel.findByIdAndUpdate(dto.assessmentId, {
      $set: { status: 'result_published', resultPublished: true, resultPublishedAt: new Date(), resultPublishedBy: dto.publishedBy },
    });
    const cards: any[] = await this.reportCardModel.find({ assessmentId: new Types.ObjectId(dto.assessmentId), schoolSlug: dto.schoolSlug }).select('studentId').lean();
    await notifyGuardiansOfStudents(this.reportCardModel.db, cards.map((c) => c.studentId), {
      schoolSlug: dto.schoolSlug as string, type: 'result', title: 'Results published',
      body: `${assessment?.title || 'Assessment'} results are now available.`, relatedEntityId: String(dto.assessmentId),
    });
    return { message: 'Results published successfully' };
  }

  // ============================================================
  // TERM REPORT CARDS (comprehensive, whole-term report)
  // ============================================================
  /** Generates one TermReportCard per student in scope, combining every
   * assessment this academicYear+term into a term-wide academic summary
   * and class position (NOT the same as ReportCard.classPosition, which
   * only ranks within one exam), plus whichever optional sections the
   * admin asked for - Tarbiyah, Qaida, Nazra, attendance, compiled
   * teacher feedback, Parent Engagement Score. A student with no marks
   * at all for this academicYear+term is skipped (nothing academic to
   * report), same convention as generateReportCards. */
  async generateTermReportCards(dto: GenerateTermReportCardsDto) {
    if (!this.termReportCardModel) throw new InternalServerErrorException('Term report cards are not available');
    const { academicYear, term, scopeType = 'all', scopeValue, schoolSlug, generatedBy } = dto;
    const sections = dto.sections || {};

    const studentMatch: any = { schoolSlug, status: 'active' };
    if (scopeType === 'class' && scopeValue) {
      studentMatch.currentGrade = scopeValue;
    } else if (scopeType === 'section' && scopeValue) {
      const [g, s] = scopeValue.split('::');
      studentMatch.currentGrade = g;
      if (s) studentMatch.currentSection = s;
    } else if (scopeType === 'student' && scopeValue) {
      studentMatch._id = new Types.ObjectId(scopeValue);
    }
    const students = await this.studentModel.find(studentMatch).lean();
    if (students.length === 0) return { message: 'No matching active students found for this scope', count: 0, skipped: 0 };
    const studentIds = students.map((s: any) => s._id);

    // Every assessment in this term feeds the academic summary - a term
    // report isn't tied to one exam, unlike ReportCard.
    const assessments = await this.assessmentModel.find({ schoolSlug, academicYear, term }).lean();
    const assessmentIds = assessments.map((a: any) => a._id);
    const assessmentById = new Map(assessments.map((a: any) => [String(a._id), a]));

    const marks = assessmentIds.length
      ? await this.markModel.find({ schoolSlug, assessmentId: { $in: assessmentIds }, studentId: { $in: studentIds } }).lean()
      : [];
    if (marks.length === 0) return { message: `No marks found for any assessment in ${term} ${academicYear} for this scope`, count: 0, skipped: students.length };

    // Default term date range (for attendance/Qaida-Nazra-extras scoping
    // below) from the earliest/latest assessment in this term, unless the
    // admin gave explicit dates.
    const termFrom = dto.termStartDate || new Date(Math.min(...assessments.map((a: any) => new Date(a.startDate).getTime()))).toISOString().slice(0, 10);
    const termTo = dto.termEndDate || new Date(Math.max(...assessments.map((a: any) => new Date(a.endDate || a.startDate).getTime()))).toISOString().slice(0, 10);

    const marksByStudent = new Map<string, any[]>();
    for (const m of marks as any[]) {
      const key = String(m.studentId);
      (marksByStudent.get(key) ?? marksByStudent.set(key, []).get(key)!).push(m);
    }

    const analyticsRows: AnalyticsMarkRow[] = (marks as any[]).map((m) => ({
      studentId: String(m.studentId), studentName: m.studentName, grade: m.grade, section: m.section,
      subject: m.subject, totalMarks: m.totalMarks, obtainedMarks: m.obtainedMarks, isAbsent: m.isAbsent, isExempt: m.isExempt,
    }));
    const stats = computeStudentOverallStats(analyticsRows);

    // Rank within each grade/section separately - mixing classes into one
    // ranking (e.g. scopeType 'all' spanning several grades) would make
    // "class position" meaningless.
    const statsByClass = new Map<string, typeof stats>();
    for (const s of stats) {
      const key = `${s.grade}||${s.section || ''}`;
      (statsByClass.get(key) ?? statsByClass.set(key, []).get(key)!).push(s);
    }
    const statByStudent = new Map<string, ReturnType<typeof rankStudentStats>[number]>();
    for (const group of statsByClass.values()) {
      for (const ranked of rankStudentStats(group)) statByStudent.set(ranked.studentId, ranked);
    }

    const studentById = new Map(students.map((s: any) => [String(s._id), s]));
    let created = 0;
    const skippedStudentIds: string[] = [];

    for (const [studentId, stat] of statByStudent) {
      const student: any = studentById.get(studentId);
      if (!student) continue;
      const studentMarks = marksByStudent.get(studentId) || [];
      const firstMark = studentMarks[0];
      const gradeInfo = getGrade(stat.overallPct);

      const subjects = stat.subjects.map((sub) => ({
        subject: sub.subject, obtainedMarks: sub.obtainedMarks, totalMarks: sub.totalMarks,
        percentage: sub.pct, grade: getGrade(sub.pct).grade, isAbsent: sub.isAbsent,
      }));

      const assessmentsIncluded = Array.from(new Set(studentMarks.map((m: any) => String(m.assessmentId))))
        .map((id) => assessmentById.get(id))
        .filter(Boolean)
        .map((a: any) => ({ assessmentId: a._id, title: a.title, type: a.type, date: a.startDate }));

      const teacherFeedback: any[] = [];
      if (sections.teacherFeedback) {
        for (const m of studentMarks) {
          if (m.remarks) teacherFeedback.push({ source: 'subject_remark', date: m.updatedAt || m.createdAt, author: m.enteredBy, subject: m.subject, text: m.remarks });
        }
      }

      let tarbiyah: Record<string, any> | null = null;
      if (sections.tarbiyah && this.behaviourService) {
        try {
          const result = await this.behaviourService.getTarbiyahAssessments(schoolSlug as string, { studentId, academicYear, limit: 1 });
          const doc: any = result?.data?.[0];
          if (doc) {
            tarbiyah = {
              period: doc.period, overallScore: doc.overallScore, overallPercentage: doc.overallPercentage,
              overallRating: doc.overallRating, traits: doc.traits, teacherObservations: doc.teacherObservations,
              areasOfStrength: doc.areasOfStrength, areasForImprovement: doc.areasForImprovement, recommendedActions: doc.recommendedActions,
            };
            if (sections.teacherFeedback && doc.teacherObservations) {
              teacherFeedback.push({ source: 'tarbiyah', date: doc.assessmentDate, author: doc.assessedBy, text: doc.teacherObservations });
            }
          }
        } catch { /* a student with no Tarbiyah assessment yet is not an error - section stays null */ }
      }

      let qaida: Record<string, any> | null = null;
      if (sections.qaida && this.qaidaService) {
        try { qaida = await this.qaidaService.getReportData(studentId, schoolSlug as string); } catch { /* not enrolled in Qaida - not an error */ }
      }

      let nazra: Record<string, any> | null = null;
      if (sections.nazra && this.nazraService) {
        try { nazra = await this.nazraService.getReportData(studentId, schoolSlug as string); } catch { /* not enrolled in Nazra - not an error */ }
      }

      let qaidaNazraExtras: Record<string, any> | null = null;
      if ((sections.qaida || sections.nazra) && this.qaidaNazraExtrasService) {
        const [invigilator, homeLog] = await Promise.all([
          this.qaidaNazraExtrasService.getAssessmentsForStudent(studentId, schoolSlug as string),
          this.qaidaNazraExtrasService.getHomeLog(studentId, schoolSlug as string),
        ]);
        const inRange = (d: any) => d && new Date(d) >= new Date(termFrom) && new Date(d) <= new Date(termTo);
        qaidaNazraExtras = {
          invigilatorAssessments: (invigilator as any[]).filter((a: any) => inRange(a.visitDate)),
          homeLog: (homeLog as any[]).filter((h: any) => inRange(h.date)),
        };
        if (sections.teacherFeedback) {
          for (const a of qaidaNazraExtras.invigilatorAssessments) {
            if (a.overallRemarks) teacherFeedback.push({ source: 'ptm', date: a.visitDate, author: a.invigilatorName, text: a.overallRemarks });
          }
        }
      }

      let attendance: Record<string, any> | null = null;
      if (sections.attendance && this.studentsService) {
        const report: any = await this.studentsService.getStudentAttendanceSummaryReport(schoolSlug as string, { studentId, from: termFrom, to: termTo });
        attendance = { ...(report.rows?.[0] || {}), trend: report.trend || [] };
      }

      let parentEngagement: Record<string, any> | null = null;
      if (sections.parentEngagement && this.parentEngagementService) {
        parentEngagement = await this.parentEngagementService.computeScore(schoolSlug as string, studentId) as any;
      }

      if (sections.teacherFeedback && this.behaviourService) {
        try {
          const profile: any = await this.behaviourService.getStudentBehaviourProfile(studentId, schoolSlug as string, academicYear);
          for (const r of profile.recent || []) {
            teacherFeedback.push({ source: 'behaviour', date: r.date, author: r.reportedBy, text: `${r.title}: ${r.description}` });
          }
        } catch { /* behaviour profile lookup failing (e.g. no access context) must never block the whole report */ }
      }
      teacherFeedback.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      const doc = {
        studentId: student._id, studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim() || firstMark?.studentName,
        rollNumber: student.admissionNumber || firstMark?.rollNumber, grade: stat.grade, section: stat.section,
        academicYear, term,
        assessmentsIncluded, subjects,
        totalObtainedMarks: stat.totalObtained, totalMaxMarks: stat.totalMax, overallPercentage: stat.overallPct,
        overallGrade: gradeInfo.grade, overallGPA: gradeInfo.gpa, overallResult: stat.overallPct >= 40 ? 'pass' : 'fail',
        classPosition: stat.classPosition, totalStudents: stat.totalStudents,
        strongestSubject: stat.strongestSubject?.subject, weakestSubject: stat.weakestSubject?.subject,
        sectionsIncluded: {
          tarbiyah: !!sections.tarbiyah, qaida: !!sections.qaida, nazra: !!sections.nazra,
          attendance: !!sections.attendance, teacherFeedback: !!sections.teacherFeedback, parentEngagement: !!sections.parentEngagement,
        },
        tarbiyah, qaida, nazra, qaidaNazraExtras, attendance, parentEngagement, teacherFeedback,
        generatedBy, schoolSlug,
      };

      await this.termReportCardModel.findOneAndUpdate(
        { studentId: student._id, academicYear, term, schoolSlug },
        { $set: doc, $setOnInsert: { published: false } },
        { upsert: true },
      );
      created++;
    }

    for (const s of students as any[]) {
      if (!statByStudent.has(String(s._id))) skippedStudentIds.push(String(s._id));
    }

    return { message: `${created} term report card(s) generated`, count: created, skipped: skippedStudentIds.length };
  }

  async getTermReportCards(schoolSlug: string, query: TermReportCardQueryDto) {
    const { page, limit, studentId, grade, section, academicYear, term, published } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (grade) filter.grade = grade;
    if (section) filter.section = section;
    if (academicYear) filter.academicYear = academicYear;
    if (term) filter.term = term;
    if (published !== undefined) filter.published = published;

    const [data, total] = await Promise.all([
      this.termReportCardModel!.find(filter).sort({ classPosition: 1 }).skip(skip).limit(limit!),
      this.termReportCardModel!.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async getTermReportCard(id: string, schoolSlug: string) {
    assertValidObjectId(id, 'term report card');
    const rc = await this.termReportCardModel!.findOne({ _id: id, schoolSlug });
    if (!rc) throw new NotFoundException('Term report card not found');
    return rc;
  }

  async updateTermReportCardRemarks(id: string, schoolSlug: string, dto: UpdateReportCardRemarksDto, requestingUser?: ScopedUser) {
    if (isTeacherCaller(requestingUser)) {
      const t = await this.teacherContext(requestingUser);
      const card: any = Types.ObjectId.isValid(id) ? await this.termReportCardModel!.findOne({ _id: id, schoolSlug }).select('grade section').lean() : null;
      if (!card) throw new NotFoundException('Term report card not found');
      if (!this.classIncludes(t.classTeacherClasses, card.grade, card.section)) {
        throw new ForbiddenException('Only the class teacher of this class can edit report card remarks.');
      }
      const $set: any = {};
      if (dto.classTeacherRemarks !== undefined) $set.classTeacherRemarks = dto.classTeacherRemarks;
      if (!Object.keys($set).length) return this.termReportCardModel!.findOne({ _id: id, schoolSlug });
      return this.termReportCardModel!.findOneAndUpdate({ _id: id, schoolSlug }, { $set }, { new: true });
    }
    assertValidObjectId(id, 'term report card');
    return this.termReportCardModel!.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
  }

  async publishTermReportCards(dto: PublishTermReportCardsDto) {
    const filter: any = { schoolSlug: dto.schoolSlug, academicYear: dto.academicYear, term: dto.term };
    if (dto.grade) filter.grade = dto.grade;
    if (dto.section) filter.section = dto.section;

    await this.termReportCardModel!.updateMany(filter, { $set: { published: true, publishedAt: new Date() } });
    const cards: any[] = await this.termReportCardModel!.find(filter).select('studentId').lean();
    await notifyGuardiansOfStudents(this.termReportCardModel!.db, cards.map((c) => c.studentId), {
      schoolSlug: dto.schoolSlug as string, type: 'result', title: 'Term report card published',
      body: `Your child's ${dto.term} ${dto.academicYear} report card is now available.`, relatedEntityId: `${dto.academicYear}-${dto.term}`,
    });
    return { message: `${cards.length} term report card(s) published` };
  }

  // ============================================================
  // ANALYTICS
  // ============================================================
  /** Full performance-analytics engine behind the Assessments module's
   * Analytics tab. Deliberately primaries on MarkEntry (always populated
   * the moment a teacher saves marks) rather than ReportCard (only
   * exists once "Generate Report Cards" has been run) - the previous
   * version mixed the two, so Grade Distribution/Top Performers/At-Risk
   * sat permanently empty for any school that enters marks but hasn't
   * run that separate step yet, exactly as reported.
   *
   * Filters beyond academicYear (grade/section/subject/term/type/date
   * range) resolve against the Assessment collection first - since
   * MarkEntry itself has no term/type/date fields - then MarkEntry is
   * matched by the resulting assessmentId set plus subject/grade/section
   * directly (an assessment spanning "all sections" still needs
   * per-mark section filtering when the caller filters by one). */
  async getPerformanceAnalytics(schoolSlug: string, filters: {
    academicYear: string; grade?: string; section?: string; subject?: string;
    term?: string; type?: string; dateFrom?: string; dateTo?: string;
  }) {
    const assessmentFilter: any = { schoolSlug, academicYear: filters.academicYear };
    if (filters.grade) assessmentFilter.grade = filters.grade;
    if (filters.section) assessmentFilter.$or = [{ section: filters.section }, { section: { $in: [null, ''] } }];
    if (filters.term) assessmentFilter.term = filters.term;
    if (filters.type) assessmentFilter.type = filters.type;
    if (filters.dateFrom || filters.dateTo) {
      assessmentFilter.startDate = {};
      if (filters.dateFrom) assessmentFilter.startDate.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) assessmentFilter.startDate.$lte = new Date(filters.dateTo);
    }
    const assessments = await this.assessmentModel.find(assessmentFilter)
      .select('_id title type term startDate grade section').lean();
    const assessmentIds = assessments.map((a) => a._id);
    const assessmentById = new Map(assessments.map((a: any) => [String(a._id), a]));

    const markFilter: any = { schoolSlug, assessmentId: { $in: assessmentIds } };
    if (filters.grade) markFilter.grade = filters.grade;
    if (filters.section) markFilter.section = filters.section;
    if (filters.subject) markFilter.subject = filters.subject;

    const allMarks = assessmentIds.length
      ? await this.markModel.find(markFilter)
          .select('studentId studentName grade section subject totalMarks obtainedMarks isAbsent isExempt result assessmentId').lean()
      : [];

    const markRows: AnalyticsMarkRow[] = allMarks.map((m: any) => ({
      studentId: String(m.studentId), studentName: m.studentName, grade: m.grade, section: m.section,
      subject: m.subject, totalMarks: m.totalMarks, obtainedMarks: m.obtainedMarks,
      isAbsent: !!m.isAbsent, isExempt: !!m.isExempt,
    }));
    const studentStats = computeStudentOverallStats(markRows);

    // Subject-wise avg/pass-rate straight off the mark rows (not the
    // per-student rollup) so a student taking only some of these subjects
    // doesn't skew another subject's own average.
    const subjectMap = new Map<string, { sumPct: number; pass: number; total: number }>();
    for (const m of allMarks) {
      if (m.isAbsent || m.isExempt || m.obtainedMarks == null) continue;
      const cur = subjectMap.get(m.subject) || { sumPct: 0, pass: 0, total: 0 };
      const pct = m.totalMarks > 0 ? (m.obtainedMarks / m.totalMarks) * 100 : 0;
      cur.sumPct += pct;
      if (m.result === 'pass') cur.pass += 1;
      cur.total += 1;
      subjectMap.set(m.subject, cur);
    }
    const subjectWise = Array.from(subjectMap.entries()).map(([subject, v]) => ({
      subject, total: v.total,
      avgPct: parseFloat((v.sumPct / v.total).toFixed(1)),
      passRate: parseFloat(((v.pass / v.total) * 100).toFixed(1)),
    })).sort((a, b) => b.avgPct - a.avgPct);

    // Trend per assessment, sorted chronologically.
    const trendMap = new Map<string, { title: string; type: string; term: string; startDate: Date; sumPct: number; pass: number; total: number }>();
    for (const m of allMarks) {
      if (m.isAbsent || m.isExempt || m.obtainedMarks == null) continue;
      const a = assessmentById.get(String(m.assessmentId));
      if (!a) continue;
      const key = String(m.assessmentId);
      const cur = trendMap.get(key) || { title: a.title, type: a.type, term: a.term, startDate: a.startDate, sumPct: 0, pass: 0, total: 0 };
      const pct = m.totalMarks > 0 ? (m.obtainedMarks / m.totalMarks) * 100 : 0;
      cur.sumPct += pct;
      if (m.result === 'pass') cur.pass += 1;
      cur.total += 1;
      trendMap.set(key, cur);
    }
    const trendByAssessment = Array.from(trendMap.entries()).map(([assessmentId, v]) => ({
      assessmentId, title: v.title, type: v.type, term: v.term, startDate: v.startDate,
      avgPct: parseFloat((v.sumPct / v.total).toFixed(1)),
      passRate: parseFloat(((v.pass / v.total) * 100).toFixed(1)),
      total: v.total,
    })).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    const sortedByPct = [...studentStats].sort((a, b) => b.overallPct - a.overallPct);
    const topPerformers = sortedByPct.slice(0, 10).map((s) => ({
      studentId: s.studentId, studentName: s.studentName, grade: s.grade, section: s.section,
      overallPct: s.overallPct, strongestSubject: s.strongestSubject,
    }));
    const atRiskStudents = sortedByPct.filter((s) => s.overallPct < 50).slice(-20).reverse().map((s) => ({
      studentId: s.studentId, studentName: s.studentName, grade: s.grade, section: s.section,
      overallPct: s.overallPct, weakestSubject: s.weakestSubject,
    }));

    // Quiz-only insights (topic/Bloom's/difficulty accuracy) - the one
    // place per-question right/wrong data exists at all. Scoped to the
    // same filtered assessments/subject so it stays consistent with
    // everything else on the page.
    const quizFilter: any = { schoolSlug, assessmentId: { $in: assessmentIds } };
    if (filters.grade) quizFilter.grade = filters.grade;
    if (filters.section) quizFilter.section = filters.section;
    if (filters.subject) quizFilter.subject = filters.subject;
    const attempts = assessmentIds.length
      ? await this.quizAttemptModel.find(quizFilter).select('answers').lean()
      : [];
    const questionIds = [...new Set(attempts.flatMap((a: any) => (a.answers || []).map((ans: any) => String(ans.questionId))))];
    const questions = questionIds.length
      ? await this.questionModel.find({ _id: { $in: questionIds } }).select('subject topic chapter bloomsLevel difficulty').lean()
      : [];
    const questionById = new Map(questions.map((q: any) => [String(q._id), q]));
    const quizAnswerRows: QuizAnswerRow[] = attempts.flatMap((a: any) => (a.answers || []).map((ans: any) => ({
      isCorrect: ans.isCorrect,
      question: questionById.get(String(ans.questionId)) as any || null,
    })));
    const quizInsights = computeQuizInsights(quizAnswerRows);

    return {
      meta: {
        totalAssessments: assessments.length,
        totalStudentsEvaluated: studentStats.length,
        totalQuizAttempts: attempts.length,
      },
      subjectWise,
      gradeDistribution: gradeDistribution(studentStats),
      classComparison: classComparison(studentStats),
      trendByAssessment,
      topPerformers,
      atRiskStudents,
      weakStudents: atRiskStudents, // back-compat alias for the previous field name
      ...quizInsights,
    };
  }
}
