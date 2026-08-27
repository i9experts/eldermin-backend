import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TimetableVariant, TimetableVariantDocument } from './schemas/timetable-variant.schema';
import { Timetable, TimetableDocument } from './schemas/timetable.schema';
import { TeacherProfile, TeacherProfileDocument } from './schemas/teacher-profile.schema';
import { TimetableSolverService, SolverClassSpec, SolverTeacherPrefs } from './timetable-solver.service';

@Injectable()
export class TimetableVariantService {
  constructor(
    @InjectModel(TimetableVariant.name) private variantModel: Model<TimetableVariantDocument>,
    @InjectModel(Timetable.name) private timetableModel: Model<TimetableDocument>,
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    private readonly solver: TimetableSolverService,
  ) {}

  private tid(t: string) { return t; }

  // Reconstructs each class's flexible subject requirements from its
  // current periods, the same "group unlocked/non-structural periods by
  // (subject, teacher, room) and count them" approach handleRegenerate
  // uses per-class on the frontend - just run once here across every class
  // in the batch so the whole-school solver has one consistent input shape.
  private buildClassSpec(tt: any, classIdx: number): SolverClassSpec {
    const isFixed = (p: any) => p.locked || p.blockId || p.electiveGroupId
      || (Array.isArray(p.splitGroups) && p.splitGroups.length >= 2)
      || !p.subject || ['break', 'assembly', 'free'].includes(p.type);
    const periods: any[] = tt.periods || [];
    const fixedPeriods = periods.filter(isFixed);
    const flexible = periods.filter(p => !isFixed(p));

    const bySubject: Record<string, { subject: string; teacherId: string | null; teacherName: string; room: string; periodsPerWeek: number }> = {};
    for (const p of flexible) {
      const key = `${p.subject}|${p.teacherId || ''}|${p.roomNo || ''}`;
      if (!bySubject[key]) bySubject[key] = { subject: p.subject, teacherId: p.teacherId ? String(p.teacherId) : null, teacherName: p.teacherName || '', room: p.roomNo || '', periodsPerWeek: 0 };
      bySubject[key].periodsPerWeek++;
    }

    const periodsPerDay = tt.periodsPerDay || 8;
    const periodTimes = Array.from({ length: periodsPerDay }, (_, i) => {
      const pNo = i + 1;
      const p = periods.find((x: any) => x.periodNo === pNo && x.startTime);
      return { periodNo: pNo, startTime: p?.startTime || '', endTime: p?.endTime || '' };
    });

    return {
      classIdx,
      timetableId: String(tt._id),
      gradeLevel: tt.gradeLevel,
      sectionName: tt.sectionName,
      sectionId: tt.sectionId ? String(tt.sectionId) : null,
      workingDays: tt.workingDays || [1, 2, 3, 4, 5],
      periodsPerDay,
      periodTimes,
      subjects: Object.values(bySubject),
      fixedPeriods,
    };
  }

  // Generates `variantCount` whole-school schedule proposals for the given
  // timetables in one batch (same runId), each a candidate to compare and
  // pick from before anything touches the real Timetable documents.
  async generateVariants(tenantId: string, institutionId: string, userId: string, timetableIds: string[], variantCount = 3) {
    if (!timetableIds?.length) throw new BadRequestException('No timetables selected for whole-school generation');
    const tid = this.tid(tenantId);
    const timetables = await this.timetableModel.find({ _id: { $in: timetableIds }, tenantId: tid }).lean();
    if (!timetables.length) throw new BadRequestException('No matching timetables found');

    const classSpecs = timetables.map((tt, i) => this.buildClassSpec(tt, i));

    const teacherIds = new Set<string>();
    for (const c of classSpecs) for (const s of c.subjects) if (s.teacherId) teacherIds.add(s.teacherId);
    const profiles = await this.teacherProfileModel.find({ tenantId: tid, staffId: { $in: [...teacherIds].map(id => new Types.ObjectId(id)) } }).lean();
    const teacherPrefs: Record<string, SolverTeacherPrefs> = {};
    for (const p of profiles) {
      teacherPrefs[String(p.staffId)] = {
        preferredFreeDays: p.preferredFreeDays || [],
        maxConsecutivePeriods: p.maxConsecutivePeriods ?? 4,
        avoidGaps: p.avoidGaps ?? true,
      };
    }

    const runId = new Types.ObjectId().toString();
    const created: any[] = [];
    for (let v = 0; v < variantCount; v++) {
      const seed = Date.now() ^ (v * 2654435761);
      const result = this.solver.generateVariant(classSpecs, teacherPrefs, seed);
      const classesOut = result.classes.map(co => {
        const spec = classSpecs.find(c => c.classIdx === co.classIdx)!;
        return { timetableId: spec.timetableId ? new Types.ObjectId(spec.timetableId) : null, gradeLevel: spec.gradeLevel, sectionName: spec.sectionName, sectionId: spec.sectionId ? new Types.ObjectId(spec.sectionId) : null, periods: co.periods };
      });
      const doc = await this.variantModel.create({
        tenantId: tid,
        institutionId: new Types.ObjectId(institutionId),
        runId,
        name: `Option ${v + 1}`,
        status: 'draft',
        classes: classesOut,
        score: result.score,
        createdBy: new Types.ObjectId(userId),
      });
      created.push(doc.toObject());
    }
    // Best-scoring (lowest penalty) first, so the UI can default to it.
    return created.sort((a, b) => a.score.totalPenalty - b.score.totalPenalty);
  }

  async getVariants(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.runId) filter.runId = query.runId;
    if (query.status) filter.status = query.status;
    return this.variantModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async getVariant(tenantId: string, id: string) {
    const v = await this.variantModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!v) throw new NotFoundException('Variant not found');
    return v;
  }

  async deleteVariant(tenantId: string, id: string) {
    await this.variantModel.deleteOne({ _id: id, tenantId: this.tid(tenantId), status: { $ne: 'published' } });
    return { deleted: true };
  }

  // Writes a variant's per-class schedules into the real Timetable
  // documents (creating one for any class that didn't have one yet),
  // marks it published, and discards every sibling from the same
  // generation run - a published variant is the one schedule that's
  // actually live, so leaving its drafted alternatives around as if they
  // were still options would be misleading.
  async publishVariant(tenantId: string, institutionId: string, id: string, userId: string) {
    const tid = this.tid(tenantId);
    const variant = await this.variantModel.findOne({ _id: id, tenantId: tid }).lean();
    if (!variant) throw new NotFoundException('Variant not found');
    if (variant.status === 'published') return variant;

    for (const c of variant.classes) {
      if (c.timetableId) {
        await this.timetableModel.updateOne({ _id: c.timetableId, tenantId: tid }, { $set: { periods: c.periods } });
      } else {
        await this.timetableModel.create({
          tenantId: tid,
          institutionId: new Types.ObjectId(institutionId),
          gradeLevel: c.gradeLevel,
          sectionName: c.sectionName,
          sectionId: c.sectionId || undefined,
          periods: c.periods,
          status: 'draft',
          createdBy: new Types.ObjectId(userId),
        });
      }
    }

    await this.variantModel.updateOne(
      { _id: id },
      { $set: { status: 'published', publishedBy: new Types.ObjectId(userId), publishedAt: new Date() } },
    );
    await this.variantModel.updateMany(
      { tenantId: tid, runId: variant.runId, _id: { $ne: id }, status: 'draft' },
      { $set: { status: 'discarded' } },
    );

    return this.variantModel.findOne({ _id: id }).lean();
  }
}
