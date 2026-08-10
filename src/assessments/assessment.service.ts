// ============================================================
// ASSESSMENT SERVICE — Eldermin ERP | NestJS
// ============================================================

import { Injectable, NotFoundException, BadRequestException, BadGatewayException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Assessment, AssessmentDocument,
  Question, QuestionDocument,
  MarkEntry, MarkEntryDocument,
  ReportCard, ReportCardDocument,
} from './schemas/assessment.schema';

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
    private configService: ConfigService,
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
  async create(dto: CreateAssessmentDto) {
    const assessment = new this.assessmentModel({
      ...dto,
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      subjects: dto.subjects.map(s => ({
        ...s,
        date: s.date ? new Date(s.date) : undefined,
        passingMarks: s.passingMarks ?? Math.floor(s.totalMarks * 0.4),
      })),
    });
    return assessment.save();
  }

  async findAll(schoolSlug: string, query: AssessmentQueryDto) {
    const { page, limit, search, sortBy, sortOrder,
      grade, section, type, status, academicYear, term } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (grade) filter.grade = grade;
    if (section) filter.section = section;
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (academicYear) filter.academicYear = academicYear;
    if (term) filter.term = term;
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
