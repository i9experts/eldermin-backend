// ============================================================
// SUPER ADMIN SERVICE — Eldermin SaaS Platform
// NestJS + MongoDB
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
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
import { ParentLead, ParentLeadDocument, gradeBand } from '../leads/schemas/parent-lead.schema';
import { Campus, Grade, AcademicYear } from '../organization/schemas/organization.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { ModulesService } from '../modules/modules.service';
import { modulesForPlan, getModuleById, MODULE_REGISTRY } from '../modules/module-registry';
import { computeClassSectionRepair } from '../common/utils/class-section-repair.util';

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
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(ParentLead.name) private parentLeadModel: Model<ParentLeadDocument>,
    private modulesService: ModulesService,
    private jwtService: JwtService,
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
    const { page = 1, limit = 20, search, status, plan, city, churnRisk, resellerId, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const { skip } = paged(page, limit);

    const filter: any = {};
    if (status) filter.status = status;
    if (plan) filter.plan = plan;
    if (city) filter.city = { $regex: city, $options: 'i' };
    if (churnRisk === 'true') filter.isAtChurnRisk = true;
    if (resellerId) filter.resellerId = resellerId;
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

    // The original onboarding wizard submission, when this institution was
    // activated from a CRM lead (activateInstitutionFromLead sets the
    // lead's own convertedInstitutionId to this institution's _id) - so
    // Super Admin can see everything a school originally requested/signed
    // for, not just its live usage numbers. null for an institution
    // created directly (Add Institution) with no originating lead.
    const onboardingLead = await this.leadModel.findOne({ convertedInstitutionId: inst._id }).lean();

    return { institution: inst, subHistory, usageTrend, onboardingLead };
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

  // The marketing site's wizard collects planRequested as free text
  // ("Starter", "growth plan", etc.) rather than the normalized
  // SchoolPlan enum - normalize it here, defaulting to 'starter' for
  // anything unrecognized rather than silently granting everything.
  private normalizePlanRequested(raw?: string): 'starter' | 'growth' | 'enterprise' {
    const v = (raw || '').toLowerCase();
    if (v.includes('enterprise')) return 'enterprise';
    if (v.includes('growth') || v.includes('professional')) return 'growth';
    return 'starter';
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
  async activateInstitutionFromLead(leadId: string, activatedBy: string, moduleIdsOverride?: string[]) {
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
    //
    // The Super Admin now reviews and confirms the exact module set before
    // every activation (CRMTab's activation modal, pre-checked from the
    // lead's own modulesRequested) - moduleIdsOverride carries that final,
    // human-approved list. When present, it REPLACES the plan-wins union
    // below entirely, same "Super Admin's explicit list is authoritative,
    // no silent widening" trust model as ModulesService.setActiveModules.
    // Unknown ids are rejected; missing dependencies are NOT blocked here
    // (same precedent as setActiveModules) - the frontend picker already
    // has the full registry (including requiredModules) to warn about
    // that before submitting, so this stays a dumb, trustworthy write.
    //
    // When no override is supplied (e.g. any other/legacy caller of this
    // endpoint), fall back to the previous behaviour unchanged: the lead's
    // requested package (Starter/Growth/Enterprise) decides the module
    // set, with modulesRequested unioned in for CRM display / in case a
    // sales rep promised something outside the normal package.
    const normalizedPlan = this.normalizePlanRequested((lead as any).planRequested);
    const requestedModules = this.mapRequestedModulesToIds(
      Array.isArray(lead.modulesRequested) ? lead.modulesRequested : [],
    );
    let mergedModules: string[];
    if (Array.isArray(moduleIdsOverride)) {
      const unknown = moduleIdsOverride.filter((id) => !getModuleById(id));
      if (unknown.length > 0) {
        throw new BadRequestException(`Unknown module id(s): ${unknown.join(', ')}`);
      }
      mergedModules = Array.from(new Set(['organization', ...moduleIdsOverride]));
    } else {
      mergedModules = Array.from(
        new Set(['organization', ...modulesForPlan(normalizedPlan), ...requestedModules]),
      );
    }

    const tenant = await this.tenantModel.create({
      slug,
      displayName: lead.schoolName,
      status: 'onboarding',
      plan: normalizedPlan,
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

    // Wire the suspend action to Tenant.status (S0 finding 4): login already refuses a
    // suspended Tenant (auth.service.ts login), but nothing ever wrote it. ONLY this
    // existing action does it: 'suspended' -> Tenant 'suspended'; 'active' lifts a
    // suspension (never touches a trial/onboarding tenant). Existing tokens stay valid
    // until S3. FLAGGED for owner confirmation (S1_REPORT.md).
    if (status === 'suspended') {
      await this.tenantModel.updateOne({ slug }, { $set: { status: 'suspended' } });
    } else if (status === 'active') {
      await this.tenantModel.updateOne({ slug, status: 'suspended' }, { $set: { status: 'active' } });
    }

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

    // Real module access now comes from the plan itself (ModulesService.
    // setActiveModules below, which keeps School/Tenant/Institution in
    // lockstep via syncAcrossCollections) - enabledModules here is no
    // longer written directly, since setActiveModules already updates
    // this same Institution document's enabledModules as part of that sync.
    const update: any = {
      plan: data.plan,
      status: 'active',
      monthlyRevenue,
      subscriptionStartDate: new Date(data.startDate || Date.now()),
      subscriptionEndDate: new Date(data.endDate),
      autoRenew: data.autoRenew || false,
      billingCycle: data.billingCycle || 'monthly',
    };

    await this.institutionModel.findOneAndUpdate({ slug }, { $set: update });

    // Changing a school's package used to have zero effect on what
    // modules it could actually use (this institution tracking row and
    // the school's real activeModules were entirely separate writes).
    // Reset to the new plan's module set by default so the two never
    // drift again on a plan change; pass resetModules: false to change
    // billing only and leave Super Admin's prior manual module overrides
    // (set via setActiveModules) in place.
    if (data.resetModules !== false) {
      await this.modulesService.setActiveModules(slug, modulesForPlan(data.plan), updatedBy);
    }

    const newPrice = SUBSCRIPTION_PLANS[data.plan as keyof typeof SUBSCRIPTION_PLANS]?.price || 0;
    const oldPrice = SUBSCRIPTION_PLANS[inst.plan as keyof typeof SUBSCRIPTION_PLANS]?.price || 0;
    const event = inst.plan === 'free_trial' ? 'trial_converted'
      : newPrice > oldPrice ? 'upgrade'
      : newPrice < oldPrice ? 'downgrade'
      : 'renewal';

    await new this.subHistoryModel({
      institutionSlug: slug, institutionName: inst.name,
      event, fromPlan: inst.plan, toPlan: data.plan,
      amount: monthlyRevenue, paymentStatus: data.paymentStatus || 'paid',
      paymentMethod: data.paymentMethod, transactionId: data.transactionId,
      processedBy: updatedBy, effectiveDate: new Date(),
    }).save();

    return { message: 'Subscription updated' };
  }

  // ── Super Admin module control ("command center") ──────────
  // Direct per-module control over a school, independent of (and able to
  // override) its plan - the actual "full module control according to
  // school's package" surface. listModules already flags each module's
  // status relative to the school's plan (plan-locked vs available vs
  // active), reused here so Super Admin sees the exact same picture.
  async getSchoolModules(slug: string) {
    const inst = await this.institutionModel.findOne({ slug }).select('plan name').lean();
    if (!inst) throw new NotFoundException('Institution not found');
    const modules = await this.modulesService.listModules(slug);
    return { plan: (inst as any).plan, modules };
  }

  // Static module reference data for the lead-activation review modal -
  // no School exists yet at that point, so this is just MODULE_REGISTRY
  // as-is (id, name, category, requiredModules, pricingTier), plus which
  // module ids the lead's own modulesRequested resolve to is NOT included
  // here (that's lead-specific, read from GET institutions/leads/:id).
  getModuleRegistry() {
    return MODULE_REGISTRY;
  }

  // Resolves a lead's own modulesRequested (free-text labels from the
  // marketing site's wizard, e.g. "Compliance & Governance") to registry
  // ids - exposed separately so the activation-review modal can pre-check
  // exactly what the lead asked for before the Super Admin adjusts
  // anything, without duplicating MODULE_NAME_TO_ID client-side (those
  // labels don't match MODULE_REGISTRY's own display names 1:1, e.g.
  // "Human Resource" / "Teacher Module" / "Student Profile" vs. the
  // registry's "Staff & HR" / "Teaching Management" / "Student 360").
  async getRequestedModuleIds(leadId: string): Promise<string[]> {
    const lead = await this.leadModel.findById(leadId).select('modulesRequested').lean();
    if (!lead) throw new NotFoundException('Lead not found');
    return this.mapRequestedModulesToIds(
      Array.isArray((lead as any).modulesRequested) ? (lead as any).modulesRequested : [],
    );
  }

  async setSchoolModules(slug: string, moduleIds: string[], updatedBy: string) {
    const inst = await this.institutionModel.findOne({ slug });
    if (!inst) throw new NotFoundException('Institution not found');
    return this.modulesService.setActiveModules(slug, moduleIds, updatedBy);
  }

  async resetSchoolModulesToPlan(slug: string, updatedBy: string) {
    const inst = await this.institutionModel.findOne({ slug });
    if (!inst) throw new NotFoundException('Institution not found');
    return this.modulesService.resetModulesToPlan(slug, updatedBy);
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

  // Institution.usage (the Students/Staff counts shown on the
  // Institutions table and used by calcHealthScore) was a real schema
  // field that nothing ever actually wrote to - every institution sat
  // at its default (0) forever, even an Active, paying school that's
  // been in daily use for months. This is the sync that was missing:
  // counts the real per-tenant Student (keyed by schoolSlug) and Staff
  // (keyed by tenantId) collections and writes the result back onto
  // each institution's own usage snapshot. Runs nightly, and can also be
  // triggered on demand (see recalculateUsage in the controller) since
  // an admin shouldn't have to wait until 2am to see a number corrected
  // right after onboarding a school.
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async syncUsageSnapshots() {
    const institutions = await this.institutionModel.find().select('slug name').lean();
    if (institutions.length === 0) return { message: 'No institutions to sync', synced: 0, unmatched: [] };

    const slugs = institutions.map((i) => i.slug);
    const tenants = await this.tenantModel.find({ slug: { $in: slugs } }).select('slug').lean();
    const tenantIdBySlug = new Map(tenants.map((t) => [t.slug, t._id]));

    // Flags institutions whose slug matches no real Tenant AND has no real
    // Student records either - almost always means this platform_institutions
    // row's slug was hand-typed (e.g. via Create Institution) rather than
    // generated from/linked to the school's actual tenant, so there is
    // nothing real for this sync to ever find under that slug no matter
    // how many times it runs. Most common for a school onboarded before
    // this SaaS-tracking layer existed, or for a multi-campus group where
    // each campus got its own Super Admin row even though the real app
    // only has ONE tenant (with multiple Campus records inside it) for
    // the whole group - see activateInstitutionFromLead, which only ever
    // creates one Tenant per school, not one per campus.
    const unmatched: { slug: string; name: string }[] = [];

    const bulk = await Promise.all(institutions.map(async (inst) => {
      const tenantId = tenantIdBySlug.get(inst.slug);
      const [totalStudents, totalStaff] = await Promise.all([
        this.studentModel.countDocuments({ schoolSlug: inst.slug, status: 'active' }),
        tenantId ? this.staffModel.countDocuments({ tenantId, isActive: true }) : Promise.resolve(0),
      ]);
      if (!tenantId && totalStudents === 0) {
        unmatched.push({ slug: inst.slug, name: inst.name });
      }
      return {
        updateOne: {
          filter: { _id: inst._id },
          update: { $set: { 'usage.totalStudents': totalStudents, 'usage.totalStaff': totalStaff, 'usage.lastUpdated': new Date() } },
        },
      };
    }));

    await this.institutionModel.bulkWrite(bulk);
    return {
      message: unmatched.length > 0
        ? `Synced usage for ${institutions.length} institutions - ${unmatched.length} have no matching tenant/student records under their current slug`
        : `Synced usage for ${institutions.length} institutions`,
      synced: institutions.length,
      unmatched,
    };
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

      // Daily platform activity trend - grouped by a formatted YYYY-MM-DD
      // string, not the raw Date ($date serializes to a full ISO
      // timestamp over HTTP/JSON, which the frontend's chart x-axis
      // tickFormatter assumes is already YYYY-MM-DD and slices
      // accordingly - a raw Date here produced garbled tick labels).
      this.usageLogModel.aggregate([
        { $match: { date: { $gte: thirtyDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
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
  // Mints a REAL, 30-minute JWT - the exact same payload shape
  // AuthService.login() produces, so the institution's own app accepts it
  // through the normal AuthGuard('jwt')/JwtStrategy exactly like any other
  // login. The previous version returned a base64-encoded JSON blob that
  // no endpoint anywhere could ever verify or log in with - the "Support
  // Access" button was wired on the frontend to a backend action that
  // looked complete but could never actually produce a usable session.
  // Impersonates as the institution's own highest-privilege active user
  // (never platform-wide super-admin privileges leaking into their
  // tenant), so the super-admin sees exactly what that person sees.
  async generateImpersonationToken(slug: string, superAdminId: string) {
    const inst = await this.institutionModel.findOne({ slug });
    if (!inst) throw new NotFoundException('Institution not found');
    const tenant = await this.tenantModel.findOne({ slug });
    if (!tenant) throw new NotFoundException('This institution has no tenant record yet - it may not have completed setup.');

    const IMPERSONATABLE_ROLES = ['institution_owner', 'principal', 'admin'];
    let user: any = null;
    for (const role of IMPERSONATABLE_ROLES) {
      user = await this.userModel.findOne({ tenantId: tenant._id, primaryRole: role, isActive: { $ne: false } }).lean();
      if (user) break;
    }
    if (!user) throw new NotFoundException('No active owner/admin account found for this institution to impersonate as.');

    const name = `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim() || user.email;
    const payload = {
      sub: String(user._id),
      tv: Number.isInteger((user as any).tokenVersion) ? (user as any).tokenVersion : 0, // S3: the impersonated user's CURRENT version
      tenantId: String(tenant._id),
      institutionId: String(user.institutionId || tenant._id),
      role: user.primaryRole,
      name,
      schoolSlug: slug,
      activeModules: tenant.activeModules || [],
      // Marks this token as a support-impersonation session, distinct
      // from a genuine login - available to any future audit/log review
      // even though nothing currently branches on it at verification time.
      impersonatedBy: superAdminId,
    };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '30m' });

    return {
      accessToken,
      user: { id: String(user._id), name, email: user.email, role: user.primaryRole },
      institution: { name: inst.name, slug: inst.slug, plan: inst.plan, activeModules: tenant.activeModules || [] },
      message: 'Impersonation token valid for 30 minutes',
    };
  }

  // ============================================================
  // PARENT LEADS — self-serve SmartVan parent-app registrations,
  // including parents whose school isn't an Eldermin customer yet.
  // Built as real aggregation pipelines (group/bucket in Mongo), not
  // pulled-to-JS, since this is meant to scale to thousands of signups.
  // ============================================================

  private buildParentLeadMatch(query: any) {
    const match: any = {};
    if (query.country) match['location.country'] = query.country;
    if (query.city) match['location.city'] = query.city;
    if (query.district) match['location.district'] = query.district;
    if (query.schoolName) match.schoolNameRaw = new RegExp(query.schoolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (query.linked === 'true') match.matchedInstitutionId = { $ne: null };
    if (query.linked === 'false') match.matchedInstitutionId = null;
    if (query.grade) match['children.grade'] = query.grade;
    if (query.dateFrom || query.dateTo) {
      match.createdAt = {};
      if (query.dateFrom) match.createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) match.createdAt.$lte = new Date(query.dateTo);
    }
    return match;
  }

  async getParentLeads(query: any) {
    const match = this.buildParentLeadMatch(query);
    const { page = 1, limit = 25 } = query;
    const { skip, limit: lim } = paged(Number(page), Number(limit));

    // 'primary'/'secondary' is bucketed from children[].grade in application
    // code (gradeBand), not stored - filtering by band therefore needs an
    // initial fetch-and-filter pass rather than a pure $match. Still scoped
    // by every other filter first, so this only ever walks the already
    // narrowed-down set, never the whole collection.
    let docs = await this.parentLeadModel.find(match).sort({ createdAt: -1 }).lean();
    if (query.gradeBand === 'primary' || query.gradeBand === 'secondary') {
      docs = docs.filter((d: any) => (d.children || []).some((c: any) => gradeBand(c.grade) === query.gradeBand));
    }

    const total = docs.length;
    const page_ = docs.slice(skip, skip + lim);
    return {
      leads: page_.map((d: any) => ({
        id: d._id,
        fullName: d.fullName,
        email: d.email,
        phone: d.phone,
        schoolNameRaw: d.schoolNameRaw,
        isLinked: !!d.matchedInstitutionId,
        location: d.location,
        children: d.children,
        createdAt: d.createdAt,
      })),
      total,
      page: Number(page),
      limit: lim,
    };
  }

  async getParentLeadFilterOptions() {
    const [countries, cities, districts] = await Promise.all([
      this.parentLeadModel.distinct('location.country'),
      this.parentLeadModel.distinct('location.city'),
      this.parentLeadModel.distinct('location.district'),
    ]);
    return {
      countries: countries.filter(Boolean).sort(),
      cities: cities.filter(Boolean).sort(),
      districts: districts.filter(Boolean).sort(),
    };
  }

  /** Charts + the "top schools parents are waiting on" leaderboard for the
   * Super Admin Parent Leads tab. All real Mongo aggregations - this is
   * meant to scale to a large lead volume. */
  async getParentLeadInsights(query: any) {
    const match = this.buildParentLeadMatch(query);

    const [byLocation, trend, topUnlinkedSchools, totals] = await Promise.all([
      this.parentLeadModel.aggregate([
        { $match: match },
        { $group: { _id: { country: '$location.country', city: '$location.city' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 25 },
        { $project: { _id: 0, country: '$_id.country', city: '$_id.city', count: 1 } },
      ]),
      this.parentLeadModel.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, month: '$_id', count: 1 } },
      ]),
      this.parentLeadModel.aggregate([
        { $match: { ...match, matchedInstitutionId: null } },
        { $group: { _id: '$schoolNameRaw', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
        { $project: { _id: 0, schoolName: '$_id', count: 1 } },
      ]),
      this.parentLeadModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            linked: { $sum: { $cond: [{ $ne: ['$matchedInstitutionId', null] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const totalsRow = totals[0] || { total: 0, linked: 0 };
    return {
      totals: { total: totalsRow.total, linked: totalsRow.linked, unlinked: totalsRow.total - totalsRow.linked },
      byLocation,
      registrationTrend: trend,
      topUnlinkedSchools,
    };
  }

  // ============================================================
  // CLASS/SECTION DATA REPAIR — platform-wide variant. Runs the same
  // repair as OrganizationService.previewClassSectionRepair/
  // applyClassSectionRepair (see class-section-repair.util.ts), but
  // across every school at once, for the case where this drift isn't
  // isolated to one tenant.
  // ============================================================
  private async activeSchoolSlugs(): Promise<string[]> {
    const institutions = await this.institutionModel.find({ status: { $in: ['active', 'trial'] } }).select('slug').lean();
    return institutions.map((i: any) => i.slug).filter(Boolean);
  }

  private async repairOneSchool(schoolSlug: string, apply: boolean) {
    const [grades, students] = await Promise.all([
      this.gradeModel.find({ schoolSlug, isActive: true }).select('name sections').lean(),
      this.studentModel.find({ schoolSlug }).select('firstName lastName currentGrade currentSection').lean(),
    ]);
    if (grades.length === 0) return { schoolSlug, fixedCount: 0, unresolvedCount: 0 };
    const report = computeClassSectionRepair(
      grades.map((g: any) => ({ name: g.name, sections: g.sections })),
      students.map((s: any) => ({ id: String(s._id), name: `${s.firstName || ''} ${s.lastName || ''}`.trim(), currentGrade: s.currentGrade, currentSection: s.currentSection })),
    );
    if (apply && report.fixes.length > 0) {
      await this.studentModel.bulkWrite(report.fixes.map((f) => ({
        updateOne: {
          filter: { _id: f.studentId, schoolSlug },
          update: { $set: { ...(f.newGrade ? { currentGrade: f.newGrade } : {}), ...(f.newSection ? { currentSection: f.newSection } : {}) } },
        },
      })));
    }
    return { schoolSlug, fixedCount: report.fixes.length, unresolvedCount: report.unresolved.length };
  }

  async previewClassSectionRepairAllSchools() {
    const slugs = await this.activeSchoolSlugs();
    const results: Array<{ schoolSlug: string; fixedCount: number; unresolvedCount: number }> = [];
    for (const slug of slugs) results.push(await this.repairOneSchool(slug, false));
    return {
      schoolsChecked: results.length,
      schoolsWithFixes: results.filter((r) => r.fixedCount > 0).length,
      totalFixed: results.reduce((a, r) => a + r.fixedCount, 0),
      totalUnresolved: results.reduce((a, r) => a + r.unresolvedCount, 0),
      bySchool: results.filter((r) => r.fixedCount > 0 || r.unresolvedCount > 0),
    };
  }

  async applyClassSectionRepairAllSchools() {
    const slugs = await this.activeSchoolSlugs();
    const results: Array<{ schoolSlug: string; fixedCount: number; unresolvedCount: number }> = [];
    for (const slug of slugs) results.push(await this.repairOneSchool(slug, true));
    return {
      schoolsProcessed: results.length,
      totalFixed: results.reduce((a, r) => a + r.fixedCount, 0),
      totalUnresolved: results.reduce((a, r) => a + r.unresolvedCount, 0),
      bySchool: results.filter((r) => r.fixedCount > 0 || r.unresolvedCount > 0),
    };
  }
}
