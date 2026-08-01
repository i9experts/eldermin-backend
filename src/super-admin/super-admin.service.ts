// ============================================================
// SUPER ADMIN SERVICE — Eldermin SaaS Platform
// NestJS + MongoDB
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import {
  Institution, InstitutionDocument, SUBSCRIPTION_PLANS,
  SubscriptionHistory, SubscriptionHistoryDocument,
  UsageLog, UsageLogDocument,
  Announcement, AnnouncementDocument,
  SupportTicket, SupportTicketDocument,
} from './schemas/super-admin.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { Tenant, TenantDocument } from '../modules/organization/schemas/tenant.schema';
import { MarketingLead } from '../leads/schemas/lead.schema';
import { Campus, Grade, AcademicYear } from '../organization/schemas/organization.schema';
import { ModulesService } from '../modules/modules.service';

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
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel('OrgInstitution') private orgInstitutionModel: Model<any>,
    @InjectModel('School') private schoolModel: Model<any>,
    @InjectModel(MarketingLead.name) private leadModel: Model<MarketingLead>,
    @InjectModel(Campus.name) private campusModel: Model<any>,
    @InjectModel(Grade.name) private gradeModel: Model<any>,
    @InjectModel(AcademicYear.name) private academicYearModel: Model<any>,
    private modulesService: ModulesService,
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

  async updateInstitution(slug: string, data: any) {
    const inst = await this.institutionModel.findOneAndUpdate(
      { slug },
      { $set: data },
      { new: true },
    );
    if (!inst) throw new NotFoundException('Institution not found');
    return inst;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 50);
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base || 'school';
    let counter = 1;
    while (await this.tenantModel.findOne({ slug })) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  private generateTempPassword(): string {
    // Human-typeable temp password: Word + 4 digits (e.g. "Welcome4821") —
    // meant to be communicated once and changed on first real login.
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `Welcome${digits}!`;
  }

  // The marketing site's wizard sends human-readable module names
  // ("Human Resource", "Curriculum Intelligence"), but the real
  // authorization checks (activeModules array, module-registry ids)
  // use short internal keys. Map one to the other here.
  private readonly MODULE_NAME_TO_ID: Record<string, string> = {
    'Organization': 'organization',
    'Compliance & Governance': 'compliance',
    'Documents & Workflow': 'documents',
    'Human Resource': 'hr',
    'Teacher Module': 'teaching',
    'Financial Module': 'finance',
    'Procurement & Purchase': 'procurement',
    'Campus Operations': 'campus-ops',
    'Admission Life Cycle': 'admissions',
    'Curriculum Intelligence': 'curriculum',
    'Syllabus Coverage': 'syllabus',
    'Timetable Intelligence': 'timetable',
    'Library Management': 'library',
    'Student Profile': 'students',
    'Assessment': 'assessment',
    'Behaviour & Tarbiyah': 'behaviour',
    'Data Intelligence': 'analytics',
  };

  private mapRequestedModulesToIds(requested: string[]): string[] {
    return requested
      .map((name) => this.MODULE_NAME_TO_ID[name])
      .filter((id): id is string => !!id);
  }

  // Maps free-text school-type strings (e.g. from the marketing site's
  // wizard: "Nursery/Primary", "Secondary/O-Level") to the org Institution
  // schema's strict enum (school/college/university/training_center/
  // madrasa/other), since a mismatch throws a Mongoose validation error.
  private normalizeInstitutionType(raw?: string): string {
    const allowed = ['school', 'college', 'university', 'training_center', 'madrasa', 'other'];
    const v = (raw || '').toLowerCase();
    if (allowed.includes(v)) return v;
    if (v.includes('madrasa')) return 'madrasa';
    if (v.includes('college')) return 'college';
    if (v.includes('university') || v.includes('higher')) return 'university';
    return 'school';
  }

  // ============================================================
  // ACTIVATE INSTITUTION FROM A WON CRM LEAD
  // Provisions a REAL, usable account (Tenant + org Institution +
  // School tenant record + admin User) — not just a billing/tracking
  // row. Reuses the same document shape the self-service onboarding
  // flow (OnboardingService.register) creates, so an activated lead
  // ends up completely indistinguishable from a self-signed-up school.
  // ============================================================
  async activateInstitutionFromLead(leadId: string, activatedBy: string) {
    const lead = await this.leadModel.findById(leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.convertedInstitutionId) {
      throw new BadRequestException('This lead has already been activated');
    }

    const existingUser = await this.userModel.findOne({ email: lead.adminEmail.toLowerCase() });
    if (existingUser) throw new BadRequestException('An account with this admin email already exists');

    const slug = await this.uniqueSlug(this.generateSlug(lead.schoolName));
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const [firstName, ...rest] = (lead.adminName || 'School Admin').split(' ');
    const lastName = rest.join(' ') || '—';

    // IMPORTANT: login reads activeModules from the Tenant document, but
    // ModulesService.bulkActivate() (the same one the self-service wizard's
    // module-selection step calls) only updates the School document. These
    // two can drift apart if not kept in sync explicitly — set both here
    // from the same merged list so a fresh login immediately has access to
    // every module the lead actually asked for, not just 'organization'.
    const requestedModules = this.mapRequestedModulesToIds(
      Array.isArray(lead.modulesRequested) ? lead.modulesRequested : [],
    );
    const mergedModules = Array.from(new Set(['organization', ...requestedModules]));

    const tenant = await this.tenantModel.create({
      slug,
      displayName: lead.schoolName,
      status: 'onboarding',
      plan: 'trial',
      activeModules: mergedModules,
      billingEmail: lead.adminEmail.toLowerCase(),
      isSetupComplete: false,
    });

    const orgInstitution = await this.orgInstitutionModel.create({
      tenantId: tenant._id,
      name: lead.schoolName,
      type: this.normalizeInstitutionType(lead.schoolType),
      currency: 'PKR',
      isActive: true,
    });

    await this.schoolModel.findOneAndUpdate(
      { slug },
      { $setOnInsert: { slug, name: lead.schoolName, activeModules: mergedModules } },
      { upsert: true, new: true },
    );

    // Real Campus, standard Grades+Sections, and a default Academic Year -
    // previously nothing here created any of these, which is the exact
    // root cause traced this session for every "no matching data" issue
    // (Fee Structure -> student matching, Classes & Sections being empty,
    // the header's academic year defaulting to a stale hardcoded value).
    // A school activated with none of this existing had no way to use
    // Fee Structure, Fee Assignment, or challan generation at all until
    // someone manually built it all by hand in Institution Setup first.
    const mainCampus = await this.campusModel.create({
      name: 'Main Campus',
      code: 'MAIN',
      address: lead.city ? `${lead.city}, ${lead.country || 'Pakistan'}` : (lead.country || ''),
      isActive: true,
      schoolSlug: slug,
    });

    const defaultGrades = [
      'Pre-Nursery', 'Nursery', 'KG-1', 'KG-2',
      'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
      'Grade 6', 'Grade 7', 'Grade 8',
      'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
    ];
    await this.gradeModel.bulkWrite(
      defaultGrades.map((name, i) => ({
        updateOne: {
          filter: { name, schoolSlug: slug },
          update: {
            $setOnInsert: {
              name, displayOrder: i + 1, schoolSlug: slug, isActive: true, sections: [],
              campusId: String(mainCampus._id),
            },
          },
          upsert: true,
        },
      })),
    );

    // Default academic year - name/dates are a reasonable starting point
    // (today through +1 year), not a guess at the school's real term
    // dates. The school can - and should - correct this immediately under
    // Institution Setup -> Academic Years; this just ensures one exists
    // so nothing silently breaks on day one.
    const now2 = new Date();
    const yearEnd = new Date(now2);
    yearEnd.setFullYear(yearEnd.getFullYear() + 1);
    yearEnd.setDate(yearEnd.getDate() - 1);
    await this.academicYearModel.create({
      name: `${now2.getFullYear()}-${String(now2.getFullYear() + 1).slice(-2)}`,
      startDate: now2,
      endDate: yearEnd,
      isCurrent: true,
      schoolSlug: slug,
    });

    const user = await this.userModel.create({
      tenantId: tenant._id,
      institutionId: orgInstitution._id,
      email: lead.adminEmail.toLowerCase(),
      passwordHash,
      profile: { firstName, lastName },
      primaryRole: 'institution_owner',
      isActive: true,
    });

    // Super Admin's own tracking/billing record — separate from the real
    // tenant above, used for MRR/health-score/subscription reporting.
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const trackingInstitution = new this.institutionModel({
      name: lead.schoolName,
      slug,
      city: lead.city,
      country: lead.country || 'Pakistan',
      primaryContact: { name: lead.adminName, email: lead.adminEmail, phone: lead.adminPhone },
      status: 'trial',
      plan: 'free_trial',
      trialStartDate: now,
      trialEndDate,
      enabledModules: mergedModules,
      onboardingStep: 0,
      healthScore: 0,
    });
    await trackingInstitution.save();

    await new this.subHistoryModel({
      institutionSlug: slug,
      institutionName: lead.schoolName,
      event: 'trial_started',
      toPlan: 'free_trial',
      amount: 0,
      paymentStatus: 'free',
      processedBy: activatedBy,
      effectiveDate: now,
    }).save();

    lead.stage = 'converted';
    lead.convertedInstitutionId = trackingInstitution._id as any;
    await lead.save();

    return {
      message: 'Institution activated',
      slug,
      schoolName: lead.schoolName,
      adminEmail: lead.adminEmail,
      tempPassword,
      loginUrl: 'https://app.eldermin.com/login',
      institution: trackingInstitution,
    };
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
