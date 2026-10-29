import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PointsTransaction, PointsTransactionDocument, PointsSourceType } from './schemas/points-transaction.schema';
import { StudentPointsTotal, StudentPointsTotalDocument } from './schemas/student-points-total.schema';
import { AwardedBadge, AwardedBadgeDocument } from './schemas/awarded-badge.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { BADGE_BY_KEY, POINTS_MILESTONES } from './badge-catalog';

// ============================================================
// GAMIFICATION SERVICE — LMS Phase 5
// schoolSlug (not tenantId) is the required scoping key throughout -
// Student, and the Assessments module where quiz-completion points
// originate, only carry schoolSlug; tenantId is a Syllabus/Teaching/
// Organization-module concept some but not all call sites have handy.
// tenantId is accepted and stored when a caller has it, purely for
// cross-reference - never required to read this collection back.
//
// Every award method here follows CertificatesService.autoIssueCourseCompletion's
// convention: a no-op (not a throw) when the event was already credited,
// backed by a real DB-level unique index as the correctness guarantee
// rather than trusting the pre-check alone against races. Callers (lesson
// progress, quiz grading, forum posting) are expected to wrap these in
// try/catch and never let a gamification hiccup block the real action -
// same reasoning the certificate auto-issue call already documents at
// its own call site.
// ============================================================
@Injectable()
export class GamificationService {
  constructor(
    @InjectModel(PointsTransaction.name) private txModel: Model<PointsTransactionDocument>,
    @InjectModel(StudentPointsTotal.name) private totalModel: Model<StudentPointsTotalDocument>,
    @InjectModel(AwardedBadge.name) private badgeModel: Model<AwardedBadgeDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
  ) {}

  /** Returns the created transaction, or null if this exact (studentId, sourceType, sourceId) event was already credited. */
  async awardPoints(
    schoolSlug: string, studentId: string, delta: number, reason: string,
    sourceType: PointsSourceType, sourceId: string, opts?: { tenantId?: string; awardedBy?: string },
  ): Promise<PointsTransactionDocument | null> {
    let tx: PointsTransactionDocument;
    try {
      tx = await this.txModel.create({
        schoolSlug, studentId, delta, reason, sourceType, sourceId,
        tenantId: opts?.tenantId, awardedBy: opts?.awardedBy,
      });
    } catch (err: any) {
      if (err?.code === 11000) return null; // already credited - not an error
      throw err;
    }

    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('firstName lastName currentGrade currentSection').lean();
    const updated = await this.totalModel.findOneAndUpdate(
      { studentId },
      {
        $inc: { totalPoints: delta },
        $set: {
          schoolSlug, tenantId: opts?.tenantId,
          studentName: student ? `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim() : undefined,
          currentGrade: (student as any)?.currentGrade, currentSection: (student as any)?.currentSection,
        },
      },
      { upsert: true, new: true },
    );

    await this.checkPointMilestones(schoolSlug, studentId, updated.totalPoints, opts?.tenantId);
    return tx;
  }

  /** Returns the created badge, or null if this student already has this badge. */
  async awardBadge(
    schoolSlug: string, studentId: string, badgeKey: string, opts?: { tenantId?: string; sourceType?: string; sourceId?: string },
  ): Promise<AwardedBadgeDocument | null> {
    if (!BADGE_BY_KEY[badgeKey]) return null;
    try {
      return await this.badgeModel.create({
        schoolSlug, studentId, badgeKey, tenantId: opts?.tenantId, sourceType: opts?.sourceType, sourceId: opts?.sourceId,
      });
    } catch (err: any) {
      if (err?.code === 11000) return null;
      throw err;
    }
  }

  private async checkPointMilestones(schoolSlug: string, studentId: string, totalPoints: number, tenantId?: string) {
    for (const { threshold, badgeKey } of POINTS_MILESTONES) {
      if (totalPoints >= threshold) {
        await this.awardBadge(schoolSlug, studentId, badgeKey, { tenantId, sourceType: 'points_milestone', sourceId: String(threshold) });
      }
    }
  }

  /** A teacher/admin bonus-points action - never dedupes against another manual award (each gets its own unique sourceId). */
  async manualAward(schoolSlug: string, studentId: string, points: number, reason: string, awardedBy: string) {
    return this.awardPoints(schoolSlug, studentId, points, reason, 'manual_award', new Types.ObjectId().toString(), { awardedBy });
  }

  async getStudentSummary(schoolSlug: string, studentId: string) {
    const [total, badges] = await Promise.all([
      this.totalModel.findOne({ schoolSlug, studentId }).lean(),
      this.badgeModel.find({ schoolSlug, studentId }).sort({ createdAt: -1 }).lean(),
    ]);
    return {
      totalPoints: (total as any)?.totalPoints || 0,
      badges: badges.map((b: any) => ({
        ...(BADGE_BY_KEY[b.badgeKey] || { key: b.badgeKey, label: b.badgeKey, description: '', icon: '🏅' }),
        awardedAt: b.createdAt,
      })),
    };
  }

  async getLeaderboard(schoolSlug: string, filters: { grade?: string; section?: string }, limit = 20) {
    const filter: any = { schoolSlug };
    if (filters.grade) filter.currentGrade = filters.grade;
    if (filters.section) filter.currentSection = filters.section;
    const rows = await this.totalModel.find(filter).sort({ totalPoints: -1 }).limit(limit).lean();
    return rows.map((r: any, i: number) => ({
      rank: i + 1, studentId: r.studentId, studentName: r.studentName,
      currentGrade: r.currentGrade, currentSection: r.currentSection, totalPoints: r.totalPoints,
    }));
  }
}
