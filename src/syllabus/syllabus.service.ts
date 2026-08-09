import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Syllabus, SyllabusDocument } from './schemas/syllabus.schema';
import {
  CreateSyllabusDto, UpdateSyllabusDto, MarkTopicDto, SyllabusQueryDto,
} from './dto/syllabus.dto';

@Injectable()
export class SyllabusService {
  constructor(
    @InjectModel(Syllabus.name) private syllabusModel: Model<SyllabusDocument>,
  ) {}

  // Recomputes the cached rollup fields from the actual topic-level state -
  // called after every create/update/mark-topic so dashboard/report reads
  // never need to walk every topic themselves.
  private computeRollup(units: any[]): { totalTopics: number; coveredTopics: number; coveragePct: number; trackStatus: string } {
    const allTopics = units.flatMap((u) => u.topics || []);
    const totalTopics = allTopics.length;
    const coveredTopics = allTopics.filter((t) => t.isCovered).length;
    const coveragePct = totalTopics > 0 ? Math.round((coveredTopics / totalTopics) * 100) : 0;
    let trackStatus = 'not_started';
    if (coveragePct === 100) trackStatus = 'completed';
    else if (coveragePct > 0) trackStatus = 'on_track'; // "behind" is a time-aware judgement set separately, see markTopic
    return { totalTopics, coveredTopics, coveragePct, trackStatus };
  }

  async create(tenantId: string, institutionId: string, createdBy: string, createdByName: string, dto: CreateSyllabusDto) {
    const rollup = this.computeRollup(dto.units || []);
    const syllabus = new this.syllabusModel({
      ...dto,
      tenantId,
      institutionId,
      createdBy,
      createdByName,
      ...rollup,
    });
    return syllabus.save();
  }

  async findAll(tenantId: string, query: SyllabusQueryDto) {
    const filter: any = { tenantId };
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    if (query.sectionName) filter.sectionName = query.sectionName;
    if (query.subjectName) filter.subjectName = query.subjectName;
    if (query.academicYearLabel) filter.academicYearLabel = query.academicYearLabel;
    if (query.term) filter.term = query.term;
    if (query.teacherId) filter.teacherId = new Types.ObjectId(query.teacherId);
    if (query.status) filter.status = query.status;
    if (query.trackStatus) filter.trackStatus = query.trackStatus;
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
