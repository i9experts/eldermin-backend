// ============================================================
// NAZRA (QUR'AN READING) PROGRESS SERVICE
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  NazraProgress, NazraProgressDocument, NAZRA_PARAS, NAZRA_PARA_COUNT,
} from './schemas/nazra-progress.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { InitNazraProgressDto, RecordNazraDiaryDto } from './dto/nazra.dto';
import { assertValidObjectId } from '../common/utils/object-id.util';
import { ScopedUser, resolveCampusScope } from '../auth/scope.util';

// Same bar as Qaida's PASSING_RATINGS - "proficient" is deliberately good
// enough to advance a student past a Para's Sabaq, consistent with how a
// real Nazra teacher judges a child ready to move on.
const PASSING_RATINGS = ['proficient', 'mastered'];
const WEAK_RATINGS = ['needs_practice', 'developing'];

@Injectable()
export class NazraService {
  constructor(
    @InjectModel(NazraProgress.name) private progressModel: Model<NazraProgressDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
  ) {}

  getParas() {
    return { paras: NAZRA_PARAS, total: NAZRA_PARA_COUNT };
  }

  async getOrInitProgress(
    studentId: string,
    schoolSlug: string,
    academicYear: string,
    init: InitNazraProgressDto,
    requestingUser?: ScopedUser,
  ) {
    assertValidObjectId(studentId, 'student');
    const studentObjectId = new Types.ObjectId(studentId);

    await this.progressModel.updateOne(
      { studentId: studentObjectId, schoolSlug },
      {
        $setOnInsert: {
          studentId: studentObjectId,
          schoolSlug,
          academicYear,
          studentName: init.studentName,
          grade: init.grade,
          section: init.section,
          campusId: requestingUser?.campusId
            ? new Types.ObjectId(requestingUser.campusId)
            : (init.campusId ? new Types.ObjectId(init.campusId) : null),
          startDate: new Date(),
        },
      },
      { upsert: true },
    );

    return this.progressModel.findOne({ studentId: studentObjectId, schoolSlug });
  }

  async getProgress(studentId: string, schoolSlug: string) {
    assertValidObjectId(studentId, 'student');
    const progress = await this.progressModel.findOne({
      studentId: new Types.ObjectId(studentId), schoolSlug,
    });
    if (!progress) throw new NotFoundException('No Nazra progress recorded for this student yet');
    return progress;
  }

  // Same single-source-of-truth pointer logic as Qaida's recomputePointer,
  // over the 30-Para sequence instead of the 16-Takhti one.
  private recomputePointer(progress: NazraProgressDocument) {
    const firstUnfinished = progress.paras.find((p) => p.status !== 'completed');
    if (!firstUnfinished) {
      progress.currentPara = NAZRA_PARA_COUNT;
      progress.overallStatus = 'completed';
      if (!progress.completionDate) progress.completionDate = new Date();
    } else {
      progress.currentPara = firstUnfinished.paraNumber;
      progress.overallStatus = firstUnfinished.paraNumber === 1 && firstUnfinished.status === 'not_started'
        ? 'not_started' : 'in_progress';
      progress.completionDate = undefined;
    }
  }

  // Records one full day's diary entry - Sabaq (required) plus whichever
  // of Sabqi/Manzil the teacher covered today. This is the real feature:
  // a single call that captures the whole globally-standard daily
  // structure, not three separate round trips.
  async recordDiaryEntry(
    studentId: string,
    schoolSlug: string,
    dto: RecordNazraDiaryDto,
    assessedBy: string,
    assessedById?: string,
  ) {
    const progress = await this.getProgress(studentId, schoolSlug);
    const { sabaq, sabqi, manzil } = dto;

    const sabaqRecord = progress.paras.find((p) => p.paraNumber === sabaq.paraNumber);
    if (!sabaqRecord) throw new BadRequestException(`Invalid para number: ${sabaq.paraNumber}`);

    // A Para's Sabaq can't start before the one before it has at least
    // been started - same sequential-progression guarantee as Qaida.
    if (sabaq.paraNumber > 1) {
      const previous = progress.paras.find((p) => p.paraNumber === sabaq.paraNumber - 1);
      if (previous && previous.status === 'not_started') {
        throw new BadRequestException(
          `Para ${sabaq.paraNumber - 1} (${NAZRA_PARAS[sabaq.paraNumber - 2].titleEn}) hasn't been started yet`,
        );
      }
    }

    const entryDate = dto.date ? new Date(dto.date) : new Date();
    const wasCompleted = sabaqRecord.status === 'completed';

    sabaqRecord.attempts.push({
      date: entryDate,
      assessedBy,
      assessedById: assessedById ? (new Types.ObjectId(assessedById) as any) : undefined,
      pageFrom: sabaq.pageFrom,
      pageTo: sabaq.pageTo,
      makhrajAccuracy: sabaq.makhrajAccuracy,
      tajweedAccuracy: sabaq.tajweedAccuracy,
      fluency: sabaq.fluency,
      rating: sabaq.rating,
      errorsNoted: sabaq.errorsNoted || [],
      remarks: sabaq.remarks,
    } as any);
    if (!sabaqRecord.startedDate) sabaqRecord.startedDate = entryDate;

    if (PASSING_RATINGS.includes(sabaq.rating)) {
      sabaqRecord.status = 'completed';
      sabaqRecord.completedDate = new Date();
    } else {
      sabaqRecord.status = 'needs_revision';
      if (wasCompleted) sabaqRecord.revisionCount += 1;
    }

    // A weak Sabqi/Manzil revision reopens the Para it was testing, the
    // same way a weak Qaida re-attempt does - a student who read Para 3
    // well a month ago but now stumbles on it during Manzil genuinely
    // needs it flagged again, not silently left "completed" forever.
    for (const revision of [sabqi, manzil]) {
      if (!revision) continue;
      const revisedPara = progress.paras.find((p) => p.paraNumber === revision.paraNumber);
      if (!revisedPara) throw new BadRequestException(`Invalid para number: ${revision.paraNumber}`);
      if (WEAK_RATINGS.includes(revision.rating) && revisedPara.status === 'completed') {
        revisedPara.status = 'needs_revision';
        revisedPara.revisionCount += 1;
      }
    }

    progress.diaryEntries.push({
      date: entryDate,
      assessedBy,
      assessedById: assessedById ? (new Types.ObjectId(assessedById) as any) : undefined,
      sabaq: {
        paraNumber: sabaq.paraNumber,
        pageFrom: sabaq.pageFrom,
        pageTo: sabaq.pageTo,
        makhrajAccuracy: sabaq.makhrajAccuracy,
        tajweedAccuracy: sabaq.tajweedAccuracy,
        fluency: sabaq.fluency,
        rating: sabaq.rating,
        errorsNoted: sabaq.errorsNoted || [],
        remarks: sabaq.remarks,
      },
      sabqi: sabqi ? { ...sabqi, errorsNoted: sabqi.errorsNoted || [] } : undefined,
      manzil: manzil ? { ...manzil, errorsNoted: manzil.errorsNoted || [] } : undefined,
    } as any);

    this.recomputePointer(progress);
    await progress.save();
    return progress;
  }

  async updateParaStatus(studentId: string, schoolSlug: string, paraNumber: number, status: string) {
    const progress = await this.getProgress(studentId, schoolSlug);
    const record = progress.paras.find((p) => p.paraNumber === paraNumber);
    if (!record) throw new BadRequestException(`Invalid para number: ${paraNumber}`);

    const wasCompleted = record.status === 'completed';
    record.status = status as any;
    if (status === 'completed') record.completedDate = new Date();
    if (status === 'in_progress' && !record.startedDate) record.startedDate = new Date();
    if (status === 'needs_revision' && wasCompleted) record.revisionCount += 1;

    this.recomputePointer(progress);
    await progress.save();
    return progress;
  }

  async updateOverallRemarks(studentId: string, schoolSlug: string, remarks: string) {
    const progress = await this.getProgress(studentId, schoolSlug);
    progress.overallRemarks = remarks;
    await progress.save();
    return progress;
  }

  // Class roster view - mirrors Qaida's getClassProgress.
  async getClassProgress(
    schoolSlug: string,
    grade: string,
    section: string | undefined,
    requestingUser?: ScopedUser,
    campusId?: string,
  ) {
    if (!grade) throw new BadRequestException('grade is required');
    const studentFilter: any = { schoolSlug, currentGrade: grade, status: 'active' };
    if (section) studentFilter.currentSection = section;
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) studentFilter.campusId = effectiveCampusId;

    const [students, progressDocs] = await Promise.all([
      this.studentModel.find(studentFilter)
        .select('_id firstName middleName lastName currentGrade currentSection admissionNumber grNo')
        .sort({ firstName: 1 })
        .lean(),
      this.progressModel.find({
        schoolSlug, grade, ...(section ? { section } : {}),
      }).lean(),
    ]);

    const progressByStudent = new Map(progressDocs.map((p: any) => [String(p.studentId), p]));

    return students.map((s: any) => {
      const progress = progressByStudent.get(String(s._id));
      const completedCount = progress
        ? progress.paras.filter((p: any) => p.status === 'completed').length
        : 0;
      const lastEntry = progress?.diaryEntries?.length
        ? progress.diaryEntries[progress.diaryEntries.length - 1]
        : null;
      return {
        studentId: s._id,
        studentName: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' '),
        admissionNumber: s.admissionNumber || s.grNo,
        grade: s.currentGrade,
        section: s.currentSection,
        hasProgress: !!progress,
        currentPara: progress?.currentPara ?? 1,
        overallStatus: progress?.overallStatus ?? 'not_started',
        completedCount,
        totalParas: NAZRA_PARA_COUNT,
        completionPct: Math.round((completedCount / NAZRA_PARA_COUNT) * 100),
        needsRevisionCount: progress
          ? progress.paras.filter((p: any) => p.status === 'needs_revision').length
          : 0,
        lastDiaryDate: lastEntry?.date ?? null,
        currentTeacher: progress?.currentTeacher,
      };
    });
  }

  // School-wide distribution - mirrors Qaida's getSummary.
  async getSummary(schoolSlug: string) {
    const [byPara, byStatus, total, needingRevision] = await Promise.all([
      this.progressModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: '$currentPara', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.progressModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: '$overallStatus', count: { $sum: 1 } } },
      ]),
      this.progressModel.countDocuments({ schoolSlug }),
      this.progressModel.countDocuments({ schoolSlug, 'paras.status': 'needs_revision' }),
    ]);

    return {
      totalStudentsTracked: total,
      completedCount: byStatus.find((s: any) => s._id === 'completed')?.count || 0,
      inProgressCount: byStatus.find((s: any) => s._id === 'in_progress')?.count || 0,
      needingRevisionCount: needingRevision,
      distributionByPara: NAZRA_PARAS.map((p) => ({
        paraNumber: p.number,
        titleEn: p.titleEn,
        studentCount: byPara.find((b: any) => b._id === p.number)?.count || 0,
      })),
    };
  }

  // Single source of truth for both the JSON report view and the (future)
  // PDF generator - mirrors Qaida's getReportData shape and conventions.
  async getReportData(studentId: string, schoolSlug: string) {
    const progress = await this.getProgress(studentId, schoolSlug);
    const paras = NAZRA_PARAS.map((def) => {
      const record = progress.paras.find((p) => p.paraNumber === def.number);
      const latestAttempt = record?.attempts?.[record.attempts.length - 1];
      return {
        ...def,
        status: record?.status || 'not_started',
        startedDate: record?.startedDate,
        completedDate: record?.completedDate,
        revisionCount: record?.revisionCount || 0,
        attemptCount: record?.attempts?.length || 0,
        latestAttempt: latestAttempt ? {
          date: latestAttempt.date,
          rating: latestAttempt.rating,
          pageFrom: latestAttempt.pageFrom,
          pageTo: latestAttempt.pageTo,
          makhrajAccuracy: latestAttempt.makhrajAccuracy,
          tajweedAccuracy: latestAttempt.tajweedAccuracy,
          fluency: latestAttempt.fluency,
          errorsNoted: latestAttempt.errorsNoted,
          remarks: latestAttempt.remarks,
          assessedBy: latestAttempt.assessedBy,
        } : null,
      };
    });

    const completedCount = paras.filter((p) => p.status === 'completed').length;

    // Chronological diary log for the report - every Sabaq/Sabqi/Manzil
    // entry ever recorded, the real "daily diary" the program produces.
    const diaryLog = (progress.diaryEntries || []).map((e: any) => ({
      date: e.date,
      assessedBy: e.assessedBy,
      sabaq: e.sabaq,
      sabqi: e.sabqi || null,
      manzil: e.manzil || null,
    }));

    // Aggregate every error tag ever noted, across both Sabaq attempts and
    // Sabqi/Manzil revisions - the clearest "what does this student
    // actually need to work on" signal.
    const errorCounts = new Map<string, number>();
    for (const record of progress.paras) {
      for (const attempt of record.attempts) {
        for (const err of attempt.errorsNoted || []) {
          errorCounts.set(err, (errorCounts.get(err) || 0) + 1);
        }
      }
    }
    for (const entry of progress.diaryEntries || []) {
      for (const err of (entry as any).sabqi?.errorsNoted || []) {
        errorCounts.set(err, (errorCounts.get(err) || 0) + 1);
      }
      for (const err of (entry as any).manzil?.errorsNoted || []) {
        errorCounts.set(err, (errorCounts.get(err) || 0) + 1);
      }
    }
    const commonErrors = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([error, count]) => ({ error, count }));

    return {
      studentId: progress.studentId,
      studentName: progress.studentName,
      grade: progress.grade,
      section: progress.section,
      currentPara: progress.currentPara,
      overallStatus: progress.overallStatus,
      completedCount,
      totalParas: NAZRA_PARA_COUNT,
      completionPct: Math.round((completedCount / NAZRA_PARA_COUNT) * 100),
      startDate: progress.startDate,
      completionDate: progress.completionDate,
      currentTeacher: progress.currentTeacher,
      overallRemarks: progress.overallRemarks,
      paras,
      diaryLog,
      commonErrors,
    };
  }
}
