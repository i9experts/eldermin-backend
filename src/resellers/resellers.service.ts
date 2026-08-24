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
import { Reseller, ResellerDocument } from './schemas/reseller.schema';
import {
  Institution,
  InstitutionDocument,
} from '../super-admin/schemas/super-admin.schema';
import { SuperAdminService } from '../super-admin/super-admin.service';

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
    private superAdminService: SuperAdminService,
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
}
