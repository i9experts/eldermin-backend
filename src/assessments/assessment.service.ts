// ============================================================
// ASSESSMENT SERVICE — Eldermin ERP | NestJS
// ============================================================

import { notifyGuardiansOfStudents } from '../common/utils/notify-guardians.util';
import { Injectable, NotFoundException, BadRequestException, BadGatewayException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import * as bwipjs from 'bwip-js';
import { randomBytes } from 'crypto';
import { PdfService } from '../pdf/pdf.service';

import {
  Assessment, AssessmentDocument,
  Question, QuestionDocument,
  MarkEntry, MarkEntryDocument,
  ReportCard, ReportCardDocument,
} from './schemas/assessment.schema';
import { ExamPaper, ExamPaperDocument } from './schemas/exam-paper.schema';
import { OMRAnswerSheet, OMRAnswerSheetDocument } from './schemas/omr-answer-sheet.schema';
import { QuizAttempt, QuizAttemptDocument } from './schemas/quiz-attempt.schema';
import { detectOMRAnswers } from './omr-detection.util';
import { UploadService } from '../upload/upload.service';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Campus } from '../organization/schemas/organization.schema';
import { GroupInstitution } from '../organization/schemas/group-institution.schema';
import { resolveCampusScope, ScopedUser } from '../auth/scope.util';

import {
  CreateAssessmentDto, UpdateAssessmentDto, AssessmentQueryDto,
  CreateQuestionDto, QuestionQueryDto,
  BulkMarkEntryDto, VerifyMarksDto, MarkQueryDto,
  GenerateReportCardsDto, UpdateReportCardRemarksDto,
  PublishResultDto, ReportCardQueryDto,
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

@Injectable()
export class AssessmentService {
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
    private configService: ConfigService,
    private pdfService: PdfService,
    private uploadService: UploadService,
  ) {}

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
    return paper.save();
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
    const paper = await this.examPaperModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
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
      // Noto Sans Arabic renders Urdu's Perso-Arabic script correctly and
      // legibly, though in a Naskh style rather than the traditional
      // Nastaliq calligraphic style Urdu readers often expect - a real,
      // honest limitation of what's readily available as a redistributable
      // font in this environment, not a rendering bug.
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

  async generateExamPaperPdf(id: string, schoolSlug: string): Promise<Buffer> {
    const paper: any = await this.getExamPaperById(id, schoolSlug);
    const cfg = this.LANGUAGE_CONFIG[paper.language] || this.LANGUAGE_CONFIG.english;
    const format = this.PAPER_FORMATS.includes(paper.paperFormat) ? paper.paperFormat : 'standard';

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
        ${section.instructions ? `<p class="section-instructions">${this.escapeHtml(section.instructions)}</p>` : ''}
        ${section.questions.map((q: any) => {
          questionNumber++;
          const optionsHtml = q.type === 'mcq' && q.options?.length
            ? `<div class="options">${q.options.map((o: any, i: number) => `
                <div class="option"><span class="opt-marker">${cfg.dir === 'rtl' ? this.arabicIndicNumeral(i) : String.fromCharCode(65 + i)}</span> ${this.escapeHtml(o.text)}</div>
              `).join('')}</div>`
            : `<div class="answer-space"></div>`;
          return `
            <div class="question">
              <div class="question-row">
                <span class="q-number">${questionNumber}.</span>
                <span class="q-text">${this.escapeHtml(q.questionText)}</span>
                <span class="q-marks">[${q.marks}]</span>
              </div>
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
        <style>
          @page { margin: 15mm 12mm; }
          body { font-family: ${cfg.font}; color: #111; font-size: 13px; line-height: 1.6; }
          .page-break { page-break-after: always; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0C447C; padding-bottom: 10px; margin-bottom: 14px; }
          .header-main h1 { font-size: 18px; color: #0C447C; margin: 0 0 4px; }
          .header-main p { margin: 2px 0; font-size: 12px; }
          .header-meta { text-align: center; font-size: 10px; }
          .header-meta img { display: block; margin: 0 auto 4px; }
          .top-fields { display: flex; gap: 24px; margin-bottom: 14px; font-size: 12px; }
          .top-fields span { border-bottom: 1px solid #999; padding-bottom: 2px; min-width: 120px; display: inline-block; }
          .instructions-box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; background: #f9f9f9; }
          .section { margin-bottom: 18px; ${format === 'compact' ? 'column-count: 2; column-gap: 24px;' : ''} }
          .section-title { font-size: 14px; background: #0C447C; color: white; padding: 5px 10px; border-radius: 3px; margin-bottom: 8px; ${format === 'compact' ? 'column-span: all;' : ''} }
          .section-instructions { font-size: 11px; color: #555; margin: 0 0 8px; font-style: italic; ${format === 'compact' ? 'column-span: all;' : ''} }
          .question { margin-bottom: ${format === 'compact' ? '8px' : '12px'}; ${format === 'compact' ? 'break-inside: avoid; font-size: 12px;' : ''} }
          .question-row { display: flex; align-items: baseline; gap: 8px; }
          .q-number { font-weight: bold; flex-shrink: 0; }
          .q-text { flex: 1; }
          .q-marks { font-weight: bold; flex-shrink: 0; }
          .options { margin-top: 6px; margin-${cfg.dir === 'rtl' ? 'right' : 'left'}: 24px; display: grid; grid-template-columns: ${format === 'compact' ? '1fr' : '1fr 1fr'}; gap: 4px; }
          .opt-marker { font-weight: bold; margin-${cfg.dir === 'rtl' ? 'left' : 'right'}: 6px; }
          .answer-space { border-bottom: 1px solid #ccc; height: 22px; margin-top: 6px; margin-${cfg.dir === 'rtl' ? 'right' : 'left'}: 24px; }
          .cover-page { display: flex; flex-direction: column; align-items: center; height: 250mm; padding-top: 20mm; text-align: center; }
          .cover-header h1 { font-size: 22px; color: #0C447C; margin: 10px 0 4px; }
          .cover-paper-title { font-size: 15px; font-weight: bold; margin: 4px 0; }
          .cover-code { font-size: 11px; color: #666; margin: 0; }
          .cover-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 40px; width: 100%; max-width: 420px; margin: 28px 0; text-align: ${cfg.dir === 'rtl' ? 'right' : 'left'}; }
          .cover-field label { display: block; font-size: 10px; color: #666; margin-bottom: 3px; }
          .cover-field span { display: block; border-bottom: 1px solid #999; height: 18px; }
          .cover-meta { font-size: 12px; margin-bottom: 20px; }
          .cover-declaration { max-width: 420px; font-size: 11px; color: #444; border: 1px solid #ccc; border-radius: 4px; padding: 10px 14px; margin-bottom: 30px; background: #f9f9f9; }
          .cover-signoff { display: flex; align-items: flex-end; gap: 40px; margin-top: auto; }
          .cover-seal { width: 90px; height: 90px; border: 2px dashed #999; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
          .cover-invigilator span { display: block; border-bottom: 1px solid #999; width: 180px; height: 24px; margin-bottom: 4px; }
          .cover-invigilator label { font-size: 10px; color: #666; }
        </style>
      </head>
      <body>
        ${coverPageHtml}
        <div class="header">
          <div class="header-main">
            <h1>${this.escapeHtml(paper.title)}</h1>
            <p><strong>${this.escapeHtml(paper.subject)}</strong> — ${this.escapeHtml(paper.grade)}${paper.section ? ' - ' + this.escapeHtml(paper.section) : ''}</p>
            <p>${cfg.labels.duration}: ${paper.duration} ${paper.language === 'english' ? 'minutes' : ''} &nbsp;|&nbsp; ${cfg.labels.marks}: ${totalMarks}</p>
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
        ${paper.generalInstructions ? `<div class="instructions-box"><strong>${cfg.labels.instructions}:</strong> ${this.escapeHtml(paper.generalInstructions)}</div>` : ''}
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

  private arabicIndicNumeral(index: number): string {
    // Options lettered with real Arabic-Indic numerals for RTL papers
    // (١، ٢، ٣...) rather than forcing Latin A/B/C/D into an RTL layout.
    const numerals = ['١', '٢', '٣', '٤', '٥', '٦'];
    return numerals[index] || String(index + 1);
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

  async updateStatus(id: string, schoolSlug: string, status: string) {
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
  async bulkImportQuestions(schoolSlug: string, addedBy: string, rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('No rows to import.');
    }
    const validTypes = ['mcq', 'short', 'long', 'true_false', 'fill_blank', 'matching'];
    const validBlooms = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
    const validDifficulty = ['easy', 'medium', 'hard'];

    const results: Array<{ row: number; status: 'created' | 'skipped' | 'error'; message?: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] || {};
      const subject = String(raw.subject || '').trim();
      const grade = String(raw.grade || '').trim();
      const type = String(raw.type || '').trim().toLowerCase();
      const questionText = String(raw.questionText || '').trim();

      try {
        if (!subject) throw new Error('"subject" is required.');
        if (!grade) throw new Error('"grade" is required.');
        if (!questionText) throw new Error('"questionText" is required.');
        if (!validTypes.includes(type)) throw new Error(`"type" must be one of: ${validTypes.join(', ')}.`);

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

    const [byType, byDifficulty, byBlooms, bySubject] = await Promise.all([
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
    return { byType, byDifficulty, byBlooms, bySubject };
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
  async bulkEnterMarks(dto: BulkMarkEntryDto) {
    const assessment = await this.assessmentModel.findById(dto.assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');

    const subjectConfig = assessment.subjects.find(s => s.subject === dto.subject);
    if (!subjectConfig) throw new BadRequestException(`Subject ${dto.subject} not in assessment`);

    const ops = dto.marks.map(m => {
      let percentage: number | undefined;
      let grade_result: string | undefined;
      let gpa: number | undefined;
      let result: string | undefined;

      if (m.isAbsent) {
        result = 'absent';
      } else if (m.isExempt) {
        result = 'exempt';
      } else if (m.obtainedMarks !== undefined) {
        percentage = parseFloat(((m.obtainedMarks / subjectConfig.totalMarks) * 100).toFixed(1));
        const gradeInfo = getGrade(percentage);
        grade_result = gradeInfo.grade;
        gpa = gradeInfo.gpa;
        result = percentage >= ((subjectConfig.passingMarks / subjectConfig.totalMarks) * 100)
          ? 'pass' : 'fail';
      }

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
              percentage, grade_result, gpa, result,
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
  async getQuizAttemptsPendingReview(schoolSlug: string, assessmentId?: string, subject?: string) {
    const filter: any = { schoolSlug, status: 'submitted' };
    if (assessmentId) filter.assessmentId = new Types.ObjectId(assessmentId);
    if (subject) filter.subject = subject;
    return this.quizAttemptModel.find(filter).sort({ submittedAt: 1 }).lean();
  }

  async getQuizAttemptForReview(schoolSlug: string, attemptId: string) {
    const attempt = await this.quizAttemptModel.findOne({ _id: attemptId, schoolSlug }).lean();
    if (!attempt) throw new NotFoundException('Quiz attempt not found');
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
  async gradeQuizAttempt(schoolSlug: string, attemptId: string, grades: { questionId: string; marksAwarded: number }[], gradedBy: string) {
    const attempt = await this.quizAttemptModel.findOne({ _id: attemptId, schoolSlug });
    if (!attempt) throw new NotFoundException('Quiz attempt not found');
    if (attempt.status === 'in_progress') throw new BadRequestException('This attempt has not been submitted yet.');

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
  private async upsertMarkEntryFromAttempt(attempt: any) {
    const percentage = attempt.totalMarks > 0 ? parseFloat(((attempt.obtainedMarks / attempt.totalMarks) * 100).toFixed(1)) : 0;
    const gradeInfo = getGrade(percentage);
    const result = percentage >= ((attempt.passingMarks / (attempt.totalMarks || 1)) * 100) ? 'pass' : 'fail';
    await this.markModel.updateOne(
      { assessmentId: attempt.assessmentId, studentId: attempt.studentId, subject: attempt.subject, schoolSlug: attempt.schoolSlug },
      {
        $set: {
          assessmentTitle: attempt.assessmentTitle, studentName: attempt.studentName, rollNumber: attempt.rollNumber,
          grade: attempt.grade, section: attempt.section, totalMarks: attempt.totalMarks, passingMarks: attempt.passingMarks,
          obtainedMarks: attempt.obtainedMarks, isAbsent: false, isExempt: false,
          percentage, grade_result: gradeInfo.grade, gpa: gradeInfo.gpa, result,
          enteredBy: 'Online Quiz (auto)', academicYear: attempt.academicYear, schoolSlug: attempt.schoolSlug,
        },
      },
      { upsert: true },
    );
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

  async updateReportCardRemarks(id: string, schoolSlug: string, dto: UpdateReportCardRemarksDto) {
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
  // ANALYTICS
  // ============================================================
  async getPerformanceAnalytics(schoolSlug: string, academicYear: string, grade?: string) {
    const filter: any = { schoolSlug, academicYear };
    if (grade) filter.grade = grade;

    const [
      subjectWise, gradeDistribution, trendByAssessment,
      topPerformers, weakStudents,
    ] = await Promise.all([
      // Subject-wise avg performance
      this.markModel.aggregate([
        { $match: { ...filter, isAbsent: false, obtainedMarks: { $ne: null } } },
        { $group: {
          _id: '$subject',
          avgPct: { $avg: '$percentage' },
          passRate: { $avg: { $cond: [{ $eq: ['$result', 'pass'] }, 1, 0] } },
          total: { $sum: 1 },
        }},
        { $sort: { avgPct: -1 } },
      ]),
      // Grade distribution in report cards
      this.reportCardModel.aggregate([
        { $match: filter },
        { $group: { _id: '$overallGrade', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      // Performance trend per assessment
      this.reportCardModel.aggregate([
        { $match: filter },
        { $group: {
          _id: '$assessmentId',
          title: { $first: '$assessmentTitle' },
          avgPct: { $avg: '$overallPercentage' },
          passCount: { $sum: { $cond: [{ $eq: ['$overallResult', 'pass'] }, 1, 0] } },
          total: { $sum: 1 },
        }},
      ]),
      // Top 10 performers
      this.reportCardModel.find({ ...filter, published: true })
        .sort({ overallPercentage: -1 }).limit(10)
        .select('studentName grade section overallPercentage overallGrade classPosition'),
      // Students below 50%
      this.reportCardModel.find({ ...filter, overallPercentage: { $lt: 50 } })
        .sort({ overallPercentage: 1 }).limit(20)
        .select('studentName grade section overallPercentage overallGrade'),
    ]);

    return { subjectWise, gradeDistribution, trendByAssessment, topPerformers, weakStudents };
  }
}
