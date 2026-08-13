// ============================================================
// ASSESSMENT SERVICE — Eldermin ERP | NestJS
// ============================================================

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
import { detectOMRAnswers } from './omr-detection.util';
import { UploadService } from '../upload/upload.service';
import { Student, StudentDocument } from '../students/schemas/student.schema';
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
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    private configService: ConfigService,
    private pdfService: PdfService,
    private uploadService: UploadService,
  ) {}

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
    const questions = await this.questionModel.find({ _id: { $in: allQuestionIds } }).select('marks').lean();
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
    const questions = await this.questionModel.find({ _id: { $in: allQuestionIds } }).lean();
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
      labels: { instructions: 'Instructions', duration: 'Time Allowed', marks: 'Total Marks', name: 'Name', roll: 'Roll No', section: 'Section' },
    },
    urdu: {
      // Noto Sans Arabic renders Urdu's Perso-Arabic script correctly and
      // legibly, though in a Naskh style rather than the traditional
      // Nastaliq calligraphic style Urdu readers often expect - a real,
      // honest limitation of what's readily available as a redistributable
      // font in this environment, not a rendering bug.
      dir: 'rtl', lang: 'ur', font: "'Noto Sans Arabic', 'Noto Naskh Arabic', sans-serif",
      labels: { instructions: 'ہدایات', duration: 'وقت', marks: 'کل نمبر', name: 'نام', roll: 'رول نمبر', section: 'سیکشن' },
    },
    arabic: {
      dir: 'rtl', lang: 'ar', font: "'Noto Sans Arabic', 'Noto Naskh Arabic', sans-serif",
      labels: { instructions: 'التعليمات', duration: 'الوقت المحدد', marks: 'الدرجة الكلية', name: 'الاسم', roll: 'رقم القيد', section: 'الشعبة' },
    },
  };

  async generateExamPaperPdf(id: string, schoolSlug: string): Promise<Buffer> {
    const paper: any = await this.getExamPaperById(id, schoolSlug);
    const cfg = this.LANGUAGE_CONFIG[paper.language] || this.LANGUAGE_CONFIG.english;

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
    this.questionModel.updateMany({ _id: { $in: allQuestionIds } }, { $inc: { usageCount: 1 } }).catch(() => {});

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

    const html = `
      <!DOCTYPE html>
      <html dir="${cfg.dir}" lang="${cfg.lang}">
      <head>
        <meta charset="UTF-8" />
        <style>
          @page { margin: 15mm 12mm; }
          body { font-family: ${cfg.font}; color: #111; font-size: 13px; line-height: 1.6; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0C447C; padding-bottom: 10px; margin-bottom: 14px; }
          .header-main h1 { font-size: 18px; color: #0C447C; margin: 0 0 4px; }
          .header-main p { margin: 2px 0; font-size: 12px; }
          .header-meta { text-align: center; font-size: 10px; }
          .header-meta img { display: block; margin: 0 auto 4px; }
          .top-fields { display: flex; gap: 24px; margin-bottom: 14px; font-size: 12px; }
          .top-fields span { border-bottom: 1px solid #999; padding-bottom: 2px; min-width: 120px; display: inline-block; }
          .instructions-box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; font-size: 12px; background: #f9f9f9; }
          .section { margin-bottom: 18px; }
          .section-title { font-size: 14px; background: #0C447C; color: white; padding: 5px 10px; border-radius: 3px; margin-bottom: 8px; }
          .section-instructions { font-size: 11px; color: #555; margin: 0 0 8px; font-style: italic; }
          .question { margin-bottom: 12px; }
          .question-row { display: flex; align-items: baseline; gap: 8px; }
          .q-number { font-weight: bold; flex-shrink: 0; }
          .q-text { flex: 1; }
          .q-marks { font-weight: bold; flex-shrink: 0; }
          .options { margin-top: 6px; margin-${cfg.dir === 'rtl' ? 'right' : 'left'}: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
          .opt-marker { font-weight: bold; margin-${cfg.dir === 'rtl' ? 'left' : 'right'}: 6px; }
          .answer-space { border-bottom: 1px solid #ccc; height: 22px; margin-top: 6px; margin-${cfg.dir === 'rtl' ? 'right' : 'left'}: 24px; }
        </style>
      </head>
      <body>
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
    const mcqCount = await this.questionModel.countDocuments({ _id: { $in: allQuestionIds }, type: 'mcq' });
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
    const mcqQuestions = await this.questionModel.find({ _id: { $in: allQuestionIds }, type: 'mcq' }).lean();
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

  // ============================================================
  // QUESTION BANK
  // ============================================================
  async createQuestion(dto: CreateQuestionDto) {
    const q = new this.questionModel(dto);
    return q.save();
  }

  async getQuestions(schoolSlug: string, query: QuestionQueryDto) {
    const { page, limit, search, subject, grade, topic, type, difficulty, bloomsLevel } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (subject) filter.subject = subject;
    if (grade) filter.grade = grade;
    if (topic) filter.topic = { $regex: topic, $options: 'i' };
    if (type) filter.type = type;
    if (difficulty) filter.difficulty = difficulty;
    if (bloomsLevel) filter.bloomsLevel = bloomsLevel;
    if (search) filter.$or = [
      { questionText: { $regex: search, $options: 'i' } },
      { tags: { $in: [new RegExp(search, 'i')] } },
    ];

    const [data, total] = await Promise.all([
      this.questionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit!),
      this.questionModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async getQuestionStats(schoolSlug: string, subject?: string, grade?: string) {
    const filter: any = { schoolSlug };
    if (subject) filter.subject = subject;
    if (grade) filter.grade = grade;

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
        published: false,
        schoolSlug: dto.schoolSlug,
      });
    }

    // Upsert report cards
    const ops = reportCards.map(rc => ({
      updateOne: {
        filter: { assessmentId: rc.assessmentId, studentId: rc.studentId, schoolSlug: rc.schoolSlug },
        update: { $set: rc },
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
    await this.assessmentModel.findByIdAndUpdate(dto.assessmentId, {
      $set: { status: 'result_published', resultPublished: true, resultPublishedAt: new Date(), resultPublishedBy: dto.publishedBy },
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
