import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Policy, PolicyDocument,
  PolicyAcknowledgement, PolicyAcknowledgementDocument,
  SafeguardingCase, SafeguardingCaseDocument,
  AuditLog, AuditLogDocument,
  Accreditation, AccreditationDocument,
} from './schemas/compliance.schema';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

@Injectable()
export class ComplianceService {
  constructor(
    @InjectModel(Policy.name) private policyModel: Model<PolicyDocument>,
    @InjectModel(PolicyAcknowledgement.name) private ackModel: Model<PolicyAcknowledgementDocument>,
    @InjectModel(SafeguardingCase.name) private safeguardingModel: Model<SafeguardingCaseDocument>,
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
    @InjectModel(Accreditation.name) private accreditationModel: Model<AccreditationDocument>,
  ) {}

  async getDashboard(schoolSlug: string) {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [
      totalPolicies, activePolicies, policiesExpiringSoon,
      pendingAcknowledgements, totalSafeguarding,
      openSafeguarding, criticalSafeguarding,
      recentAuditLogs, accreditations,
    ] = await Promise.all([
      this.policyModel.countDocuments({ schoolSlug }),
      this.policyModel.countDocuments({ schoolSlug, status: 'active' }),
      this.policyModel.countDocuments({
        schoolSlug, status: 'active',
        $or: [
          { reviewDate: { $lte: in30Days } },
          { expiryDate: { $lte: in30Days } },
        ],
      }),
      this.policyModel.aggregate([
        { $match: { schoolSlug, requiresAcknowledgement: true, status: 'active' } },
        { $group: { _id: null, pending: { $sum: { $subtract: ['$totalStaff', '$acknowledgedCount'] } } } },
      ]),
      this.safeguardingModel.countDocuments({ schoolSlug }),
      this.safeguardingModel.countDocuments({ schoolSlug, status: { $in: ['open', 'under_investigation'] } }),
      this.safeguardingModel.countDocuments({ schoolSlug, severity: 'critical', status: { $nin: ['resolved', 'closed'] } }),
      this.auditModel.find({ schoolSlug }).sort({ createdAt: -1 }).limit(10)
        .select('action module performedBy type createdAt resourceTitle'),
      this.accreditationModel.find({ schoolSlug }).sort({ createdAt: -1 }),
    ]);

    let score = 100;
    if (policiesExpiringSoon > 0) score -= 10;
    if (openSafeguarding > 0) score -= (openSafeguarding * 5);
    if (criticalSafeguarding > 0) score -= 20;
    const pendingAcks = pendingAcknowledgements[0]?.pending || 0;
    if (pendingAcks > 5) score -= 10;
    score = Math.max(0, Math.min(100, score));

    return {
      stats: {
        totalPolicies, activePolicies,
        policiesExpiringSoon, pendingAcknowledgements: pendingAcks,
        totalSafeguarding, openSafeguarding, criticalSafeguarding,
        complianceScore: score,
      },
      recentAuditLogs,
      accreditations,
    };
  }

  async getPolicies(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, category, status, search } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { policyNumber: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.policyModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.policyModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async createPolicy(data: any) {
    const policy = new this.policyModel({
      ...data,
      effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : undefined,
      reviewDate: data.reviewDate ? new Date(data.reviewDate) : undefined,
    });
    return policy.save();
  }

  async updatePolicy(id: string, schoolSlug: string, data: any) {
    return this.policyModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async acknowledgePolicy(policyId: string, schoolSlug: string, staffId: string, staffName: string) {
    const existing = await this.ackModel.findOne({ policyId, staffId, schoolSlug });
    if (existing) return existing;

    const policy = await this.policyModel.findById(policyId);
    const ack = new this.ackModel({
      policyId, schoolSlug, staffId, staffName,
      policyTitle: policy?.title || '',
      acknowledgedAt: new Date(),
    });
    await ack.save();
    await this.policyModel.findByIdAndUpdate(policyId, { $inc: { acknowledgedCount: 1 } });
    return ack;
  }

  async getSafeguardingCases(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, severity, type } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (type) filter.type = type;
    const [data, total] = await Promise.all([
      this.safeguardingModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.safeguardingModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async createSafeguardingCase(data: any) {
    const sc = new this.safeguardingModel({
      ...data,
      reportedDate: new Date(data.reportedDate || Date.now()),
    });
    return sc.save();
  }

  async updateSafeguardingCase(id: string, schoolSlug: string, data: any) {
    return this.safeguardingModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async addProgressNote(id: string, schoolSlug: string, note: string, addedBy: string) {
    return this.safeguardingModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $push: { progressNotes: { date: new Date(), note, addedBy } } },
      { new: true },
    );
  }

  async logAction(data: any) {
    const log = new this.auditModel(data);
    return log.save();
  }

  async getAuditLogs(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, module, type, from, to, performedBy } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (module) filter.module = module;
    if (type) filter.type = type;
    if (performedBy) filter.performedBy = { $regex: performedBy, $options: 'i' };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    const [data, total] = await Promise.all([
      this.auditModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.auditModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async getAccreditations(schoolSlug: string) {
    return this.accreditationModel.find({ schoolSlug }).sort({ createdAt: -1 });
  }

  async createAccreditation(data: any) {
    const acc = new this.accreditationModel(data);
    return acc.save();
  }

  async updateAccreditation(id: string, schoolSlug: string, data: any) {
    if (data.requirements) {
      const total = data.requirements.length;
      const done = data.requirements.filter((r: any) => r.status === 'completed').length;
      data.readinessPercentage = total > 0 ? Math.round((done / total) * 100) : 0;
    }
    return this.accreditationModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }
}
