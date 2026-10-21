// ============================================================
// PARENT ENGAGEMENT SCORE — Phase 1
// Eldermin ERP | NestJS
// ============================================================
// Rates how cooperative/engaged a parent is, computed entirely from data
// already captured by other modules (fee payments, circular read receipts,
// leave requests vs. unexplained absences, app login activity) plus one new,
// minimal log (pickup/drop-off timeliness). Deliberately reuses the same
// "normalize several raw signals -> weighted 0-100 score -> labeled rating"
// shape BehaviourService already uses for Tarbiyah, including the identical
// rating-band thresholds, for product consistency.
//
// Two dimensions explicitly deferred to a later phase (not scored here):
// Tarbiyah-at-home parent task collaboration, and hygiene/grooming checks —
// neither has any data-collection workflow built yet.
// ============================================================

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PickupLog, PickupLogDocument } from './schemas/pickup-log.schema';
import { idMatch, idMatchIn } from '../common/utils/id-match.util';
import { BulkLogPickupDto } from './dto/parent-engagement.dto';

// Final weights (sum to 1.0), rebalanced for Phase 2 to make room for the
// two newly-built dimensions (Tarbiyah-at-home, hygiene). Fee punctuality
// and circular response stay the heaviest-weighted since they're the most
// concrete, least gameable signals; the two new dimensions get meaningful
// but not dominant weight since they're newer, softer signals with less
// of a track record. Kept here as one documented, easily-retunable config
// object rather than scattered magic numbers.
export const PARENT_ENGAGEMENT_WEIGHTS = {
  feePunctuality: 0.22,
  circularResponse: 0.18,
  leaveBehavior: 0.14,
  appEngagement: 0.14,
  pickupTimeliness: 0.12,
  tarbiyahAtHome: 0.12,
  hygieneCompliance: 0.08,
};

type DimensionKey = keyof typeof PARENT_ENGAGEMENT_WEIGHTS;

const RATING_LABELS = ['excellent', 'good', 'satisfactory', 'needs_improvement', 'critical'] as const;
export type ParentEngagementRating = typeof RATING_LABELS[number] | 'insufficient_data';

const getRating = (pct: number): ParentEngagementRating => {
  if (pct >= 90) return 'excellent';
  if (pct >= 70) return 'good';
  if (pct >= 50) return 'satisfactory';
  if (pct >= 30) return 'needs_improvement';
  return 'critical';
};

const RECOMMENDATIONS: Record<ParentEngagementRating, string> = {
  excellent: 'No action needed — this parent is highly engaged.',
  good: 'Doing well — occasional light check-ins are enough.',
  satisfactory: 'Monitor and gently encourage more consistent engagement.',
  needs_improvement: 'Flag for a follow-up call from the class teacher.',
  critical: 'Recommend a parent conference to address engagement gaps.',
  insufficient_data: 'Not enough data yet to generate a reliable score for this parent.',
};

const dayMs = 24 * 60 * 60 * 1000;
const daysBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / dayMs;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Mirrors parent-portal.service.ts's circular `reaches()` audience check,
// keyed off a plain student record rather than a logged-in guardian's
// aggregated scope, since this runs for one student at a time server-side.
function circularReachesStudent(circular: any, student: any): boolean {
  const a = circular.audience || {};
  switch (a.scope) {
    case 'campus': return !a.campusId || String(a.campusId) === String(student.campusId || '');
    case 'grade': return (a.gradeLevels || []).some((g: string) => String(g) === String(student.currentGrade));
    case 'individual': return (a.individualStudentIds || []).some((id: string) => String(id) === String(student._id));
    default: return true; // 'school'
  }
}

export interface DimensionResult { key: DimensionKey; label: string; score: number | null; dataPoints: number; }
export interface ParentEngagementScore {
  studentId: string;
  studentName: string;
  grade: string;
  section?: string;
  overallScore: number | null;
  rating: ParentEngagementRating;
  recommendation: string;
  dimensions: DimensionResult[];
}

@Injectable()
export class ParentEngagementService {
  constructor(
    @InjectModel(PickupLog.name) private pickupModel: Model<PickupLogDocument>,
    @InjectModel('Student') private studentModel: Model<any>,
    @InjectModel('StudentAttendance') private attendanceModel: Model<any>,
    @InjectModel('StudentLeave') private leaveModel: Model<any>,
    @InjectModel('Invoice') private invoiceModel: Model<any>,
    @InjectModel('Payment') private paymentModel: Model<any>,
    @InjectModel('Circular') private circularModel: Model<any>,
    @InjectModel('CircularAcknowledgment') private ackModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('HomeTask') private homeTaskModel: Model<any>,
    @InjectModel('HygieneCheck') private hygieneModel: Model<any>,
  ) {}

  // ── Pickup log ───────────────────────────────────────────────
  async bulkLogPickup(schoolSlug: string, dto: BulkLogPickupDto, markedBy: string, markedByUserId?: string) {
    const results = await Promise.all(dto.records.map((r) =>
      this.pickupModel.findOneAndUpdate(
        { schoolSlug, studentId: new Types.ObjectId(r.studentId), date: new Date(r.date) },
        {
          $set: {
            studentName: r.studentName, grade: r.grade, section: r.section,
            campusId: r.campusId ? new Types.ObjectId(r.campusId) : null,
            scheduledPickupTime: r.scheduledPickupTime, actualPickupTime: r.actualPickupTime,
            markedLate: !!r.markedLate, notes: r.notes, markedBy,
            markedByUserId: markedByUserId ? new Types.ObjectId(markedByUserId) : undefined,
          },
        },
        { upsert: true, new: true },
      ).lean(),
    ));
    return { logged: results.length };
  }

  async getPickupLogsForClass(schoolSlug: string, grade: string, section: string | undefined, date: string) {
    const filter: any = { schoolSlug, grade, date: new Date(date) };
    if (section) filter.section = section;
    return this.pickupModel.find(filter).lean();
  }

  // ── Per-dimension scorers ───────────────────────────────────
  private async scoreFeePunctuality(schoolSlug: string, student: any): Promise<DimensionResult> {
    const now = new Date();
    const invoices = await this.invoiceModel.find({
      schoolSlug, studentId: idMatch(student._id), isDeleted: { $ne: true },
      status: { $ne: 'draft' }, dueDate: { $lte: now, $gte: new Date(now.getTime() - 180 * dayMs) },
    }).select('_id dueDate status balanceDue totalAmount').sort({ dueDate: -1 }).limit(12).lean();

    if (!invoices.length) return { key: 'feePunctuality', label: 'Fee payment punctuality', score: null, dataPoints: 0 };

    const payments = await this.paymentModel.find({
      invoiceId: idMatchIn(invoices.map((i: any) => i._id)),
    }).select('invoiceId paymentDate').lean();
    const lastPaymentByInvoice = new Map<string, Date>();
    for (const p of payments) {
      const key = String(p.invoiceId);
      const prev = lastPaymentByInvoice.get(key);
      if (!prev || p.paymentDate > prev) lastPaymentByInvoice.set(key, p.paymentDate);
    }

    const scores = invoices.map((inv: any) => {
      const paidOn = lastPaymentByInvoice.get(String(inv._id));
      const stillOwed = (inv.balanceDue || 0) > 0;
      if (!paidOn && stillOwed) return 0; // still unpaid, past due
      if (!paidOn) return 100; // no payment record but not owed — treat as settled
      const lateDays = Math.max(0, Math.round(daysBetween(paidOn, inv.dueDate)));
      return clamp(100 - lateDays * 5);
    });
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { key: 'feePunctuality', label: 'Fee payment punctuality', score: parseFloat(score.toFixed(1)), dataPoints: invoices.length };
  }

  private async scoreCircularResponse(schoolSlug: string, student: any): Promise<DimensionResult> {
    const since = new Date(Date.now() - 90 * dayMs);
    const circulars = await this.circularModel.find({
      schoolSlug, status: 'published', 'audience.roles': 'parent',
      requiresAcknowledgment: true, publishedAt: { $gte: since },
    }).select('_id audience').lean();
    const reaching = circulars.filter((c: any) => circularReachesStudent(c, student));
    if (!reaching.length) return { key: 'circularResponse', label: 'Circular read response', score: null, dataPoints: 0 };

    const parentIds = await this.linkedParentIds(student._id);
    if (!parentIds.length) return { key: 'circularResponse', label: 'Circular read response', score: null, dataPoints: reaching.length };

    const acks = await this.ackModel.find({
      schoolSlug, circularId: idMatchIn(reaching.map((c: any) => c._id)), userId: idMatchIn(parentIds),
    }).select('circularId').lean();
    const ackedCircularIds = new Set(acks.map((a: any) => String(a.circularId)));
    const score = (ackedCircularIds.size / reaching.length) * 100;
    return { key: 'circularResponse', label: 'Circular read response', score: parseFloat(score.toFixed(1)), dataPoints: reaching.length };
  }

  private async scoreLeaveBehavior(schoolSlug: string, student: any): Promise<DimensionResult> {
    const now = new Date();
    const since = new Date(now.getTime() - 60 * dayMs);
    const attendance = await this.attendanceModel.find({
      schoolSlug, studentId: idMatch(student._id), date: { $gte: since, $lte: now },
    }).select('status date').lean();
    if (!attendance.length) return { key: 'leaveBehavior', label: 'Leave request behavior', score: null, dataPoints: 0 };

    const leaves = await this.leaveModel.find({
      schoolSlug, studentId: idMatch(student._id), fromDate: { $lte: now }, toDate: { $gte: since },
    }).select('fromDate toDate status createdAt').lean();
    const approved = leaves.filter((l: any) => l.status === 'approved');
    const isCovered = (d: Date) => approved.some((l: any) => d >= new Date(l.fromDate) && d <= new Date(l.toDate));

    const unexplainedAbsences = attendance.filter((a: any) => a.status === 'absent' && !isCovered(new Date(a.date))).length;
    const lateNoticeLeaves = leaves.filter((l: any) => daysBetween(new Date(l.fromDate), new Date(l.createdAt)) < 1).length;

    const score = clamp(100 - unexplainedAbsences * 15 - lateNoticeLeaves * 10);
    return { key: 'leaveBehavior', label: 'Leave request behavior', score: parseFloat(score.toFixed(1)), dataPoints: attendance.length };
  }

  private async linkedParentIds(studentId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const parents = await this.userModel.find({
      primaryRole: 'parent', isActive: { $ne: false }, guardianOfStudentIds: idMatch(studentId),
    }).select('_id lastLoginAt').lean();
    return parents.map((p: any) => p._id);
  }

  private async scoreAppEngagement(student: any): Promise<DimensionResult> {
    const parents = await this.userModel.find({
      primaryRole: 'parent', isActive: { $ne: false }, guardianOfStudentIds: idMatch(student._id),
    }).select('lastLoginAt').lean();
    if (!parents.length) return { key: 'appEngagement', label: 'App & communication engagement', score: null, dataPoints: 0 };

    const lastLogins = parents.map((p: any) => p.lastLoginAt).filter(Boolean) as Date[];
    if (!lastLogins.length) return { key: 'appEngagement', label: 'App & communication engagement', score: 0, dataPoints: parents.length };

    const mostRecent = new Date(Math.max(...lastLogins.map((d) => new Date(d).getTime())));
    const daysSince = daysBetween(new Date(), mostRecent);
    let score = 10;
    if (daysSince <= 7) score = 100;
    else if (daysSince <= 14) score = 80;
    else if (daysSince <= 30) score = 60;
    else if (daysSince <= 60) score = 30;
    return { key: 'appEngagement', label: 'App & communication engagement', score, dataPoints: parents.length };
  }

  private async scorePickupTimeliness(schoolSlug: string, student: any): Promise<DimensionResult> {
    const since = new Date(Date.now() - 60 * dayMs);
    const logs = await this.pickupModel.find({
      schoolSlug, studentId: idMatch(student._id), date: { $gte: since },
    }).select('markedLate').lean();
    if (!logs.length) return { key: 'pickupTimeliness', label: 'Pickup/drop-off timeliness', score: null, dataPoints: 0 };
    const onTime = logs.filter((l: any) => !l.markedLate).length;
    const score = (onTime / logs.length) * 100;
    return { key: 'pickupTimeliness', label: 'Pickup/drop-off timeliness', score: parseFloat(score.toFixed(1)), dataPoints: logs.length };
  }

  private async scoreTarbiyahAtHome(schoolSlug: string, student: any): Promise<DimensionResult> {
    const since = new Date(Date.now() - 90 * dayMs);
    const tasks = await this.homeTaskModel.find({
      schoolSlug, studentId: idMatch(student._id), assignedDate: { $gte: since },
    }).select('status reviewRating').lean();
    if (!tasks.length) return { key: 'tarbiyahAtHome', label: 'Tarbiyah-at-home collaboration', score: null, dataPoints: 0 };

    // Completion is what counts — a task a parent marked done but a teacher
    // never got around to reviewing still counts as fully done. Reviews,
    // when present, nudge the score (a 5/5 review tops it up, a 1/5 pulls
    // it down) but their absence is never held against the parent.
    const completed = tasks.filter((t: any) => t.status === 'completed');
    const completionRate = (completed.length / tasks.length) * 100;

    const reviewed = completed.filter((t: any) => typeof t.reviewRating === 'number');
    let score = completionRate;
    if (reviewed.length) {
      const avgReview = reviewed.reduce((sum: number, t: any) => sum + t.reviewRating, 0) / reviewed.length;
      const reviewPct = ((avgReview - 1) / 4) * 100; // 1-5 scale -> 0-100
      score = clamp(completionRate * 0.7 + reviewPct * 0.3);
    }
    return { key: 'tarbiyahAtHome', label: 'Tarbiyah-at-home collaboration', score: parseFloat(score.toFixed(1)), dataPoints: tasks.length };
  }

  private async scoreHygieneCompliance(schoolSlug: string, student: any): Promise<DimensionResult> {
    const since = new Date(Date.now() - 60 * dayMs);
    const checks = await this.hygieneModel.find({
      schoolSlug, studentId: idMatch(student._id), date: { $gte: since },
    }).select('items').lean();
    if (!checks.length) return { key: 'hygieneCompliance', label: 'Hygiene & grooming compliance', score: null, dataPoints: 0 };

    let compliant = 0; let total = 0;
    for (const c of checks) {
      const items = (c as any).items || {};
      for (const key of ['uniform', 'capOrScarf', 'shoes', 'lunchBrought']) {
        total += 1;
        if (items[key] !== false) compliant += 1;
      }
    }
    const score = total ? (compliant / total) * 100 : null;
    return {
      key: 'hygieneCompliance', label: 'Hygiene & grooming compliance',
      score: score === null ? null : parseFloat(score.toFixed(1)), dataPoints: checks.length,
    };
  }

  // ── Combine ──────────────────────────────────────────────────
  async computeScore(schoolSlug: string, studentId: string): Promise<ParentEngagementScore> {
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug })
      .select('firstName lastName currentGrade currentSection campusId').lean();
    if (!student) {
      return {
        studentId, studentName: 'Unknown', grade: '', overallScore: null,
        rating: 'insufficient_data', recommendation: RECOMMENDATIONS.insufficient_data, dimensions: [],
      };
    }
    const studentForScoring = { ...student, currentGrade: (student as any).currentGrade };

    const [fee, circular, leave, engagement, pickup, tarbiyahHome, hygiene] = await Promise.all([
      this.scoreFeePunctuality(schoolSlug, studentForScoring),
      this.scoreCircularResponse(schoolSlug, studentForScoring),
      this.scoreLeaveBehavior(schoolSlug, studentForScoring),
      this.scoreAppEngagement(studentForScoring),
      this.scorePickupTimeliness(schoolSlug, studentForScoring),
      this.scoreTarbiyahAtHome(schoolSlug, studentForScoring),
      this.scoreHygieneCompliance(schoolSlug, studentForScoring),
    ]);
    const dimensions = [fee, circular, leave, engagement, pickup, tarbiyahHome, hygiene];

    const present = dimensions.filter((d) => d.score !== null) as (DimensionResult & { score: number })[];
    let overallScore: number | null = null;
    let rating: ParentEngagementRating = 'insufficient_data';
    if (present.length) {
      const totalWeight = present.reduce((sum, d) => sum + PARENT_ENGAGEMENT_WEIGHTS[d.key], 0);
      const weighted = present.reduce((sum, d) => sum + d.score * PARENT_ENGAGEMENT_WEIGHTS[d.key], 0);
      overallScore = parseFloat((weighted / totalWeight).toFixed(1));
      rating = getRating(overallScore);
    }

    return {
      studentId: String((student as any)._id),
      studentName: `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim(),
      grade: (student as any).currentGrade,
      section: (student as any).currentSection,
      overallScore, rating, recommendation: RECOMMENDATIONS[rating], dimensions,
    };
  }

  async getClassScores(schoolSlug: string, query: { grade?: string; section?: string; campusId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const filter: any = { schoolSlug };
    if (query.grade) filter.currentGrade = query.grade;
    if (query.section) filter.currentSection = query.section;
    if (query.campusId) filter.campusId = query.campusId;

    const [students, total] = await Promise.all([
      this.studentModel.find(filter).select('_id').skip((page - 1) * limit).limit(limit).lean(),
      this.studentModel.countDocuments(filter),
    ]);
    const scores = await Promise.all(students.map((s: any) => this.computeScore(schoolSlug, String(s._id))));
    return { data: scores, total, page, limit };
  }
}
