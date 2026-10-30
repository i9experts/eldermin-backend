// ============================================================
// QAIDA & TAJWEED PROGRESS SERVICE
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  QaidaProgress, QaidaProgressDocument, QAIDA_TAKHTIS, QAIDA_TAKHTI_COUNT,
} from './schemas/qaida-progress.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { InitQaidaProgressDto, RecordTakhtiAttemptDto } from './dto/qaida.dto';
import { assertValidObjectId } from '../common/utils/object-id.util';
import { ScopedUser, resolveCampusScope } from '../auth/scope.util';

// A rating this good or better auto-advances the student past this board -
// "proficient" is deliberately the bar, not "mastered": a teacher who only
// ever picks "mastered" for truly flawless recitation would otherwise stall
// every student's progress on this tracker while still correctly judging
// them ready for the next board in real classroom practice.
const PASSING_RATINGS = ['proficient', 'mastered'];

@Injectable()
export class QaidaService {
  constructor(
    @InjectModel(QaidaProgress.name) private progressModel: Model<QaidaProgressDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
  ) {}

  getTakhtis() {
    return { takhtis: QAIDA_TAKHTIS, total: QAIDA_TAKHTI_COUNT };
  }

  // Idempotent: returns the existing record if one exists, otherwise
  // creates it with Takhti 1 already in_progress (every student starts
  // there) using the snapshot the caller provides. Mirrors the
  // $setOnInsert upsert pattern used elsewhere in this codebase so a
  // double-click or a second teacher opening the same student's tracker
  // at the same time can never create two progress docs for one student.
  async getOrInitProgress(
    studentId: string,
    schoolSlug: string,
    academicYear: string,
    init: InitQaidaProgressDto,
    requestingUser?: ScopedUser,
  ) {
    assertValidObjectId(studentId, 'student');
    const studentObjectId = new Types.ObjectId(studentId);

    const setOnInsert: any = {
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
    };

    // A student who joined without a full Qaida history at this school:
    // place them at their real starting board instead of the default
    // "Takhti 1 in_progress" seed - everything before that board is marked
    // 'not_tracked' (see QaidaTakhtiStatus), not 'not_started', so reports
    // don't read as "behind" on boards the school was never responsible for.
    if (init.recordType === 'joined_later' && init.startAtTakhti) {
      setOnInsert.recordType = 'joined_later';
      setOnInsert.priorRecordNote = init.priorRecordNote;
      setOnInsert.takhtis = QAIDA_TAKHTIS.map((t) => ({
        takhtiNumber: t.number,
        status: t.number < init.startAtTakhti! ? 'not_tracked' : t.number === init.startAtTakhti ? 'in_progress' : 'not_started',
        startedDate: t.number === init.startAtTakhti ? new Date() : undefined,
        revisionCount: 0,
        attempts: [],
      }));
      setOnInsert.currentTakhti = init.startAtTakhti;
    }

    await this.progressModel.updateOne(
      { studentId: studentObjectId, schoolSlug },
      { $setOnInsert: setOnInsert },
      { upsert: true },
    );

    return this.progressModel.findOne({ studentId: studentObjectId, schoolSlug });
  }

  async getProgress(studentId: string, schoolSlug: string) {
    assertValidObjectId(studentId, 'student');
    const progress = await this.progressModel.findOne({
      studentId: new Types.ObjectId(studentId), schoolSlug,
    });
    if (!progress) throw new NotFoundException('No Qaida progress recorded for this student yet');
    return progress;
  }

  // Recomputes currentTakhti/overallStatus after any attempt or manual
  // status change - the single place this logic lives, so the roster view,
  // the student detail view and the PDF report can never disagree about
  // "where is this student right now".
  private recomputePointer(progress: QaidaProgressDocument) {
    // 'not_tracked' boards (joined-later students - see QaidaTakhtiStatus)
    // are skipped entirely: they're neither "done" nor "where the student
    // currently is", just not this school's record to carry.
    const firstUnfinished = progress.takhtis.find(
      (t) => t.status !== 'mastered' && t.status !== 'not_tracked',
    );
    if (!firstUnfinished) {
      progress.currentTakhti = QAIDA_TAKHTI_COUNT;
      progress.overallStatus = 'completed';
      if (!progress.completionDate) progress.completionDate = new Date();
    } else {
      progress.currentTakhti = firstUnfinished.takhtiNumber;
      progress.overallStatus = firstUnfinished.takhtiNumber === 1 && firstUnfinished.status === 'not_started'
        ? 'not_started' : 'in_progress';
      progress.completionDate = undefined;
    }
  }

  async recordAttempt(
    studentId: string,
    schoolSlug: string,
    dto: RecordTakhtiAttemptDto,
    assessedBy: string,
    assessedById?: string,
  ) {
    const progress = await this.getProgress(studentId, schoolSlug);
    const record = progress.takhtis.find((t) => t.takhtiNumber === dto.takhtiNumber);
    if (!record) throw new BadRequestException(`Invalid takhti number: ${dto.takhtiNumber}`);

    // Deliberately no forward-only sequence check here (unlike Nazra's Para
    // progression) - many Qaida classrooms run multiple teachers/groups off
    // the same 16 boards at different paces, a child moves between a Qaida
    // and Hifz/Nazra track mid-board, or a teacher wants to spot-check an
    // earlier board without that counting as "regressing" the sequence. A
    // teacher can record an attempt against any Takhti at any time; the
    // mastery tracker (recomputePointer) still correctly reports "where is
    // this student furthest along" regardless of recording order.
    const wasMastered = record.status === 'mastered';
    const attemptDate = dto.date ? new Date(dto.date) : new Date();
    record.attempts.push({
      date: attemptDate,
      assessedBy,
      assessedById: assessedById ? (new Types.ObjectId(assessedById) as any) : undefined,
      rating: dto.rating,
      makhrajAccuracy: dto.makhrajAccuracy,
      tajweedAccuracy: dto.tajweedAccuracy,
      fluency: dto.fluency,
      errorsNoted: dto.errorsNoted || [],
      remarks: dto.remarks,
      sabaqFrom: dto.sabaqFrom,
      sabaqTo: dto.sabaqTo,
    } as any);

    if (!record.startedDate) record.startedDate = attemptDate;

    if (PASSING_RATINGS.includes(dto.rating)) {
      record.status = 'mastered';
      record.masteredDate = new Date();
    } else {
      // A previously-mastered board that comes back with a weak attempt
      // (e.g. a later spot-check reveals the rule wasn't retained) is
      // reopened as needs_revision, not silently left "mastered" - and
      // counted, so the assessment report can show which rule actually
      // needed a second pass.
      record.status = 'needs_revision';
      if (wasMastered) record.revisionCount += 1;
    }

    this.recomputePointer(progress);
    await progress.save();
    return progress;
  }

  async updateTakhtiStatus(studentId: string, schoolSlug: string, takhtiNumber: number, status: string) {
    const progress = await this.getProgress(studentId, schoolSlug);
    const record = progress.takhtis.find((t) => t.takhtiNumber === takhtiNumber);
    if (!record) throw new BadRequestException(`Invalid takhti number: ${takhtiNumber}`);

    const wasMastered = record.status === 'mastered';
    record.status = status as any;
    if (status === 'mastered') record.masteredDate = new Date();
    if (status === 'in_progress' && !record.startedDate) record.startedDate = new Date();
    if (status === 'needs_revision' && wasMastered) record.revisionCount += 1;

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

  // Class roster view - every student in the grade/section, left-joined
  // with their Qaida progress (a student with no record yet simply shows
  // as "not started" rather than being left off the roster, the same
  // convention the Apps & Modules / attendance roster views use).
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
      const masteredCount = progress
        ? progress.takhtis.filter((t: any) => t.status === 'mastered').length
        : 0;
      // Mastery % is computed against the boards this school is actually
      // responsible for - a joined-later student's 'not_tracked' boards
      // (see QaidaTakhtiStatus) are excluded from the denominator rather
      // than silently counting against them.
      const trackedTakhtis = progress
        ? progress.takhtis.filter((t: any) => t.status !== 'not_tracked').length
        : QAIDA_TAKHTI_COUNT;
      return {
        studentId: s._id,
        studentName: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' '),
        admissionNumber: s.admissionNumber || s.grNo,
        grade: s.currentGrade,
        section: s.currentSection,
        hasProgress: !!progress,
        currentTakhti: progress?.currentTakhti ?? 1,
        overallStatus: progress?.overallStatus ?? 'not_started',
        recordType: progress?.recordType ?? 'full_history',
        masteredCount,
        totalTakhtis: QAIDA_TAKHTI_COUNT,
        trackedTakhtis,
        masteryPct: trackedTakhtis ? Math.round((masteredCount / trackedTakhtis) * 100) : 0,
        needsRevisionCount: progress
          ? progress.takhtis.filter((t: any) => t.status === 'needs_revision').length
          : 0,
        currentTeacher: progress?.currentTeacher,
      };
    });
  }

  // School-wide distribution - how many students sit at each takhti, for a
  // dashboard widget on the Behaviour & Tarbiyah command center.
  async getSummary(schoolSlug: string) {
    const [byTakhti, byStatus, total, needingRevision] = await Promise.all([
      this.progressModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: '$currentTakhti', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.progressModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: '$overallStatus', count: { $sum: 1 } } },
      ]),
      this.progressModel.countDocuments({ schoolSlug }),
      this.progressModel.countDocuments({ schoolSlug, 'takhtis.status': 'needs_revision' }),
    ]);

    return {
      totalStudentsTracked: total,
      completedCount: byStatus.find((s: any) => s._id === 'completed')?.count || 0,
      inProgressCount: byStatus.find((s: any) => s._id === 'in_progress')?.count || 0,
      needingRevisionCount: needingRevision,
      distributionByTakhti: QAIDA_TAKHTIS.map((t) => ({
        takhtiNumber: t.number,
        titleEn: t.titleEn,
        studentCount: byTakhti.find((b: any) => b._id === t.number)?.count || 0,
      })),
    };
  }

  // Everything the assessment report (JSON for the frontend, and the PDF
  // generator in PdfService) needs in one shape - the single source of
  // truth for what "the Qaida assessment report" actually contains.
  async getReportData(studentId: string, schoolSlug: string) {
    const progress = await this.getProgress(studentId, schoolSlug);
    const takhtis = QAIDA_TAKHTIS.map((def) => {
      const record = progress.takhtis.find((t) => t.takhtiNumber === def.number);
      const latestAttempt = record?.attempts?.[record.attempts.length - 1];
      return {
        ...def,
        status: record?.status || 'not_started',
        startedDate: record?.startedDate,
        masteredDate: record?.masteredDate,
        revisionCount: record?.revisionCount || 0,
        attemptCount: record?.attempts?.length || 0,
        // Every attempt's sabaq range, oldest first - a daily lesson log for
        // this board, not just the latest snapshot.
        sabaqLog: (record?.attempts || []).map((a) => ({
          date: a.date, sabaqFrom: a.sabaqFrom, sabaqTo: a.sabaqTo,
          rating: a.rating, assessedBy: a.assessedBy,
        })),
        latestAttempt: latestAttempt ? {
          date: latestAttempt.date,
          rating: latestAttempt.rating,
          makhrajAccuracy: latestAttempt.makhrajAccuracy,
          tajweedAccuracy: latestAttempt.tajweedAccuracy,
          fluency: latestAttempt.fluency,
          errorsNoted: latestAttempt.errorsNoted,
          remarks: latestAttempt.remarks,
          assessedBy: latestAttempt.assessedBy,
          sabaqFrom: latestAttempt.sabaqFrom,
          sabaqTo: latestAttempt.sabaqTo,
        } : null,
      };
    });

    const masteredCount = takhtis.filter((t) => t.status === 'mastered').length;
    const trackedTakhtis = takhtis.filter((t) => t.status !== 'not_tracked').length;

    // Aggregate every error tag ever noted, most frequent first - the
    // clearest "what does this student actually need to work on" signal
    // for the report, across the whole journey not just the latest board.
    const errorCounts = new Map<string, number>();
    for (const record of progress.takhtis) {
      for (const attempt of record.attempts) {
        for (const err of attempt.errorsNoted || []) {
          errorCounts.set(err, (errorCounts.get(err) || 0) + 1);
        }
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
      currentTakhti: progress.currentTakhti,
      overallStatus: progress.overallStatus,
      recordType: progress.recordType,
      priorRecordNote: progress.priorRecordNote,
      masteredCount,
      totalTakhtis: QAIDA_TAKHTI_COUNT,
      trackedTakhtis,
      masteryPct: trackedTakhtis ? Math.round((masteredCount / trackedTakhtis) * 100) : 0,
      startDate: progress.startDate,
      completionDate: progress.completionDate,
      currentTeacher: progress.currentTeacher,
      overallRemarks: progress.overallRemarks,
      takhtis,
      commonErrors,
    };
  }
}
