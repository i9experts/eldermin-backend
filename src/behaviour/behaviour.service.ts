// ============================================================
// BEHAVIOUR & TARBIYAH SERVICE
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  BehaviourRecord, BehaviourRecordDocument,
  TarbiyahAssessment, TarbiyahAssessmentDocument,
  CounsellingSession, CounsellingSessionDocument,
  Intervention, InterventionDocument,
  BehaviourContract, BehaviourContractDocument,
  TARBIYAH_TRAITS,
} from './schemas/behaviour.schema';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

const getTarbiyahRating = (avg: number): string => {
  if (avg >= 4.5) return 'excellent';
  if (avg >= 3.5) return 'good';
  if (avg >= 2.5) return 'satisfactory';
  if (avg >= 1.5) return 'needs_improvement';
  return 'critical';
};

@Injectable()
export class BehaviourService {
  constructor(
    @InjectModel(BehaviourRecord.name) private recordModel: Model<BehaviourRecordDocument>,
    @InjectModel(TarbiyahAssessment.name) private tarbiyahModel: Model<TarbiyahAssessmentDocument>,
    @InjectModel(CounsellingSession.name) private counsellingModel: Model<CounsellingSessionDocument>,
    @InjectModel(Intervention.name) private interventionModel: Model<InterventionDocument>,
    @InjectModel(BehaviourContract.name) private contractModel: Model<BehaviourContractDocument>,
  ) {}

  // ============================================================
  // DASHBOARD
  // ============================================================
  async getDashboard(schoolSlug: string, academicYear?: string) {
    const base: any = { schoolSlug };
    if (academicYear) base.academicYear = academicYear;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(new Date().setDate(1));

    const [
      totalIncidents, positiveIncidents, negativeIncidents,
      unresolvedCritical, incidentsThisWeek,
      activeInterventions, pendingCounselling,
      activeBehaviourContracts, overdueFollowUps,
      incidentsByCategory, incidentsByGrade,
      trendByMonth, topBehaviourConcerns,
      recentIncidents, studentsAtRisk,
      tarbiyahSummary,
    ] = await Promise.all([
      this.recordModel.countDocuments(base),
      this.recordModel.countDocuments({ ...base, type: 'positive' }),
      this.recordModel.countDocuments({ ...base, type: 'negative' }),
      this.recordModel.countDocuments({ ...base, severity: 'critical', resolved: false }),
      this.recordModel.countDocuments({ ...base, date: { $gte: weekAgo } }),
      this.interventionModel.countDocuments({ ...base, status: 'active' }),
      this.counsellingModel.countDocuments({ ...base, status: 'scheduled' }),
      this.contractModel.countDocuments({ ...base, status: 'active' }),
      this.recordModel.countDocuments({
        ...base, followUpRequired: true, resolved: false,
        followUpDate: { $lte: new Date() },
      }),
      this.recordModel.aggregate([
        { $match: base },
        { $group: { _id: { type: '$type', category: '$category' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      this.recordModel.aggregate([
        { $match: base },
        { $group: {
          _id: '$grade',
          positive: { $sum: { $cond: [{ $eq: ['$type', 'positive'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$type', 'negative'] }, 1, 0] } },
          total: { $sum: 1 },
        }},
        { $sort: { total: -1 } },
      ]),
      this.recordModel.aggregate([
        { $match: { ...base, date: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 5)) } } },
        { $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          positive: { $sum: { $cond: [{ $eq: ['$type', 'positive'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$type', 'negative'] }, 1, 0] } },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      this.recordModel.aggregate([
        { $match: { ...base, type: 'negative' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      this.recordModel.find(base).sort({ date: -1 }).limit(8)
        .select('studentName grade type category severity date resolved reportedBy'),
      // Students with 3+ negative incidents this month
      this.recordModel.aggregate([
        { $match: { ...base, type: 'negative', date: { $gte: monthStart } } },
        { $group: { _id: '$studentId', studentName: { $first: '$studentName' }, grade: { $first: '$grade' }, count: { $sum: 1 } } },
        { $match: { count: { $gte: 3 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      this.tarbiyahModel.aggregate([
        { $match: base },
        { $group: {
          _id: null,
          avgScore: { $avg: '$overallScore' },
          excellent: { $sum: { $cond: [{ $eq: ['$overallRating', 'excellent'] }, 1, 0] } },
          good: { $sum: { $cond: [{ $eq: ['$overallRating', 'good'] }, 1, 0] } },
          needsImprovement: { $sum: { $cond: [{ $eq: ['$overallRating', 'needs_improvement'] }, 1, 0] } },
          total: { $sum: 1 },
        }},
      ]),
    ]);

    return {
      stats: {
        totalIncidents, positiveIncidents, negativeIncidents,
        unresolvedCritical, incidentsThisWeek,
        activeInterventions, pendingCounselling,
        activeBehaviourContracts, overdueFollowUps,
        positivityRatio: totalIncidents > 0
          ? parseFloat(((positiveIncidents / totalIncidents) * 100).toFixed(1)) : 0,
      },
      incidentsByCategory, incidentsByGrade,
      trendByMonth: trendByMonth.map(t => ({
        month: `${t._id.year}-${String(t._id.month).padStart(2, '0')}`,
        positive: t.positive, negative: t.negative,
      })),
      topBehaviourConcerns,
      recentIncidents,
      studentsAtRisk,
      tarbiyahSummary: tarbiyahSummary[0] || { avgScore: 0, total: 0 },
    };
  }

  // ============================================================
  // BEHAVIOUR RECORDS
  // ============================================================
  async createRecord(data: any) {
    const record = new this.recordModel({
      ...data,
      date: new Date(data.date),
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : undefined,
    });
    return record.save();
  }

  async getRecords(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, type, category, severity, grade, studentId,
      resolved, from, to, followUpOverdue } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (severity) filter.severity = severity;
    if (grade) filter.grade = grade;
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (resolved !== undefined) filter.resolved = resolved === 'true';
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    if (followUpOverdue === 'true') {
      filter.followUpRequired = true;
      filter.resolved = false;
      filter.followUpDate = { $lte: new Date() };
    }
    if (query.search) {
      filter.$or = [
        { studentName: { $regex: query.search, $options: 'i' } },
        { title: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.recordModel.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
      this.recordModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getRecordById(id: string, schoolSlug: string) {
    const r = await this.recordModel.findOne({ _id: id, schoolSlug });
    if (!r) throw new NotFoundException('Record not found');
    return r;
  }

  async updateRecord(id: string, schoolSlug: string, data: any) {
    return this.recordModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async resolveRecord(id: string, schoolSlug: string, note: string, resolvedBy: string) {
    return this.recordModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { resolved: true, resolvedDate: new Date(), resolvedNote: note, verifiedBy: resolvedBy } },
      { new: true },
    );
  }

  async getStudentBehaviourProfile(studentId: string, schoolSlug: string, academicYear?: string) {
    const filter: any = { studentId: new Types.ObjectId(studentId), schoolSlug };
    if (academicYear) filter.academicYear = academicYear;

    const [records, pointsTotal, byCategory, recent, tarbiyahHistory] = await Promise.all([
      this.recordModel.aggregate([
        { $match: filter },
        { $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalPoints: { $sum: '$points' },
        }},
      ]),
      this.recordModel.aggregate([
        { $match: filter },
        { $group: { _id: null, totalPoints: { $sum: '$points' } } },
      ]),
      this.recordModel.aggregate([
        { $match: filter },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.recordModel.find(filter).sort({ date: -1 }).limit(20),
      this.tarbiyahModel.find(filter).sort({ assessmentDate: -1 }).limit(4),
    ]);

    return {
      records, pointsTotal: pointsTotal[0]?.totalPoints || 0,
      byCategory, recent, tarbiyahHistory,
    };
  }

  // ============================================================
  // TARBIYAH ASSESSMENTS
  // ============================================================
  async createTarbiyahAssessment(data: any) {
    const traits = data.traits || [];
    const avgScore = traits.length > 0
      ? traits.reduce((a: number, t: any) => a + t.score, 0) / traits.length : 0;
    const overallPercentage = (avgScore / 5) * 100;

    const assessment = new this.tarbiyahModel({
      ...data,
      assessmentDate: new Date(data.assessmentDate),
      overallScore: parseFloat(avgScore.toFixed(2)),
      overallPercentage: parseFloat(overallPercentage.toFixed(1)),
      overallRating: getTarbiyahRating(avgScore),
    });
    return assessment.save();
  }

  async getTarbiyahAssessments(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, grade, studentId, period, periodType } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (grade) filter.grade = grade;
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (period) filter.period = period;
    if (periodType) filter.periodType = periodType;

    const [data, total] = await Promise.all([
      this.tarbiyahModel.find(filter).sort({ assessmentDate: -1 }).skip(skip).limit(limit),
      this.tarbiyahModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getTarbiyahTraitAnalytics(schoolSlug: string, grade?: string, period?: string) {
    const filter: any = { schoolSlug };
    if (grade) filter.grade = grade;
    if (period) filter.period = period;

    const traitAverages = await this.tarbiyahModel.aggregate([
      { $match: filter },
      { $unwind: '$traits' },
      { $group: {
        _id: '$traits.traitKey',
        avgScore: { $avg: '$traits.score' },
        count: { $sum: 1 },
      }},
      { $sort: { avgScore: 1 } },
    ]);

    const gradeComparison = await this.tarbiyahModel.aggregate([
      { $match: { schoolSlug } },
      { $group: {
        _id: '$grade',
        avgScore: { $avg: '$overallScore' },
        count: { $sum: 1 },
      }},
      { $sort: { avgScore: -1 } },
    ]);

    return {
      traits: TARBIYAH_TRAITS,
      traitAverages,
      gradeComparison,
    };
  }

  async updateTarbiyahAssessment(id: string, schoolSlug: string, data: any) {
    return this.tarbiyahModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  // ============================================================
  // COUNSELLING SESSIONS
  // ============================================================
  async createCounsellingSession(data: any) {
    const session = new this.counsellingModel({
      ...data,
      sessionDate: new Date(data.sessionDate),
      nextSessionDate: data.nextSessionDate ? new Date(data.nextSessionDate) : undefined,
    });
    return session.save();
  }

  async getCounsellingSessions(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, type, counsellor, studentId, from, to } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (counsellor) filter.counsellor = { $regex: counsellor, $options: 'i' };
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (from || to) {
      filter.sessionDate = {};
      if (from) filter.sessionDate.$gte = new Date(from);
      if (to) filter.sessionDate.$lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.counsellingModel.find(filter).sort({ sessionDate: -1 }).skip(skip).limit(limit),
      this.counsellingModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async updateCounsellingSession(id: string, schoolSlug: string, data: any) {
    return this.counsellingModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async completeCounsellingSession(id: string, schoolSlug: string, completionData: any) {
    return this.counsellingModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      {
        $set: {
          status: 'completed',
          sessionNotes: completionData.sessionNotes,
          studentResponse: completionData.studentResponse,
          actionPlan: completionData.actionPlan,
          goals: completionData.goals || [],
          followUpRequired: completionData.followUpRequired,
          nextSessionDate: completionData.nextSessionDate ? new Date(completionData.nextSessionDate) : undefined,
          nextSessionFocus: completionData.nextSessionFocus,
        },
      },
      { new: true },
    );
  }

  // ============================================================
  // INTERVENTIONS
  // ============================================================
  async createIntervention(data: any) {
    const intervention = new this.interventionModel({
      ...data,
      startDate: new Date(data.startDate),
      reviewDate: data.reviewDate ? new Date(data.reviewDate) : undefined,
    });
    return intervention.save();
  }

  async getInterventions(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, type, tier, studentId, overduereview } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (tier) filter.tier = tier;
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (overduereview === 'true') {
      filter.status = 'active';
      filter.reviewDate = { $lte: new Date() };
    }

    const [data, total] = await Promise.all([
      this.interventionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.interventionModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async updateIntervention(id: string, schoolSlug: string, data: any) {
    return this.interventionModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async addProgressNote(id: string, schoolSlug: string, note: string, addedBy: string) {
    return this.interventionModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $push: { progressNotes: { date: new Date(), note, addedBy } } },
      { new: true },
    );
  }

  async updateActionStatus(id: string, schoolSlug: string, actionId: string, status: string, completionNote?: string) {
    return this.interventionModel.findOneAndUpdate(
      { _id: id, schoolSlug, 'actions._id': new Types.ObjectId(actionId) },
      {
        $set: {
          'actions.$.status': status,
          'actions.$.completionNote': completionNote,
          'actions.$.completedAt': status === 'completed' ? new Date() : undefined,
        },
      },
      { new: true },
    );
  }

  // ============================================================
  // BEHAVIOUR CONTRACTS
  // ============================================================
  async createContract(data: any) {
    const contract = new this.contractModel({
      ...data,
      startDate: new Date(data.startDate),
      reviewDate: new Date(data.reviewDate),
    });
    return contract.save();
  }

  async getContracts(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, studentId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    const [data, total] = await Promise.all([
      this.contractModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.contractModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async signContract(id: string, schoolSlug: string, signedBy: 'student' | 'parent' | 'teacher') {
    const update: any = {};
    update[`${signedBy}Signed`] = true;
    update[`${signedBy}SignedDate`] = new Date();

    const contract = await this.contractModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: update }, { new: true },
    );

    // If all signed, activate
    if (contract?.studentSigned && contract?.parentSigned && contract?.teacherSigned) {
      await this.contractModel.findByIdAndUpdate(id, { $set: { status: 'active' } });
    }
    return contract;
  }

  // ============================================================
  // REPORTS
  // ============================================================
  async getBehaviourReport(schoolSlug: string, academicYear: string, grade?: string, from?: string, to?: string) {
    const filter: any = { schoolSlug, academicYear };
    if (grade) filter.grade = grade;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const [
      summary, byType, bySeverity, byCategory, weeklyTrend,
      mostFrequentStudents, topPositiveStudents,
    ] = await Promise.all([
      this.recordModel.aggregate([
        { $match: filter },
        { $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalPoints: { $sum: '$points' },
          resolved: { $sum: { $cond: ['$resolved', 1, 0] } },
        }},
      ]),
      this.recordModel.aggregate([
        { $match: filter },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
      this.recordModel.aggregate([
        { $match: filter },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.recordModel.aggregate([
        { $match: filter },
        { $group: { _id: '$category', count: { $sum: 1 }, type: { $first: '$type' } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      this.recordModel.aggregate([
        { $match: { ...filter, date: { $gte: new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000) } } },
        { $group: {
          _id: { week: { $week: '$date' }, year: { $year: '$date' }, type: '$type' },
          count: { $sum: 1 },
        }},
        { $sort: { '_id.year': 1, '_id.week': 1 } },
      ]),
      this.recordModel.aggregate([
        { $match: { ...filter, type: 'negative' } },
        { $group: { _id: '$studentId', studentName: { $first: '$studentName' }, grade: { $first: '$grade' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      this.recordModel.aggregate([
        { $match: { ...filter, type: 'positive' } },
        { $group: { _id: '$studentId', studentName: { $first: '$studentName' }, grade: { $first: '$grade' }, count: { $sum: 1 }, totalPoints: { $sum: '$points' } } },
        { $sort: { totalPoints: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return { summary, byType, bySeverity, byCategory, weeklyTrend, mostFrequentStudents, topPositiveStudents };
  }
}
