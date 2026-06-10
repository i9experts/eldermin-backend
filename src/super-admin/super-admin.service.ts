// ============================================================
// SUPER ADMIN SERVICE — Eldermin SaaS Platform
// NestJS + MongoDB
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Institution, InstitutionDocument, SUBSCRIPTION_PLANS,
  SubscriptionHistory, SubscriptionHistoryDocument,
  UsageLog, UsageLogDocument,
  Announcement, AnnouncementDocument,
  SupportTicket, SupportTicketDocument,
} from './schemas/super-admin.schema';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

// Health score calculation
const calcHealthScore = (inst: Institution): number => {
  let score = 0;
  const now = new Date();

  // Last activity recency (30 pts)
  if (inst.lastActivityAt) {
    const daysSince = (now.getTime() - new Date(inst.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 1) score += 30;
    else if (daysSince <= 3) score += 25;
    else if (daysSince <= 7) score += 15;
    else if (daysSince <= 14) score += 5;
  }

  // Daily active users (20 pts)
  const dau = inst.dailyActiveUsers || 0;
  if (dau >= 10) score += 20;
  else if (dau >= 5) score += 15;
  else if (dau >= 2) score += 8;
  else if (dau >= 1) score += 3;

  // Setup completed (15 pts)
  if (inst.setupCompleted) score += 15;
  else score += Math.floor((inst.onboardingStep || 0) / 8 * 15);

  // Students enrolled (15 pts)
  const students = inst.usage?.totalStudents || 0;
  if (students >= 100) score += 15;
  else if (students >= 50) score += 10;
  else if (students >= 20) score += 5;
  else if (students >= 5) score += 3;

  // Feature adoption (20 pts)
  const adopted = Object.values(inst.featureAdoption || {}).filter(Boolean).length;
  const total = Object.keys(inst.featureAdoption || {}).length || 1;
  score += Math.floor((adopted / total) * 20);

  return Math.min(score, 100);
};

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectModel(Institution.name) private institutionModel: Model<InstitutionDocument>,
    @InjectModel(SubscriptionHistory.name) private subHistoryModel: Model<SubscriptionHistoryDocument>,
    @InjectModel(UsageLog.name) private usageLogModel: Model<UsageLogDocument>,
    @InjectModel(Announcement.name) private announcementModel: Model<AnnouncementDocument>,
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicketDocument>,
  ) {}

  // ============================================================
  // BUSINESS INTELLIGENCE DASHBOARD
  // ============================================================
  async getBusinessIntelligence() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      // Core counts
      totalInstitutions, activeInstitutions, trialInstitutions,
      suspendedInstitutions, churnedInstitutions,
      newThisMonth, newLastMonth, newThisWeek, newToday,

      // Revenue
      revenueData, prevMonthRevenue,

      // Platform totals (aggregated across all tenants)
      totalStudents, totalStaff,

      // Plan distribution
      planDistribution,

      // Geography
      cityDistribution, countryDistribution,

      // Activity
      inactiveWeek, inactiveMonth,
      trialsExpiringSoon, subscriptionsExpiringSoon,

      // Growth trend (last 6 months)
      monthlyGrowth,

      // Top institutions
      topByStudents, recentSignups,

      // Support
      openTickets,
    ] = await Promise.all([
      this.institutionModel.countDocuments(),
      this.institutionModel.countDocuments({ status: 'active' }),
      this.institutionModel.countDocuments({ status: 'trial' }),
      this.institutionModel.countDocuments({ status: 'suspended' }),
      this.institutionModel.countDocuments({ status: 'churned' }),

      this.institutionModel.countDocuments({ createdAt: { $gte: monthStart } }),
      this.institutionModel.countDocuments({ createdAt: { $gte: prevMonthStart, $lt: monthStart } }),
      this.institutionModel.countDocuments({ createdAt: { $gte: weekAgo } }),
      this.institutionModel.countDocuments({ createdAt: { $gte: dayAgo } }),

      // MRR from active subscriptions
      this.institutionModel.aggregate([
        { $match: { status: { $in: ['active', 'trial'] } } },
        { $group: { _id: '$plan', count: { $sum: 1 }, mrr: { $sum: '$monthlyRevenue' } } },
      ]),
      this.institutionModel.aggregate([
        { $match: { status: 'active', subscriptionStartDate: { $lt: monthStart } } },
        { $group: { _id: null, total: { $sum: '$monthlyRevenue' } } },
      ]),

      // Aggregate student/staff counts
      this.institutionModel.aggregate([
        { $group: { _id: null, students: { $sum: '$usage.totalStudents' }, staff: { $sum: '$usage.totalStaff' } } },
      ]),
      this.institutionModel.aggregate([
        { $group: { _id: null, students: { $sum: '$usage.totalStudents' }, staff: { $sum: '$usage.totalStaff' } } },
      ]),

      // Plan distribution
      this.institutionModel.aggregate([
        { $group: { _id: '$plan', count: { $sum: 1 }, revenue: { $sum: '$monthlyRevenue' } } },
        { $sort: { count: -1 } },
      ]),

      // City distribution
      this.institutionModel.aggregate([
        { $group: { _id: '$city', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      this.institutionModel.aggregate([
        { $group: { _id: '$country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // At risk
      this.institutionModel.countDocuments({
        status: { $in: ['active', 'trial'] },
        lastActivityAt: { $lt: weekAgo },
      }),
      this.institutionModel.countDocuments({
        status: { $in: ['active', 'trial'] },
        lastActivityAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }),

      // Expiring
      this.institutionModel.find({
        status: 'trial',
        trialEndDate: { $gte: now, $lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
      }).select('name slug trialEndDate plan city').limit(10),
      this.institutionModel.find({
        status: 'active',
        subscriptionEndDate: { $gte: now, $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      }).select('name slug subscriptionEndDate plan monthlyRevenue').limit(10),

      // Monthly growth
      this.institutionModel.aggregate([
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            count: { $sum: 1 },
            revenue: { $sum: '$monthlyRevenue' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 12 },
      ]),

      // Top institutions by students
      this.institutionModel.find({ status: 'active' })
        .sort({ 'usage.totalStudents': -1 }).limit(10)
        .select('name slug plan city usage healthScore lastActivityAt'),
      this.institutionModel.find()
        .sort({ createdAt: -1 }).limit(8)
        .select('name slug plan status city createdAt primaryContact'),

      this.ticketModel.countDocuments({ status: 'open' }),
    ]);

    const mrr = revenueData.reduce((a: number, r: any) => a + (r.mrr || 0), 0);
    const arr = mrr * 12;
    const prevMrr = prevMonthRevenue[0]?.total || 0;
    const mrrGrowth = prevMrr > 0 ? (((mrr - prevMrr) / prevMrr) * 100).toFixed(1) : 0;

    // Churn rate
    const churnRate = totalInstitutions > 0
      ? ((churnedInstitutions / totalInstitutions) * 100).toFixed(1) : 0;

    return {
      overview: {
        totalInstitutions, activeInstitutions, trialInstitutions,
        suspendedInstitutions, churnedInstitutions,
        newToday, newThisWeek, newThisMonth, newLastMonth,
        totalStudents: totalStudents[0]?.students || 0,
        totalStaff: totalStaff[0]?.staff || 0,
        openTickets,
        growthRate: newLastMonth > 0
          ? (((newThisMonth - newLastMonth) / newLastMonth) * 100).toFixed(1) : 0,
      },
      revenue: {
        mrr, arr, prevMrr, mrrGrowth, churnRate,
        planBreakdown: revenueData,
      },
      planDistribution,
      cityDistribution,
      countryDistribution,
      activity: { inactiveWeek, inactiveMonth },
      alerts: { trialsExpiringSoon, subscriptionsExpiringSoon },
      monthlyGrowth: monthlyGrowth.map((m: any) => ({
        month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
        count: m.count,
        revenue: m.revenue,
      })),
      topInstitutions: topByStudents,
      recentSignups,
    };
  }

  // ============================================================
  // INSTITUTION MANAGEMENT
  // ============================================================
  async getInstitutions(query: any) {
    const { page = 1, limit = 20, search, status, plan, city, churnRisk, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const { skip } = paged(page, limit);

    const filter: any = {};
    if (status) filter.status = status;
    if (plan) filter.plan = plan;
    if (city) filter.city = { $regex: city, $options: 'i' };
    if (churnRisk === 'true') filter.isAtChurnRisk = true;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { 'primaryContact.email': { $regex: search, $options: 'i' } },
      ];
    }

    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.institutionModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.institutionModel.countDocuments(filter),
    ]);

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getInstitutionById(slug: string) {
    const inst = await this.institutionModel.findOne({ slug });
    if (!inst) throw new NotFoundException('Institution not found');

    // Get subscription history
    const subHistory = await this.subHistoryModel.find({ institutionSlug: slug })
      .sort({ createdAt: -1 }).limit(10);

    // Get usage trend (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const usageTrend = await this.usageLogModel.find({
      institutionSlug: slug,
      date: { $gte: thirtyDaysAgo },
    }).sort({ date: 1 });

    return { institution: inst, subHistory, usageTrend };
  }

  async createInstitution(data: any, createdBy: string) {
    // Check slug uniqueness
    const existing = await this.institutionModel.findOne({ slug: data.slug });
    if (existing) throw new BadRequestException('Slug already exists');

    const now = new Date();
    const trialEndDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const institution = new this.institutionModel({
      ...data,
      status: 'trial',
      plan: 'free_trial',
      trialStartDate: now,
      trialEndDate,
      enabledModules: ['organization', 'students', 'admissions', 'hr'],
      onboardingStep: 0,
      healthScore: 0,
    });
    await institution.save();

    // Log subscription event
    const history = new this.subHistoryModel({
      institutionSlug: data.slug,
      institutionName: data.name,
      event: 'trial_started',
      toPlan: 'free_trial',
      amount: 0,
      paymentStatus: 'free',
      processedBy: createdBy,
      effectiveDate: now,
    });
    await history.save();

    return institution;
  }

  async updateInstitutionStatus(slug: string, status: string, reason: string, updatedBy: string) {
    const inst = await this.institutionModel.findOne({ slug });
    if (!inst) throw new NotFoundException('Institution not found');

    const update: any = { status };
    if (status === 'suspended') { update.suspendedAt = new Date(); update.suspendedReason = reason; }
    if (status === 'churned') { update.churnedAt = new Date(); update.churnedReason = reason; }

    await this.institutionModel.findOneAndUpdate({ slug }, { $set: update });

    // Log event
    await new this.subHistoryModel({
      institutionSlug: slug, institutionName: inst.name,
      event: status === 'active' ? 'reactivation' : 'cancellation',
      processedBy: updatedBy, notes: reason, effectiveDate: new Date(),
    }).save();

    return { message: `Institution ${status}` };
  }

  async updateSubscription(slug: string, data: any, updatedBy: string) {
    const inst = await this.institutionModel.findOne({ slug });
    if (!inst) throw new NotFoundException('Institution not found');

    const planConfig = SUBSCRIPTION_PLANS[data.plan as keyof typeof SUBSCRIPTION_PLANS];
    const monthlyRevenue = data.customPrice || planConfig?.price || 0;

    const update: any = {
      plan: data.plan,
      status: 'active',
      monthlyRevenue,
      subscriptionStartDate: new Date(data.startDate || Date.now()),
      subscriptionEndDate: new Date(data.endDate),
      autoRenew: data.autoRenew || false,
      billingCycle: data.billingCycle || 'monthly',
      enabledModules: data.plan === 'enterprise' || data.plan === 'professional'
        ? ['all'] : planConfig?.features || [],
    };

    await this.institutionModel.findOneAndUpdate({ slug }, { $set: update });

    const event = inst.plan === 'free_trial' ? 'trial_converted'
      : (SUBSCRIPTION_PLANS[data.plan as keyof typeof SUBSCRIPTION_PLANS]?.price || 0) >
        (SUBSCRIPTION_PLANS[inst.plan as keyof typeof SUBSCRIPTION_PLANS]?.price || 0)
        ? 'upgrade' : 'renewal';

    await new this.subHistoryModel({
      institutionSlug: slug, institutionName: inst.name,
      event, fromPlan: inst.plan, toPlan: data.plan,
      amount: monthlyRevenue, paymentStatus: data.paymentStatus || 'paid',
      paymentMethod: data.paymentMethod, transactionId: data.transactionId,
      processedBy: updatedBy, effectiveDate: new Date(),
    }).save();

    return { message: 'Subscription updated' };
  }

  async updateHealthScores() {
    const institutions = await this.institutionModel.find();
    const bulk = institutions.map(inst => {
      const health = calcHealthScore(inst);
      const isAtRisk = health < 30 && inst.status !== 'churned';
      let churnRiskReason = '';
      if (isAtRisk) {
        if (!inst.lastActivityAt || (Date.now() - new Date(inst.lastActivityAt).getTime()) > 7 * 24 * 60 * 60 * 1000) {
          churnRiskReason = 'No activity in 7+ days';
        } else if (inst.dailyActiveUsers === 0) {
          churnRiskReason = 'Zero daily active users';
        }
      }
      return {
        updateOne: {
          filter: { _id: inst._id },
          update: { $set: { healthScore: health, isAtChurnRisk: isAtRisk, churnRiskReason } },
        },
      };
    });
    await this.institutionModel.bulkWrite(bulk);
    return { message: `Updated health scores for ${institutions.length} institutions` };
  }

  async recordDailyUsage(slug: string, usageData: any) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.usageLogModel.findOneAndUpdate(
      { institutionSlug: slug, date: today },
      { $set: { ...usageData, institutionSlug: slug, date: today } },
      { upsert: true, new: true },
    );
  }

  // ============================================================
  // PLATFORM ANALYTICS
  // ============================================================
  async getPlatformAnalytics() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      moduleAdoption, featureUsageTrend,
      topActiveInstitutions, churnRiskInstitutions,
      avgHealthByPlan,
    ] = await Promise.all([
      // Module adoption across all institutions
      this.institutionModel.aggregate([
        { $unwind: '$enabledModules' },
        { $group: { _id: '$enabledModules', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Daily platform activity trend
      this.usageLogModel.aggregate([
        { $match: { date: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: '$date',
          totalLogins: { $sum: '$dailyLogins' },
          activeInstitutions: { $sum: 1 },
          studentsAdded: { $sum: '$studentsAdded' },
        }},
        { $sort: { _id: 1 } },
      ]),

      // Most active institutions
      this.usageLogModel.aggregate([
        { $match: { date: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: '$institutionSlug',
          totalLogins: { $sum: '$dailyLogins' },
          avgUsers: { $avg: '$uniqueUsers' },
          activeDays: { $sum: 1 },
        }},
        { $sort: { totalLogins: -1 } },
        { $limit: 10 },
      ]),

      // Churn risk institutions
      this.institutionModel.find({ isAtChurnRisk: true, status: { $in: ['active', 'trial'] } })
        .select('name slug plan healthScore churnRiskReason lastActivityAt city')
        .sort({ healthScore: 1 }).limit(20),

      // Avg health by plan
      this.institutionModel.aggregate([
        { $match: { status: { $in: ['active', 'trial'] } } },
        { $group: { _id: '$plan', avgHealth: { $avg: '$healthScore' }, count: { $sum: 1 } } },
      ]),
    ]);

    return { moduleAdoption, featureUsageTrend, topActiveInstitutions, churnRiskInstitutions, avgHealthByPlan };
  }

  // ============================================================
  // ALERTS
  // ============================================================
  async getAlerts() {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      trialsExpiring3Days, trialsExpiring7Days,
      subscriptionsExpiring, inactiveInstitutions,
      churnRisk, failedPayments, openTickets,
    ] = await Promise.all([
      this.institutionModel.find({
        status: 'trial',
        trialEndDate: { $gte: now, $lte: in3Days },
      }).select('name slug trialEndDate plan primaryContact city'),

      this.institutionModel.find({
        status: 'trial',
        trialEndDate: { $gte: in3Days, $lte: in7Days },
      }).select('name slug trialEndDate plan primaryContact city').limit(20),

      this.institutionModel.find({
        status: 'active',
        subscriptionEndDate: { $gte: now, $lte: in7Days },
      }).select('name slug subscriptionEndDate plan monthlyRevenue primaryContact'),

      this.institutionModel.find({
        status: { $in: ['active', 'trial'] },
        lastActivityAt: { $lt: sevenDaysAgo },
      }).select('name slug plan lastActivityAt healthScore city').sort({ lastActivityAt: 1 }).limit(20),

      this.institutionModel.find({ isAtChurnRisk: true, status: { $in: ['active', 'trial'] } })
        .select('name slug plan healthScore churnRiskReason').sort({ healthScore: 1 }).limit(20),

      this.subHistoryModel.find({ paymentStatus: 'failed' }).sort({ createdAt: -1 }).limit(10)
        .select('institutionName institutionSlug amount createdAt'),

      this.ticketModel.find({ status: { $in: ['open', 'in_progress'] }, priority: { $in: ['high', 'critical'] } })
        .sort({ createdAt: -1 }).limit(10)
        .select('ticketNumber institutionName subject priority createdAt'),
    ]);

    return {
      trialsExpiring3Days,
      trialsExpiring7Days,
      subscriptionsExpiring,
      inactiveInstitutions,
      churnRisk,
      failedPayments,
      openTickets,
      summary: {
        criticalAlerts: trialsExpiring3Days.length + failedPayments.length,
        highAlerts: subscriptionsExpiring.length + inactiveInstitutions.length,
        churnRiskCount: churnRisk.length,
      },
    };
  }

  // ============================================================
  // ANNOUNCEMENTS
  // ============================================================
  async createAnnouncement(data: any) {
    const ann = new this.announcementModel(data);
    return ann.save();
  }

  async getAnnouncements() {
    return this.announcementModel.find().sort({ createdAt: -1 }).limit(20);
  }

  // ============================================================
  // SUPPORT TICKETS
  // ============================================================
  async getTickets(query: any) {
    const { page = 1, limit = 20, status, priority, institutionSlug } = query;
    const { skip } = paged(page, limit);
    const filter: any = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (institutionSlug) filter.institutionSlug = institutionSlug;
    const [data, total] = await Promise.all([
      this.ticketModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.ticketModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateTicket(id: string, data: any) {
    return this.ticketModel.findByIdAndUpdate(id, { $set: data }, { new: true });
  }

  async replyToTicket(id: string, message: string, by: string) {
    return this.ticketModel.findByIdAndUpdate(
      id,
      { $push: { replies: { message, by, at: new Date() } } },
      { new: true },
    );
  }

  // ============================================================
  // IMPERSONATION (Support Access)
  // ============================================================
  async generateImpersonationToken(slug: string, superAdminId: string): Promise<string> {
    // In production: generate a short-lived JWT with schoolSlug claim
    // Log the impersonation for audit
    const token = Buffer.from(JSON.stringify({
      slug, superAdminId, exp: Date.now() + 30 * 60 * 1000, // 30 min
    })).toString('base64');
    return token;
  }
}
