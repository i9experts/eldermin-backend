// ============================================================
// RESELLERS SERVICE — Eldermin Partner Network (Phase 1)
// Partner Directory (CRUD) + manual, Super-Admin-initiated
// provisioning of an institution under a reseller + a commission
// estimate (Phase 1 is a manual export, not a posted ledger —
// the automated Commission & Billing Engine is Phase 2).
// ============================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Reseller, ResellerDocument } from './schemas/reseller.schema';
import {
  CommissionPosting,
  CommissionPostingDocument,
} from './schemas/commission-posting.schema';
import {
  ProvisioningRequest,
  ProvisioningRequestDocument,
} from './schemas/provisioning-request.schema';
import {
  DealRegistration,
  DealRegistrationDocument,
} from './schemas/deal-registration.schema';
import {
  MdfClaim,
  MdfClaimDocument,
} from './schemas/mdf-claim.schema';
import {
  Institution,
  InstitutionDocument,
} from '../super-admin/schemas/super-admin.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { BankAccount, BankAccountDocument } from '../finance/schemas/finance.schema';
import { SuperAdminService } from '../super-admin/super-admin.service';
import { FinanceService } from '../finance/finance.service';
import { EmailService } from '../email/email.service';

// Eldermin's own internal ledger for the partner program — NOT any
// school's chart of accounts. See finance.service.ts seedCommissionAccounts.
export const PLATFORM_SCHOOL_SLUG = 'eldermin-platform';

// A partner is "proven" enough to skip manual review once they've cleared
// certification at a tier above the entry-level Certified Partner — the
// rollout plan's "auto-approve Gold/Platinum in-quota, manual review for
// new/Silver" mapped onto this program's three tiers.
const AUTO_APPROVE_TIERS = ['regional_partner', 'master_distributor'];

// Phase 3 — Regional Partner tier. Both MDF and branding are benefits of
// having actually reached this tier or above, not just Certified Partner —
// same tier list as AUTO_APPROVE_TIERS today, but kept as its own constant
// since the two are conceptually unrelated (this one's about earned
// commercial benefits, that one's about provisioning trust) and the plan
// could easily diverge them later (e.g. a probation period before MDF
// unlocks even at Regional Partner).
const PHASE3_TIERS = ['regional_partner', 'master_distributor'];

// Defaults from the Eldermin Partner Network plan (§02 Tiers & packages).
// Applied at creation time when the caller doesn't override them, so a
// reseller record always starts from the standard economics for its tier.
const TIER_DEFAULTS: Record<
  string,
  {
    track: string;
    commissionRateYear1: number;
    commissionRateRenewal: number;
    wholesaleDiscount: number;
    quotaInstitutions: number;
    quotaWindowMonths: number;
  }
> = {
  certified_partner: {
    track: 'A',
    commissionRateYear1: 20,
    commissionRateRenewal: 0,
    wholesaleDiscount: 0,
    quotaInstitutions: 0,
    quotaWindowMonths: 12,
  },
  regional_partner: {
    track: 'A',
    commissionRateYear1: 25,
    commissionRateRenewal: 8,
    wholesaleDiscount: 25,
    quotaInstitutions: 5,
    quotaWindowMonths: 12,
  },
  master_distributor: {
    track: 'B',
    commissionRateYear1: 0,
    commissionRateRenewal: 0,
    wholesaleDiscount: 40,
    quotaInstitutions: 20,
    quotaWindowMonths: 24,
  },
};

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

@Injectable()
export class ResellersService {
  constructor(
    @InjectModel(Reseller.name) private resellerModel: Model<ResellerDocument>,
    @InjectModel(Institution.name)
    private institutionModel: Model<InstitutionDocument>,
    @InjectModel(CommissionPosting.name)
    private commissionPostingModel: Model<CommissionPostingDocument>,
    @InjectModel(ProvisioningRequest.name)
    private provisioningRequestModel: Model<ProvisioningRequestDocument>,
    @InjectModel(DealRegistration.name)
    private dealRegistrationModel: Model<DealRegistrationDocument>,
    @InjectModel(MdfClaim.name) private mdfClaimModel: Model<MdfClaimDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(BankAccount.name) private bankAccountModel: Model<BankAccountDocument>,
    private superAdminService: SuperAdminService,
    private financeService: FinanceService,
    private emailService: EmailService,
  ) {}

  private generateSlug(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
        .substring(0, 50) || 'partner'
    );
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let counter = 1;
    while (await this.resellerModel.findOne({ slug })) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  // ── Partner Directory ─────────────────────────────────────
  async getResellers(query: any) {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      tier,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const { skip } = paged(page, limit);

    const filter: any = {};
    if (status) filter.status = status;
    if (tier) filter.tier = tier;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { territoryCountry: { $regex: search, $options: 'i' } },
        { territoryRegion: { $regex: search, $options: 'i' } },
        { 'primaryContact.email': { $regex: search, $options: 'i' } },
      ];
    }

    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [resellers, total] = await Promise.all([
      this.resellerModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.resellerModel.countDocuments(filter),
    ]);

    // Institution counts per reseller in one aggregate, rather than N+1
    // queries per row.
    const counts = await this.institutionModel.aggregate([
      { $match: { resellerId: { $in: resellers.map((r) => r._id) } } },
      {
        $group: {
          _id: '$resellerId',
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        },
      },
    ]);
    const countMap = new Map(counts.map((c: any) => [String(c._id), c]));

    const data = resellers.map((r) => ({
      ...r.toObject(),
      institutionsTotal: countMap.get(String(r._id))?.total || 0,
      institutionsActive: countMap.get(String(r._id))?.active || 0,
    }));

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async getResellerById(id: string) {
    const reseller = await this.resellerModel.findById(id);
    if (!reseller) throw new NotFoundException('Reseller not found');

    const institutions = await this.institutionModel
      .find({ resellerId: reseller._id })
      .select('name slug status plan monthlyRevenue createdAt city country')
      .sort({ createdAt: -1 });

    const activeCount = institutions.filter(
      (i) => i.status === 'active',
    ).length;
    const defaults = TIER_DEFAULTS[reseller.tier];
    const quotaWindowStart = new Date();
    quotaWindowStart.setMonth(
      quotaWindowStart.getMonth() -
        (reseller.quotaWindowMonths || defaults?.quotaWindowMonths || 12),
    );
    const withinWindow = institutions.filter(
      (i) => new Date((i as any).createdAt) >= quotaWindowStart,
    ).length;

    return {
      reseller,
      institutions,
      quota: {
        required: reseller.quotaInstitutions,
        windowMonths: reseller.quotaWindowMonths,
        liveWithinWindow: withinWindow,
        met:
          reseller.quotaInstitutions === 0 ||
          withinWindow >= reseller.quotaInstitutions,
      },
      summary: {
        institutionsTotal: institutions.length,
        institutionsActive: activeCount,
        monthlyRevenueAttributed: institutions.reduce(
          (a, i) => a + (i.monthlyRevenue || 0),
          0,
        ),
      },
    };
  }

  async createReseller(dto: any, createdBy: string) {
    const tier = dto.tier || 'certified_partner';
    const defaults = TIER_DEFAULTS[tier];
    if (!defaults) throw new BadRequestException(`Unknown tier: ${tier}`);

    const slug = await this.uniqueSlug(
      dto.slug ? this.generateSlug(dto.slug) : this.generateSlug(dto.name),
    );

    const reseller = new this.resellerModel({
      ...defaults,
      ...dto,
      tier,
      slug,
      status: 'pending',
    });
    await reseller.save();
    return reseller;
  }

  async updateReseller(id: string, dto: any) {
    const reseller = await this.resellerModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
    if (!reseller) throw new NotFoundException('Reseller not found');
    return reseller;
  }

  async updateResellerStatus(
    id: string,
    status: string,
    reason: string,
    updatedBy: string,
  ) {
    const reseller = await this.resellerModel.findById(id);
    if (!reseller) throw new NotFoundException('Reseller not found');

    const update: any = { status };
    if (status === 'active') {
      update.approvedBy = updatedBy;
      update.approvedAt = new Date();
    }
    if (status === 'suspended') {
      update.suspendedReason = reason;
      update.suspendedAt = new Date();
    }
    if (status === 'terminated') {
      update.terminatedReason = reason;
      update.terminatedAt = new Date();
    }

    await this.resellerModel.findByIdAndUpdate(id, { $set: update });
    return { message: `Reseller ${status}` };
  }

  // ── Provisioning (Phase 1: Super Admin creates on the partner's
  // behalf; self-serve provisioning is Phase 2's Reseller Portal) ──
  async provisionInstitution(resellerId: string, dto: any, createdBy: string) {
    const reseller = await this.resellerModel.findById(resellerId);
    if (!reseller) throw new NotFoundException('Reseller not found');
    if (reseller.status !== 'active') {
      throw new BadRequestException(
        'Reseller must be active before institutions can be provisioned under them',
      );
    }

    const institution = await this.superAdminService.createInstitution(
      { ...dto, resellerId: reseller._id, resellerName: reseller.name },
      createdBy,
    );
    return institution;
  }

  // ── Commission estimate (Phase 1: informational export, not a
  // posted ledger entry — see Phase 2, Commission & Billing Engine) ──
  async getCommissionSummary(resellerId: string) {
    const reseller = await this.resellerModel.findById(resellerId);
    if (!reseller) throw new NotFoundException('Reseller not found');

    const institutions = await this.institutionModel
      .find({ resellerId: reseller._id, status: 'active' })
      .select('name slug plan monthlyRevenue');

    const totalMonthlyRevenue = institutions.reduce(
      (a, i) => a + (i.monthlyRevenue || 0),
      0,
    );

    // Track A: Eldermin bills the school and owes the reseller a
    // commission on what was actually collected. Track B: the reseller
    // bills the school directly at their own retail price, so there is
    // no commission to pay — Eldermin's side is the wholesale invoice
    // to the reseller instead (Phase 2).
    const estimatedMonthlyCommission =
      reseller.track === 'A'
        ? Math.round(totalMonthlyRevenue * (reseller.commissionRateYear1 / 100))
        : 0;

    return {
      resellerId: reseller._id,
      resellerName: reseller.name,
      track: reseller.track,
      tier: reseller.tier,
      activeInstitutions: institutions.length,
      totalMonthlyRevenue,
      commissionRateApplied:
        reseller.track === 'A'
          ? reseller.commissionRateYear1
          : reseller.wholesaleDiscount,
      estimatedMonthlyCommission,
      note:
        reseller.track === 'A'
          ? 'Estimate only (Phase 1) — paid on revenue actually collected, with a 90-day clawback on churn/refund. Not yet posted to the Chart of Accounts.'
          : 'Track B reseller — no commission payable; Eldermin invoices this partner wholesale instead (Phase 2).',
      institutions,
    };
  }

  // ── Commission & Billing Engine (Phase 2) ─────────────────
  // Ledger postings must never block the batch run itself — see hr.service
  // safePostJournal for the identical precedent. Unlike that fire-and-forget
  // wrapper though, a genuine failure here IS re-thrown: runCommissionBatch
  // needs to know which specific rows failed so they show up in failed[]
  // and can be retried (the idempotency key makes a retry safe), rather
  // than silently vanishing the way an HR ledger gap did before its fix.
  private async safePostCommissionJournal(
    dto: Parameters<FinanceService['postJournalEntry']>[1],
  ) {
    try {
      return await this.financeService.postJournalEntry(PLATFORM_SCHOOL_SLUG, dto);
    } catch (err: any) {
      if (err?.message?.includes('not found') && err?.message?.includes('Suspense')) {
        await this.financeService.seedDefaultCOA(PLATFORM_SCHOOL_SLUG);
        await this.financeService.seedCommissionAccounts(PLATFORM_SCHOOL_SLUG);
        return await this.financeService.postJournalEntry(PLATFORM_SCHOOL_SLUG, dto);
      }
      throw err;
    }
  }

  // Idempotent batch, mirroring processPayrollBatch's shape: a natural-key
  // dedupe check before doing anything (skipped[]), per-row error isolation
  // (failed[] never aborts the run), and a result that's safe to re-run —
  // a second run for the same period only posts rows that weren't posted
  // (or weren't payable) the first time.
  async runCommissionBatch(periodMonth?: string, postedBy = 'System') {
    const period = periodMonth || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('periodMonth must be in YYYY-MM format');
    }

    const resellers = await this.resellerModel.find({ status: 'active' });
    const succeeded: any[] = [];
    const skipped: any[] = [];
    const failed: any[] = [];

    for (const reseller of resellers) {
      const institutions = await this.institutionModel.find({
        resellerId: reseller._id,
        status: 'active',
      });

      for (const inst of institutions) {
        const revenue = inst.monthlyRevenue || 0;
        const rate = reseller.track === 'A' ? reseller.commissionRateYear1 : reseller.wholesaleDiscount;
        const amount = Math.round(revenue * (rate / 100) * 100) / 100;

        if (revenue <= 0 || amount <= 0) {
          skipped.push({ resellerId: reseller._id, institutionId: inst._id, reason: 'no revenue or 0% rate' });
          continue;
        }

        const already = await this.commissionPostingModel.findOne({
          resellerId: reseller._id,
          institutionId: inst._id,
          periodMonth: period,
        });
        if (already) {
          skipped.push({ resellerId: reseller._id, institutionId: inst._id, reason: 'already posted', postingId: already._id });
          continue;
        }

        try {
          const lines =
            reseller.track === 'A'
              ? [
                  { accountCode: '5700', debit: amount, partnerType: 'reseller', partnerId: String(reseller._id), partnerName: reseller.name },
                  { accountCode: '2600', credit: amount, partnerType: 'reseller', partnerId: String(reseller._id), partnerName: reseller.name },
                ]
              : [
                  { accountCode: '1600', debit: amount, partnerType: 'reseller', partnerId: String(reseller._id), partnerName: reseller.name },
                  { accountCode: '4300', credit: amount, partnerType: 'reseller', partnerId: String(reseller._id), partnerName: reseller.name },
                ];

          const entry = await this.safePostCommissionJournal({
            reference: `RESELLER-${reseller.track === 'A' ? 'COMM' : 'WHOLESALE'}-${reseller.slug}-${inst.slug}-${period}`,
            narration: `${reseller.track === 'A' ? 'Partner commission' : 'Wholesale receivable'} — ${inst.name} — ${period}`,
            sourceType: 'reseller_commission',
            sourceId: String(reseller._id),
            postedBy,
            lines,
          });

          const posting = await this.commissionPostingModel.create({
            resellerId: reseller._id,
            resellerName: reseller.name,
            institutionId: inst._id,
            institutionName: inst.name,
            periodMonth: period,
            track: reseller.track,
            revenueAmount: revenue,
            rateApplied: rate,
            amount,
            journalEntryId: entry._id,
            postedBy,
            postedAt: new Date(),
          });
          succeeded.push(posting);
        } catch (err: any) {
          failed.push({ resellerId: reseller._id, institutionId: inst._id, error: err?.message || 'Unknown error' });
        }
      }
    }

    return {
      periodMonth: period,
      succeeded: succeeded.length,
      skipped: skipped.length,
      failed: failed.length,
      details: { succeeded, skipped, failed },
    };
  }

  async getCommissionLedger(resellerId: string, query: any = {}) {
    const { page = 1, limit = 30 } = query;
    const { skip } = paged(page, limit);
    const filter: any = { resellerId };
    if (query.periodMonth) filter.periodMonth = query.periodMonth;

    const [data, total] = await Promise.all([
      this.commissionPostingModel.find(filter).sort({ periodMonth: -1, createdAt: -1 }).skip(skip).limit(limit),
      this.commissionPostingModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ── Self-serve provisioning (Phase 2 Provisioning Queue) ──
  async submitProvisioningRequest(resellerId: string, dto: any, requestedBy: string) {
    const reseller = await this.resellerModel.findById(resellerId);
    if (!reseller) throw new NotFoundException('Reseller not found');
    if (reseller.status !== 'active') {
      throw new BadRequestException('Your partner account must be active before requesting provisioning.');
    }
    if (!dto?.name?.trim()) throw new BadRequestException('Institution name is required.');

    const autoApprove = AUTO_APPROVE_TIERS.includes(reseller.tier) && reseller.certificationComplete;

    const request = await this.provisioningRequestModel.create({
      resellerId: reseller._id,
      resellerName: reseller.name,
      institution: {
        name: dto.name,
        city: dto.city,
        country: dto.country,
        plan: dto.plan || 'starter',
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
      },
      requestedBy,
      status: autoApprove ? 'approved' : 'pending_review',
      autoApproved: autoApprove,
    });

    if (autoApprove) {
      const institution = await this.superAdminService.createInstitution(
        { ...dto, resellerId: reseller._id, resellerName: reseller.name },
        requestedBy,
      );
      request.resultingInstitutionId = institution._id;
      request.reviewedBy = 'System (auto-approved — tier eligible)';
      request.reviewedAt = new Date();
      await request.save();
    }

    return request;
  }

  async getProvisioningQueue(query: any = {}) {
    const { page = 1, limit = 20, status, resellerId } = query;
    const { skip } = paged(page, limit);
    const filter: any = {};
    if (status) filter.status = status;
    if (resellerId) filter.resellerId = resellerId;

    const [data, total] = await Promise.all([
      this.provisioningRequestModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.provisioningRequestModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async reviewProvisioningRequest(id: string, decision: 'approved' | 'rejected', reviewedBy: string, reviewNote?: string) {
    const request = await this.provisioningRequestModel.findById(id);
    if (!request) throw new NotFoundException('Provisioning request not found');
    if (request.status !== 'pending_review') {
      throw new BadRequestException(`Request is already ${request.status}`);
    }

    if (decision === 'approved') {
      const reseller = await this.resellerModel.findById(request.resellerId);
      if (!reseller) throw new NotFoundException('Reseller not found');
      const institution = await this.superAdminService.createInstitution(
        { ...request.institution, resellerId: reseller._id, resellerName: reseller.name },
        reviewedBy,
      );
      request.resultingInstitutionId = institution._id;
    }

    request.status = decision;
    request.reviewedBy = reviewedBy;
    request.reviewedAt = new Date();
    request.reviewNote = reviewNote || '';
    await request.save();
    return request;
  }

  // ── Deal registration (Phase 2) ────────────────────────────
  async registerDeal(resellerId: string, dto: any) {
    const reseller = await this.resellerModel.findById(resellerId);
    if (!reseller) throw new NotFoundException('Reseller not found');
    if (reseller.status !== 'active') {
      throw new BadRequestException('Your partner account must be active before registering deals.');
    }
    if (!dto?.prospectName?.trim()) throw new BadRequestException('Prospect name is required.');

    const now = new Date();
    // Case-insensitive match on prospect name — a real conflict check
    // needs to catch "Springfield Grammar" vs "springfield grammar", not
    // just an exact string match.
    const conflict = await this.dealRegistrationModel.findOne({
      prospectName: { $regex: `^${dto.prospectName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      status: 'registered',
      protectionExpiresAt: { $gt: now },
      resellerId: { $ne: reseller._id },
    });
    if (conflict) {
      throw new BadRequestException(
        `This prospect is already registered by another partner (protected until ${conflict.protectionExpiresAt.toISOString().slice(0, 10)}).`,
      );
    }

    const protectionExpiresAt = new Date(now);
    protectionExpiresAt.setDate(protectionExpiresAt.getDate() + 90);

    return this.dealRegistrationModel.create({
      resellerId: reseller._id,
      resellerName: reseller.name,
      prospectName: dto.prospectName,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      city: dto.city,
      country: dto.country,
      estimatedInstitutionSize: dto.estimatedInstitutionSize,
      notes: dto.notes,
      registeredAt: now,
      protectionExpiresAt,
    });
  }

  async getDeals(query: any = {}) {
    const { page = 1, limit = 20, status, resellerId } = query;
    const { skip } = paged(page, limit);
    const filter: any = {};
    if (resellerId) filter.resellerId = resellerId;
    if (status) filter.status = status;

    const [rows, total] = await Promise.all([
      this.dealRegistrationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.dealRegistrationModel.countDocuments(filter),
    ]);

    // Lazily surface expiry rather than a cron — a deal past its window
    // is "expired" for display purposes the instant anyone looks at it,
    // with no background job required to keep that true.
    const now = new Date();
    const data = rows.map((r) => {
      const obj = r.toObject();
      if (obj.status === 'registered' && obj.protectionExpiresAt < now) obj.status = 'expired';
      return obj;
    });

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async convertDeal(id: string, institutionId: string, convertedBy: string) {
    const deal = await this.dealRegistrationModel.findById(id);
    if (!deal) throw new NotFoundException('Deal registration not found');
    if (deal.status !== 'registered') {
      throw new BadRequestException(`Deal is already ${deal.status}`);
    }

    const institution = await this.institutionModel.findById(institutionId);
    if (!institution) throw new NotFoundException('Institution not found');

    institution.resellerId = deal.resellerId as any;
    (institution as any).resellerName = deal.resellerName;
    await institution.save();

    deal.status = 'converted';
    deal.convertedInstitutionId = institution._id as any;
    deal.convertedAt = new Date();
    deal.reviewedBy = convertedBy;
    await deal.save();
    return deal;
  }

  async rejectDeal(id: string, reviewedBy: string, reviewNote?: string) {
    const deal = await this.dealRegistrationModel.findById(id);
    if (!deal) throw new NotFoundException('Deal registration not found');
    if (deal.status !== 'registered') {
      throw new BadRequestException(`Deal is already ${deal.status}`);
    }
    deal.status = 'rejected';
    deal.reviewedBy = reviewedBy;
    deal.reviewNote = reviewNote || '';
    await deal.save();
    return deal;
  }

  // ── Reseller Portal v1 — account provisioning ──────────────
  // Creates the login itself (Super Admin action from Partner Directory).
  // A temp password is generated server-side and never returned in the
  // response — instead the partner gets the exact same "set your own
  // password" email flow as forgotPassword, so no plaintext credential
  // ever has to be relayed by hand.
  async createPortalUser(resellerId: string, dto: { email: string; name?: string; role?: string }, createdBy: string) {
    const reseller = await this.resellerModel.findById(resellerId);
    if (!reseller) throw new NotFoundException('Reseller not found');
    if (!dto?.email?.trim()) throw new BadRequestException('Email is required.');

    const email = dto.email.toLowerCase().trim();
    const existing = await this.userModel.findOne({ email });
    if (existing) throw new BadRequestException('A user with this email already exists.');

    const role = dto.role === 'reseller_support' ? 'reseller_support' : 'reseller_admin';
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await this.userModel.create({
      email,
      passwordHash,
      primaryRole: role,
      resellerId: reseller._id,
      profile: dto.name ? { firstName: dto.name } : {},
      isActive: true,
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.userModel.findByIdAndUpdate(user._id, {
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // one week to claim the invite
    });

    const setPasswordUrl = `https://app.eldermin.com/reset-password?token=${rawToken}`;
    try {
      await this.emailService.sendEmail({
        to: email,
        subject: `You've been invited to the Eldermin Partner Portal — ${reseller.name}`,
        html: `
          <p>Hi${dto.name ? ` ${dto.name}` : ''},</p>
          <p>${createdBy} has created a Partner Portal login for <strong>${reseller.name}</strong> on Eldermin.</p>
          <p>Set your password to get started (link valid for 7 days):</p>
          <p><a href="${setPasswordUrl}">${setPasswordUrl}</a></p>
        `,
      });
    } catch {
      // Same convention as forgotPassword — an email delivery failure
      // must never block the account from existing; the Super Admin can
      // resend/relay the link manually if needed.
    }

    return { id: user._id, email: user.email, role, resellerId: reseller._id };
  }

  async getPortalUsers(resellerId: string) {
    return this.userModel
      .find({ resellerId, primaryRole: { $in: ['reseller_admin', 'reseller_support'] } })
      .select('email profile primaryRole isActive lastLoginAt createdAt');
  }

  // ── Reseller Portal v1 — the partner's own dashboard ───────
  // Same shape as getResellerById, but resellerId is always the caller's
  // own (enforced by scope.util.resolveResellerScope at the controller),
  // never a path param they could point at another partner.
  async getPortalDashboard(resellerId: string) {
    return this.getResellerById(resellerId);
  }

  // ── Phase 3 — Regional Partner tier ─────────────────────────
  // Both MDF and branding are benefits of the *current* tier, not
  // something earned once and kept forever — a partner downgraded back to
  // Certified Partner loses eligibility immediately (checked live against
  // reseller.tier on every call), no separate "grandfathered" flag needed.
  private assertPhase3Eligible(reseller: any, benefit: string) {
    if (!PHASE3_TIERS.includes(reseller.tier)) {
      throw new BadRequestException(
        `${benefit} is a Regional Partner benefit — ${reseller.name} is currently a ${reseller.tier.replace('_', ' ')}.`,
      );
    }
  }

  // ── MDF budget ───────────────────────────────────────────────
  async setMdfBudget(resellerId: string, amount: number, fiscalYear: number) {
    const reseller = await this.resellerModel.findById(resellerId);
    if (!reseller) throw new NotFoundException('Reseller not found');
    this.assertPhase3Eligible(reseller, 'MDF (Marketing Development Fund)');
    if (amount < 0) throw new BadRequestException('MDF budget cannot be negative');
    reseller.mdfAllocatedAmount = amount;
    reseller.mdfFiscalYear = fiscalYear;
    await reseller.save();
    return reseller;
  }

  // Remaining is always derived from live claims, never stored — see the
  // schema comment on Reseller.mdfAllocatedAmount for why.
  async getMdfSummary(resellerId: string) {
    const reseller = await this.resellerModel.findById(resellerId);
    if (!reseller) throw new NotFoundException('Reseller not found');
    const fiscalYear = reseller.mdfFiscalYear || new Date().getFullYear();
    const claims = await this.mdfClaimModel.find({ resellerId, fiscalYear }).lean();
    const committed = claims
      .filter((c) => c.status === 'approved' || c.status === 'paid')
      .reduce((sum, c) => sum + (c.amountApproved ?? c.amountRequested ?? 0), 0);
    return {
      fiscalYear,
      allocated: reseller.mdfAllocatedAmount || 0,
      committed,
      remaining: Math.max(0, (reseller.mdfAllocatedAmount || 0) - committed),
      eligible: PHASE3_TIERS.includes(reseller.tier),
      claims,
    };
  }

  async submitMdfClaim(resellerId: string, dto: any, submittedBy: string) {
    const reseller = await this.resellerModel.findById(resellerId);
    if (!reseller) throw new NotFoundException('Reseller not found');
    if (reseller.status !== 'active') {
      throw new BadRequestException('Your partner account must be active to submit an MDF claim.');
    }
    this.assertPhase3Eligible(reseller, 'MDF (Marketing Development Fund)');
    if (!dto?.description?.trim()) throw new BadRequestException('Description is required.');
    const amountRequested = Number(dto.amountRequested);
    if (!amountRequested || amountRequested <= 0) throw new BadRequestException('amountRequested must be greater than 0.');

    const fiscalYear = reseller.mdfFiscalYear || new Date().getFullYear();
    const summary = await this.getMdfSummary(resellerId);
    if (amountRequested > summary.remaining) {
      throw new BadRequestException(
        `This claim (${amountRequested}) exceeds the remaining MDF budget (${summary.remaining} of ${summary.allocated} for ${fiscalYear}).`,
      );
    }

    return this.mdfClaimModel.create({
      resellerId: reseller._id,
      resellerName: reseller.name,
      fiscalYear,
      activityType: dto.activityType || 'other',
      description: dto.description,
      amountRequested,
      receiptUrl: dto.receiptUrl,
      submittedBy,
    });
  }

  async getMdfClaims(query: any = {}) {
    const { page = 1, limit = 20, status, resellerId } = query;
    const { skip } = paged(page, limit);
    const filter: any = {};
    if (status) filter.status = status;
    if (resellerId) filter.resellerId = resellerId;

    const [data, total] = await Promise.all([
      this.mdfClaimModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.mdfClaimModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async reviewMdfClaim(id: string, decision: 'approved' | 'rejected', reviewedBy: string, amountApproved?: number, reviewNote?: string) {
    const claim = await this.mdfClaimModel.findById(id);
    if (!claim) throw new NotFoundException('MDF claim not found');
    if (claim.status !== 'pending_review') throw new BadRequestException(`Claim is already ${claim.status}`);

    if (decision === 'approved') {
      const approved = amountApproved != null ? Number(amountApproved) : claim.amountRequested;
      if (approved <= 0 || approved > claim.amountRequested) {
        throw new BadRequestException('amountApproved must be greater than 0 and cannot exceed the requested amount.');
      }
      claim.amountApproved = approved;
    }
    claim.status = decision;
    claim.reviewedBy = reviewedBy;
    claim.reviewedAt = new Date();
    claim.reviewNote = reviewNote || '';
    await claim.save();
    return claim;
  }

  // Settles an approved MDF claim — Dr Marketing & Advertising (5400),
  // Cr Cash/Bank, under the same reserved platform ledger the Commission
  // Engine posts to (this is Eldermin's own marketing spend, not any
  // school's), following the exact recordVendorPayment-derived pattern
  // used for the Commission Engine and Payroll's payment action.
  async payMdfClaim(id: string, payment: { paymentMethod: string; bankAccountId?: string; referenceNumber?: string; paymentDate?: string }, paidBy: string) {
    const claim = await this.mdfClaimModel.findById(id);
    if (!claim) throw new NotFoundException('MDF claim not found');
    if (claim.status !== 'approved') throw new BadRequestException(`Only an approved claim can be paid — this one is ${claim.status}.`);
    if (!payment?.paymentMethod) throw new BadRequestException('paymentMethod is required.');
    if (payment.paymentMethod !== 'cash' && !payment.bankAccountId) {
      throw new BadRequestException('bankAccountId is required for a non-cash payment method.');
    }

    const amount = claim.amountApproved ?? claim.amountRequested;
    const paymentDate = payment.paymentDate ? new Date(payment.paymentDate) : new Date();
    let bankAccountName: string | undefined;
    if (payment.bankAccountId) {
      const bankAcc = await this.bankAccountModel.findOne({ _id: payment.bankAccountId, schoolSlug: PLATFORM_SCHOOL_SLUG }).lean();
      bankAccountName = bankAcc ? `${bankAcc.bankName} — ${bankAcc.accountTitle}` : undefined;
    }

    await this.financeService.postJournalEntry(PLATFORM_SCHOOL_SLUG, {
      date: paymentDate, reference: `MDF-${claim._id}`,
      narration: `MDF claim settled — ${claim.resellerName} — ${claim.description}`,
      sourceType: 'mdf_claim', sourceId: String(claim._id),
      lines: [
        { accountCode: '5400', debit: amount, partnerType: 'reseller', partnerId: String(claim.resellerId), partnerName: claim.resellerName },
        {
          accountCode: this.financeService.mapPaymentMethodToAccount(payment.paymentMethod), credit: amount,
          partnerType: 'reseller', partnerId: String(claim.resellerId), partnerName: claim.resellerName,
          bankAccountId: payment.bankAccountId, bankAccountName,
        },
      ],
    });

    claim.status = 'paid';
    claim.paymentMethod = payment.paymentMethod;
    claim.bankAccountId = payment.bankAccountId || '';
    claim.bankAccountName = bankAccountName || '';
    claim.referenceNumber = payment.referenceNumber || '';
    claim.paidAt = paymentDate;
    claim.paidBy = paidBy;
    await claim.save();
    return claim;
  }

  // ── Branding (logo + accent colour) ─────────────────────────
  // Super-Admin-side setter (moderation/override capability) — the
  // partner's own self-serve equivalent is getOwnBranding/updateOwnBranding
  // below, called from the Reseller Portal with resellerId pre-scoped by
  // resolveResellerScope at the controller.
  async setBranding(resellerId: string, dto: { logoUrl?: string; accentColor?: string }) {
    const reseller = await this.resellerModel.findById(resellerId);
    if (!reseller) throw new NotFoundException('Reseller not found');
    this.assertPhase3Eligible(reseller, 'Custom branding');
    reseller.branding = { logoUrl: dto.logoUrl, accentColor: dto.accentColor } as any;
    await reseller.save();
    return reseller;
  }

  async getOwnBranding(resellerId: string) {
    const reseller = await this.resellerModel.findById(resellerId).lean();
    if (!reseller) throw new NotFoundException('Reseller not found');
    return { eligible: PHASE3_TIERS.includes(reseller.tier), branding: reseller.branding || {} };
  }

  async updateOwnBranding(resellerId: string, dto: { logoUrl?: string; accentColor?: string }) {
    return this.setBranding(resellerId, dto);
  }
}
