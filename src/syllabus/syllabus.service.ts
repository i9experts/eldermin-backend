import { Injectable, NotFoundException, BadRequestException, BadGatewayException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { Syllabus, SyllabusDocument } from './schemas/syllabus.schema';
import { SloTemplate, SloTemplateDocument } from './schemas/slo-template.schema';
import { AcademicYear, AcademicYearDocument } from '../organization/schemas/organization.schema';
import {
  CreateSyllabusDto, UpdateSyllabusDto, MarkTopicDto, MarkSubTopicDto, CreateSloTemplateDto, SyllabusQueryDto,
} from './dto/syllabus.dto';
import { resolveCampusScope, ScopedUser } from '../auth/scope.util';

@Injectable()
export class SyllabusService {
  constructor(
    @InjectModel(Syllabus.name) private syllabusModel: Model<SyllabusDocument>,
    @InjectModel(SloTemplate.name) private sloTemplateModel: Model<SloTemplateDocument>,
    @InjectModel(AcademicYear.name) private academicYearModel: Model<AcademicYearDocument>,
    private configService: ConfigService,
  ) {}

  // Recomputes the cached rollup fields from the actual topic-level state -
  // called after every create/update/mark-topic so dashboard/report reads
  // never need to walk every topic themselves.
  private computeRollup(units: any[]): { totalTopics: number; coveredTopics: number; coveragePct: number; trackStatus: string } {
    const allTopics = units.flatMap((u) => u.topics || []);
    // Count at sub-topic granularity for any topic that has real
    // sub-topic detail, falling back to the topic itself otherwise -
    // this is what keeps older syllabi (created before sub-topics
    // existed) working unchanged, while newer, more granular ones get a
    // truer coverage percentage than "1 topic = 1 unit of progress"
    // would give once it's actually broken into several weeks of work.
    let totalTopics = 0;
    let coveredTopics = 0;
    for (const t of allTopics) {
      if (t.subTopics && t.subTopics.length > 0) {
        totalTopics += t.subTopics.length;
        coveredTopics += t.subTopics.filter((s: any) => s.isCovered).length;
      } else {
        totalTopics += 1;
        if (t.isCovered) coveredTopics += 1;
      }
    }
    const coveragePct = totalTopics > 0 ? Math.round((coveredTopics / totalTopics) * 100) : 0;
    let trackStatus = 'not_started';
    if (coveragePct === 100) trackStatus = 'completed';
    else if (coveragePct > 0) trackStatus = 'on_track'; // "behind" is a time-aware judgement set separately, see markTopic
    return { totalTopics, coveredTopics, coveragePct, trackStatus };
  }

  async create(tenantId: string, institutionId: string, createdBy: string, createdByName: string, dto: CreateSyllabusDto, requestingUser?: ScopedUser) {
    const rollup = this.computeRollup(dto.units || []);
    const syllabus = new this.syllabusModel({
      ...dto,
      tenantId,
      institutionId,
      createdBy,
      createdByName,
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : ((dto as any).campusId ? new Types.ObjectId((dto as any).campusId) : null),
      ...rollup,
    });
    return syllabus.save();
  }

  async findAll(tenantId: string, query: SyllabusQueryDto, requestingUser?: ScopedUser) {
    const filter: any = { tenantId };
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    if (query.sectionName) filter.sectionName = query.sectionName;
    if (query.subjectName) filter.subjectName = query.subjectName;
    if (query.academicYearLabel) filter.academicYearLabel = query.academicYearLabel;
    if (query.term) filter.term = query.term;
    if (query.teacherId) filter.teacherId = new Types.ObjectId(query.teacherId);
    if (query.status) filter.status = query.status;
    if (query.trackStatus) filter.trackStatus = query.trackStatus;
    if (requestingUser) {
      const effectiveCampusId = resolveCampusScope(requestingUser, undefined);
      if (effectiveCampusId) filter.campusId = effectiveCampusId;
    }
    return this.syllabusModel.find(filter).sort({ gradeLevel: 1, subjectName: 1 }).lean();
  }

  async findOne(tenantId: string, id: string) {
    const syllabus = await this.syllabusModel.findOne({ _id: id, tenantId }).lean();
    if (!syllabus) throw new NotFoundException('Syllabus not found');
    return syllabus;
  }

  async update(tenantId: string, id: string, dto: UpdateSyllabusDto) {
    const existing = await this.syllabusModel.findOne({ _id: id, tenantId });
    if (!existing) throw new NotFoundException('Syllabus not found');

    const update: any = { ...dto };
    if (dto.units) {
      // Preserve existing tracking state per topic when the design is
      // edited - matching by unitNo+topicNo - so editing a syllabus's
      // description/objectives doesn't silently wipe a teacher's already-
      // recorded coverage progress.
      const existingTopicMap = new Map<string, any>();
      for (const u of existing.units || []) {
        for (const t of (u as any).topics || []) {
          existingTopicMap.set(`${(u as any).unitNo}-${t.topicNo}`, t);
        }
      }
      update.units = dto.units.map((u) => ({
        ...u,
        topics: (u.topics || []).map((t) => {
          const prior = existingTopicMap.get(`${u.unitNo}-${t.topicNo}`);
          return prior
            ? { ...t, isCovered: prior.isCovered, coveredDate: prior.coveredDate, coveredBy: prior.coveredBy, actualLessonsUsed: prior.actualLessonsUsed, notes: prior.notes }
            : t;
        }),
      }));
      Object.assign(update, this.computeRollup(update.units));
    }

    const updated = await this.syllabusModel.findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true });
    return updated;
  }

  async remove(tenantId: string, id: string) {
    const result = await this.syllabusModel.findOneAndDelete({ _id: id, tenantId });
    if (!result) throw new NotFoundException('Syllabus not found');
    return { message: 'Syllabus deleted' };
  }

  async approve(tenantId: string, id: string, approverName: string) {
    const syllabus = await this.syllabusModel.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: { status: 'approved', approvedBy: approverName, approvedAt: new Date() } },
      { new: true },
    );
    if (!syllabus) throw new NotFoundException('Syllabus not found');
    return syllabus;
  }

  // ── Tracking ────────────────────────────────────────────────
  // Computes which real calendar week (1-based, within the matched term)
  // a given date falls in - anchored to the school's own actual
  // AcademicYear/Term start date, not an invented parallel numbering.
  // Returns null if no matching academic year/term is found, so callers
  // can distinguish "week 1" from "we genuinely don't know."
  private async computeCurrentWeek(schoolSlug: string, academicYearLabel: string, term: string, asOf: Date = new Date()): Promise<number | null> {
    const year = await this.academicYearModel.findOne({ schoolSlug, name: academicYearLabel }).lean();
    if (!year) return null;
    const matchedTerm = (year.terms || []).find((t: any) => t.name === term);
    const termStart = matchedTerm?.startDate ? new Date(matchedTerm.startDate) : null;
    if (!termStart) return null;
    const diffMs = asOf.getTime() - termStart.getTime();
    if (diffMs < 0) return null; // term hasn't started yet
    return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  }

  async markSubTopic(tenantId: string, id: string, dto: MarkSubTopicDto) {
    const syllabus = await this.syllabusModel.findOne({ _id: id, tenantId });
    if (!syllabus) throw new NotFoundException('Syllabus not found');

    const unit = (syllabus.units as any[]).find((u) => u.unitNo === dto.unitNo);
    if (!unit) throw new NotFoundException(`Unit ${dto.unitNo} not found`);
    const topic = (unit.topics as any[]).find((t: any) => t.topicNo === dto.topicNo);
    if (!topic) throw new NotFoundException(`Topic ${dto.topicNo} not found in unit ${dto.unitNo}`);
    const subTopic = (topic.subTopics as any[]).find((s: any) => s.subTopicNo === dto.subTopicNo);
    if (!subTopic) throw new NotFoundException(`Sub-topic ${dto.subTopicNo} not found in topic ${dto.topicNo}`);

    subTopic.isCovered = dto.isCovered;
    subTopic.coveredDate = dto.isCovered ? new Date() : undefined;
    subTopic.coveredBy = dto.coveredBy;
    if (dto.notes != null) subTopic.notes = dto.notes;

    // Derive the parent topic's coverage from its sub-topics, since a
    // topic with real sub-topic detail shouldn't be independently
    // markable while the sub-topics underneath disagree with it.
    if (topic.subTopics.length > 0) {
      const allCovered = (topic.subTopics as any[]).every((s: any) => s.isCovered);
      topic.isCovered = allCovered;
      topic.coveredDate = allCovered ? new Date() : undefined;
      topic.coveredBy = allCovered ? dto.coveredBy : undefined;
    }

    const rollup = this.computeRollup(syllabus.units as any[]);
    Object.assign(syllabus, rollup, { lastTrackedAt: new Date() });
    syllabus.markModified('units');
    await syllabus.save();
    return syllabus;
  }

  // Real "what am I teaching this week" view - finds every sub-topic
  // across every syllabus this teacher is assigned to, planned for the
  // real current week (computed per-syllabus, since different subjects
  // can be on different academic years/terms), grouped by subject/class
  // so a teacher sees their whole week in one place rather than
  // checking each class's syllabus separately.
  async getTeacherWeeklyPlanner(tenantId: string, schoolSlug: string, teacherId: string) {
    const syllabi = await this.syllabusModel.find({ tenantId, teacherId: new Types.ObjectId(teacherId), status: { $in: ['active', 'approved'] } }).lean();

    const results: any[] = [];
    for (const s of syllabi) {
      const currentWeek = await this.computeCurrentWeek(schoolSlug, s.academicYearLabel, s.term);
      if (currentWeek === null) continue;

      const thisWeekSubTopics: any[] = [];
      for (const unit of s.units || []) {
        for (const topic of (unit as any).topics || []) {
          for (const sub of (topic as any).subTopics || []) {
            if (sub.plannedWeek === currentWeek) {
              thisWeekSubTopics.push({
                unitNo: unit.unitNo, unitName: unit.unitName,
                topicNo: topic.topicNo, topicName: topic.topicName,
                subTopicNo: sub.subTopicNo, subTopicName: sub.subTopicName,
                isCovered: sub.isCovered,
              });
            }
          }
        }
      }
      if (thisWeekSubTopics.length > 0) {
        results.push({
          syllabusId: s._id, subjectName: s.subjectName, gradeLevel: s.gradeLevel, sectionName: s.sectionName,
          currentWeek, subTopics: thisWeekSubTopics,
        });
      }
    }
    return results;
  }

  // ── SLO Templates ──────────────────────────────────────────────────
  // Reusable, sourced curriculum content a coordinator applies to
  // *start* a new syllabus - never auto-applied silently, and never
  // presented as verified unless it genuinely carries a real source.
  async createSloTemplate(schoolSlug: string, dto: CreateSloTemplateDto) {
    const template = new this.sloTemplateModel({ ...dto, schoolSlug });
    return template.save();
  }

  async listSloTemplates(schoolSlug: string, subjectName?: string, gradeLevel?: string, framework?: string) {
    const filter: any = { schoolSlug };
    if (subjectName) filter.subjectName = subjectName;
    if (gradeLevel) filter.gradeLevel = gradeLevel;
    if (framework) filter.framework = framework;
    return this.sloTemplateModel.find(filter).sort({ subjectName: 1, gradeLevel: 1 }).lean();
  }

  async getSloTemplate(schoolSlug: string, id: string) {
    const template = await this.sloTemplateModel.findOne({ _id: id, schoolSlug }).lean();
    if (!template) throw new NotFoundException('SLO template not found');
    return template;
  }

  async deleteSloTemplate(schoolSlug: string, id: string) {
    const result = await this.sloTemplateModel.deleteOne({ _id: id, schoolSlug });
    if (result.deletedCount === 0) throw new NotFoundException('SLO template not found');
    return { deleted: true };
  }

  // Real, mathematical distribution of existing topics/sub-topics
  // across the term's actual available weeks - proportional to each
  // topic's estimatedLessons, so a topic planned to take 3x as long as
  // another gets roughly 3x the weeks. Never invents or alters any
  // curriculum content, purely assigns plannedWeek to what's already
  // there. Overwrites any existing plannedWeek values, since this is
  // meant as a single deliberate "generate my pacing guide" action, not
  // an incremental merge.
  async generatePacingGuide(tenantId: string, id: string) {
    const syllabus = await this.syllabusModel.findOne({ _id: id, tenantId });
    if (!syllabus) throw new NotFoundException('Syllabus not found');
    const totalWeeks = syllabus.totalWeeks || 0;
    if (totalWeeks < 1) throw new BadRequestException('Set Total Weeks on the syllabus before generating a pacing guide');

    const allTopics = (syllabus.units as any[]).flatMap((u) => u.topics || []);
    const totalEstimatedLessons = allTopics.reduce((sum, t) => sum + (t.estimatedLessons || 1), 0) || 1;

    let weekCursor = 1;
    for (const topic of allTopics) {
      const topicShareOfWeeks = Math.max(1, Math.round(((topic.estimatedLessons || 1) / totalEstimatedLessons) * totalWeeks));
      const subTopics = topic.subTopics || [];
      if (subTopics.length > 0) {
        // Spread this topic's sub-topics evenly across its own share of weeks
        subTopics.forEach((sub: any, idx: number) => {
          const weekOffset = Math.floor((idx / subTopics.length) * topicShareOfWeeks);
          sub.plannedWeek = Math.min(totalWeeks, weekCursor + weekOffset);
        });
      }
      weekCursor = Math.min(totalWeeks, weekCursor + topicShareOfWeeks);
    }

    syllabus.markModified('units');
    await syllabus.save();
    return syllabus;
  }

  // Reuses the exact same server-side Anthropic call pattern already
  // established in analytics.service.ts - never called from the client
  // directly. A recommendation, not a fact: unlike SLO content, a
  // sensible assessment weighting isn't something that can be "wrong"
  // against an official source in the same way, so this is fine to
  // generate directly rather than needing a verified template.
  async recommendAssessmentBreakdown(subjectName: string, gradeLevel: string, framework: string) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new BadGatewayException('AI recommendation service is not configured.');

    const systemPrompt = `You are a curriculum assessment specialist. Given a subject, grade level, and curriculum framework, recommend a sensible assessment weighting breakdown.
Respond with ONLY raw JSON, no markdown, no preamble:
{ "midTermPct": number, "finalExamPct": number, "classworkPct": number, "homeworkPct": number, "reasoning": string (1-2 sentences explaining the weighting choice) }
The four percentages must sum to exactly 100. Base the reasoning on real, sensible assessment practice for this subject/grade/framework combination (e.g. younger grades typically weight continuous classwork more heavily than final exams; practical subjects may weight coursework more than theory subjects).`;

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 400,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Subject: ${subjectName}\nGrade Level: ${gradeLevel}\nFramework: ${framework}` }],
        }),
      });
    } catch {
      throw new BadGatewayException('Could not reach the AI recommendation service.');
    }
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new BadGatewayException(`AI recommendation request failed (${response.status}): ${errBody.slice(0, 200)}`);
    }

    const result = await response.json();
    const textBlock = (result?.content || []).find((b: any) => b.type === 'text');
    const text = textBlock?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch {
      throw new BadGatewayException('AI recommendation returned an unparseable response.');
    }
  }

  async markTopic(tenantId: string, id: string, dto: MarkTopicDto) {
    const syllabus = await this.syllabusModel.findOne({ _id: id, tenantId });
    if (!syllabus) throw new NotFoundException('Syllabus not found');

    const unit = (syllabus.units as any[]).find((u) => u.unitNo === dto.unitNo);
    if (!unit) throw new NotFoundException(`Unit ${dto.unitNo} not found`);
    const topic = (unit.topics as any[]).find((t: any) => t.topicNo === dto.topicNo);
    if (!topic) throw new NotFoundException(`Topic ${dto.topicNo} not found in unit ${dto.unitNo}`);

    topic.isCovered = dto.isCovered;
    topic.coveredDate = dto.isCovered ? new Date() : undefined;
    topic.coveredBy = dto.coveredBy;
    if (dto.actualLessonsUsed != null) topic.actualLessonsUsed = dto.actualLessonsUsed;
    if (dto.notes != null) topic.notes = dto.notes;

    const rollup = this.computeRollup(syllabus.units as any[]);
    Object.assign(syllabus, rollup, { lastTrackedAt: new Date() });
    syllabus.markModified('units');
    await syllabus.save();
    return syllabus;
  }

  // Explicit "mark behind schedule" - a time-aware judgement (are we
  // further into the term than our coverage% suggests we should be) that
  // a coordinator sets deliberately, rather than something the system can
  // infer purely from coverage% alone without knowing the term's real
  // calendar pace.
  async setBehindSchedule(tenantId: string, id: string, behind: boolean) {
    const syllabus = await this.syllabusModel.findOne({ _id: id, tenantId });
    if (!syllabus) throw new NotFoundException('Syllabus not found');
    if (behind) {
      syllabus.trackStatus = 'behind';
    } else {
      const rollup = this.computeRollup(syllabus.units as any[]);
      syllabus.trackStatus = rollup.trackStatus;
    }
    await syllabus.save();
    return syllabus;
  }

  // ── Dashboard ───────────────────────────────────────────────
  async getDashboard(tenantId: string, academicYearLabel?: string) {
    const filter: any = { tenantId };
    if (academicYearLabel) filter.academicYearLabel = academicYearLabel;

    const all = await this.syllabusModel.find(filter).lean();
    const totalSyllabi = all.length;
    const avgCoverage = totalSyllabi > 0
      ? Math.round(all.reduce((sum, s: any) => sum + (s.coveragePct || 0), 0) / totalSyllabi)
      : 0;
    const behindCount = all.filter((s: any) => s.trackStatus === 'behind').length;
    const completedCount = all.filter((s: any) => s.trackStatus === 'completed').length;
    const pendingApprovalCount = all.filter((s: any) => s.status === 'active').length;
    const draftCount = all.filter((s: any) => s.status === 'draft').length;

    const byGrade: Record<string, { count: number; avgCoverage: number }> = {};
    for (const s of all as any[]) {
      if (!byGrade[s.gradeLevel]) byGrade[s.gradeLevel] = { count: 0, avgCoverage: 0 };
      byGrade[s.gradeLevel].count += 1;
      byGrade[s.gradeLevel].avgCoverage += s.coveragePct || 0;
    }
    for (const g of Object.keys(byGrade)) {
      byGrade[g].avgCoverage = Math.round(byGrade[g].avgCoverage / byGrade[g].count);
    }

    return {
      totalSyllabi, avgCoverage, behindCount, completedCount, pendingApprovalCount, draftCount,
      byGrade,
      behindList: (all as any[]).filter((s) => s.trackStatus === 'behind').map((s) => ({
        _id: s._id, subjectName: s.subjectName, gradeLevel: s.gradeLevel, sectionName: s.sectionName,
        coveragePct: s.coveragePct, teacherName: s.teacherName,
      })),
    };
  }

  // ── Coverage report ─────────────────────────────────────────
  async getCoverageReport(tenantId: string, query: SyllabusQueryDto) {
    const list = await this.findAll(tenantId, query);
    return (list as any[]).map((s) => ({
      _id: s._id,
      subjectName: s.subjectName,
      gradeLevel: s.gradeLevel,
      sectionName: s.sectionName,
      teacherName: s.teacherName,
      totalTopics: s.totalTopics,
      coveredTopics: s.coveredTopics,
      coveragePct: s.coveragePct,
      trackStatus: s.trackStatus,
      status: s.status,
      lastTrackedAt: s.lastTrackedAt,
    }));
  }
}
