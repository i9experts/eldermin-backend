import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Policy, PolicyDocument,
  PolicyAcknowledgement, PolicyAcknowledgementDocument,
  SafeguardingCase, SafeguardingCaseDocument,
  AuditLog, AuditLogDocument,
  Accreditation, AccreditationDocument,
  ApprovalRequest, ApprovalRequestDocument,
  ConsentRecord, ConsentRecordDocument,
  RetentionPolicy, RetentionPolicyDocument,
  DataSubjectRequest, DataSubjectRequestDocument,
} from './schemas/compliance.schema';
import { UploadService } from '../upload/upload.service';
import { buildInclusiveCampusFilter, resolveCampusScope, ScopedUser } from '../auth/scope.util';
import { computeDsarDueDate } from './data-privacy.util';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

@Injectable()
export class ComplianceService {
  constructor(
    @InjectModel(Policy.name) private policyModel: Model<PolicyDocument>,
    @InjectModel(PolicyAcknowledgement.name) private ackModel: Model<PolicyAcknowledgementDocument>,
    @InjectModel(SafeguardingCase.name) private safeguardingModel: Model<SafeguardingCaseDocument>,
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
    @InjectModel(Accreditation.name) private accreditationModel: Model<AccreditationDocument>,
    @InjectModel(ApprovalRequest.name) private approvalModel: Model<ApprovalRequestDocument>,
    @InjectModel(ConsentRecord.name) private consentModel: Model<ConsentRecordDocument>,
    @InjectModel(RetentionPolicy.name) private retentionModel: Model<RetentionPolicyDocument>,
    @InjectModel(DataSubjectRequest.name) private dsarModel: Model<DataSubjectRequestDocument>,
    private uploadService: UploadService,
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

  async getPolicies(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, category, status, search, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (category) filter.category = category;
    if (status) filter.status = status;
    const campusFilter = requestingUser ? buildInclusiveCampusFilter(requestingUser, campusId) : (campusId ? { campusId } : null);
    const searchOr = search ? [
      { title: { $regex: search, $options: 'i' } },
      { policyNumber: { $regex: search, $options: 'i' } },
    ] : null;
    if (campusFilter && searchOr) {
      filter.$and = [campusFilter, { $or: searchOr }];
    } else if (campusFilter) {
      Object.assign(filter, campusFilter);
    } else if (searchOr) {
      filter.$or = searchOr;
    }
    const [data, total] = await Promise.all([
      this.policyModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.policyModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async createPolicy(data: any, requestingUser?: ScopedUser) {
    const policy = new this.policyModel({
      ...data,
      effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : undefined,
      reviewDate: data.reviewDate ? new Date(data.reviewDate) : undefined,
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
    });
    return policy.save();
  }

  async updatePolicy(id: string, schoolSlug: string, data: any) {
    return this.policyModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
  }

  async acknowledgePolicy(policyId: string, schoolSlug: string, staffId: string, staffName: string, requestingUser?: ScopedUser) {
    const existing = await this.ackModel.findOne({ policyId, staffId, schoolSlug });
    if (existing) return existing;

    const policy = await this.policyModel.findById(policyId);
    const ack = new this.ackModel({
      policyId, schoolSlug, staffId, staffName,
      policyTitle: policy?.title || '',
      acknowledgedAt: new Date(),
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : null,
    });
    await ack.save();
    await this.policyModel.findByIdAndUpdate(policyId, { $inc: { acknowledgedCount: 1 } });
    return ack;
  }

  async uploadPolicyFile(id: string, schoolSlug: string, file: Express.Multer.File) {
    const { url } = await this.uploadService.uploadFile(file, 'policy-documents', schoolSlug);
    const policy = await this.policyModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { fileUrl: url } }, { new: true },
    );
    if (!policy) throw new NotFoundException('Policy not found');
    return { fileUrl: url };
  }

  async getPolicyAcknowledgements(policyId: string, schoolSlug: string) {
    return this.ackModel.find({ policyId, schoolSlug }).sort({ acknowledgedAt: -1 }).lean();
  }

  // ── Approval Requests ────────────────────────────────────────
  async getApprovals(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, category, status, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (category) filter.category = category;
    if (status) filter.status = status;
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    const [data, total] = await Promise.all([
      this.approvalModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.approvalModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async createApproval(schoolSlug: string, requestedBy: string, dto: any, requestingUser?: ScopedUser) {
    // approvalChain comes in as a simple ordered list of approver names —
    // normalize into real stage objects rather than trusting the client to
    // send fully-formed ones.
    const approvalChain = (dto.approvalChain || []).map((stage: any, i: number) => ({
      order: i,
      approverName: typeof stage === 'string' ? stage : stage.approverName,
      approverRole: typeof stage === 'string' ? undefined : stage.approverRole,
      status: 'pending',
    }));
    const approval = new this.approvalModel({
      ...dto, schoolSlug, requestedBy, approvalChain,
      status: approvalChain.length > 0 ? 'pending' : dto.status || 'pending',
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (dto.campusId ? new Types.ObjectId(dto.campusId) : null),
    });
    return approval.save();
  }

  async updateApproval(id: string, schoolSlug: string, dto: any) {
    const approval = await this.approvalModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!approval) throw new NotFoundException('Approval request not found');
    return approval;
  }

  // Advances exactly one stage in the chain — the next pending stage in
  // order — recording the decision, then rolls the overall request status
  // up once every stage has a decision (rejected at any stage short-
  // circuits the whole request to rejected, matching how a real sequential
  // sign-off chain works).
  async decideApprovalStage(id: string, schoolSlug: string, decision: 'approved' | 'rejected', comments: string, decidedByName: string) {
    const approval = await this.approvalModel.findOne({ _id: id, schoolSlug });
    if (!approval) throw new NotFoundException('Approval request not found');
    if (approval.status !== 'pending' && approval.status !== 'on_hold') {
      throw new Error(`This request has already been ${approval.status}`);
    }

    const chain = approval.approvalChain || [];
    const nextStage = chain.find((s) => s.status === 'pending');
    if (nextStage) {
      nextStage.status = decision;
      nextStage.decidedAt = new Date();
      nextStage.comments = comments;
    }

    const anyRejected = chain.some((s) => s.status === 'rejected');
    const allDecided = chain.every((s) => s.status !== 'pending');

    if (anyRejected) {
      approval.status = 'rejected';
      approval.decidedBy = decidedByName;
      approval.decidedAt = new Date();
      approval.decisionNote = comments;
    } else if (allDecided || chain.length === 0) {
      approval.status = 'approved';
      approval.decidedBy = decidedByName;
      approval.decidedAt = new Date();
      approval.decisionNote = comments;
    }

    await approval.save();
    return approval;
  }

  async getSafeguardingCases(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, status, severity, type, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (type) filter.type = type;
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    const [data, total] = await Promise.all([
      this.safeguardingModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.safeguardingModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async createSafeguardingCase(data: any, requestingUser?: ScopedUser) {
    const sc = new this.safeguardingModel({
      ...data,
      reportedDate: new Date(data.reportedDate || Date.now()),
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
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

  // ── Data Privacy: Consent Records ────────────────────────────
  async getConsentRecords(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, subjectType, consentType, status, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (subjectType) filter.subjectType = subjectType;
    if (consentType) filter.consentType = consentType;
    if (status) filter.status = status;
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    const [data, total] = await Promise.all([
      this.consentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.consentModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async createConsentRecord(data: any, requestingUser?: ScopedUser) {
    const record = new this.consentModel({
      ...data,
      dateGranted: new Date(data.dateGranted || Date.now()),
      dateWithdrawn: data.dateWithdrawn ? new Date(data.dateWithdrawn) : undefined,
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
    });
    return record.save();
  }

  async updateConsentRecord(id: string, schoolSlug: string, data: any) {
    // Withdrawing consent should record when it happened, unless the
    // caller already supplied their own dateWithdrawn explicitly.
    if (data.status === 'withdrawn' && !data.dateWithdrawn) {
      data.dateWithdrawn = new Date();
    }
    const record = await this.consentModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!record) throw new NotFoundException('Consent record not found');
    return record;
  }

  async deleteConsentRecord(id: string, schoolSlug: string) {
    const result = await this.consentModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Consent record not found');
    return { deleted: true };
  }

  // ── Data Privacy: Retention Policies ─────────────────────────
  async getRetentionPolicies(schoolSlug: string, query: any = {}) {
    const filter: any = { schoolSlug };
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true' || query.isActive === true;
    return this.retentionModel.find(filter).sort({ category: 1 });
  }

  async createRetentionPolicy(data: any) {
    const policy = new this.retentionModel(data);
    return policy.save();
  }

  async updateRetentionPolicy(id: string, schoolSlug: string, data: any) {
    const policy = await this.retentionModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!policy) throw new NotFoundException('Retention policy not found');
    return policy;
  }

  async deleteRetentionPolicy(id: string, schoolSlug: string) {
    const result = await this.retentionModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Retention policy not found');
    return { deleted: true };
  }

  /**
   * Seeds a small set of sensible default retention categories for a
   * school's first-ever visit to this list - idempotent upsert-by-category
   * (like seedDefaultSubjectCategories/ProcurementSettingsService.seedDefaults),
   * so re-running it just refreshes the seeded copies rather than duplicating.
   * Periods reflect common real-world practice; safeguarding records get a
   * deliberately much longer period than ordinary academic/financial records
   * since child-protection data typically needs to be kept until well into
   * the child's adulthood.
   */
  async seedDefaultRetentionPolicies(schoolSlug: string) {
    const defaults = [
      { category: 'Student Academic Records', retentionValue: 7, retentionUnit: 'years', actionOnExpiry: 'archive', legalBasis: 'Kept until the student would turn 25, or 7 years after leaving, to support references and re-enrolment.', ownerRole: 'Registrar' },
      { category: 'Staff HR Files', retentionValue: 6, retentionUnit: 'years', actionOnExpiry: 'review', legalBasis: 'Standard employment-record retention after a staff member leaves, to cover reference and dispute-limitation periods.', ownerRole: 'HR Manager' },
      { category: 'Financial Records', retentionValue: 7, retentionUnit: 'years', actionOnExpiry: 'archive', legalBasis: 'Statutory minimum for tax and audit records in most jurisdictions.', ownerRole: 'Finance Manager' },
      { category: 'Safeguarding Case Records', retentionValue: 25, retentionUnit: 'years', actionOnExpiry: 'review', legalBasis: 'Child-protection records are kept far longer than routine records - until the child turns 25, reflecting standard safeguarding retention guidance.', ownerRole: 'Designated Safeguarding Lead' },
      { category: 'Medical Records', retentionValue: 10, retentionUnit: 'years', actionOnExpiry: 'review', legalBasis: 'Kept until the student turns 25 (or longer for specific conditions) to support ongoing care and any future claims.', ownerRole: 'School Nurse / Health Officer' },
      { category: 'CCTV Footage', retentionValue: 30, retentionUnit: 'days', actionOnExpiry: 'delete', legalBasis: 'Short routine retention unless footage is flagged as evidence for an active incident or investigation.', ownerRole: 'Facilities / Security Manager' },
    ];
    const names: string[] = [];
    for (const d of defaults) {
      const result = await this.retentionModel.findOneAndUpdate(
        { schoolSlug, category: d.category },
        { $set: { ...d, schoolSlug, isActive: true } },
        { upsert: true, new: true },
      );
      names.push(result!.category);
    }
    return { message: `${defaults.length} default retention policies seeded`, count: defaults.length, names };
  }

  // ── Data Privacy: Data Subject Requests (DSAR) ───────────────
  async getDsarRequests(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, status, requestType, dataSubjectType, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (requestType) filter.requestType = requestType;
    if (dataSubjectType) filter.dataSubjectType = dataSubjectType;
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    const [data, total] = await Promise.all([
      this.dsarModel.find(filter).sort({ dueDate: 1 }).skip(skip).limit(limit),
      this.dsarModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async createDsarRequest(data: any, requestingUser?: ScopedUser) {
    const dateReceived = new Date(data.dateReceived || Date.now());
    const dsar = new this.dsarModel({
      ...data,
      dateReceived,
      dueDate: data.dueDate ? new Date(data.dueDate) : computeDsarDueDate(dateReceived),
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
    });
    return dsar.save();
  }

  async updateDsarRequest(id: string, schoolSlug: string, data: any) {
    if (data.dateReceived) data.dateReceived = new Date(data.dateReceived);
    if (data.dueDate) data.dueDate = new Date(data.dueDate);
    if ((data.status === 'completed' || data.status === 'rejected') && !data.completionDate) {
      data.completionDate = new Date();
    }
    const dsar = await this.dsarModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!dsar) throw new NotFoundException('Data subject request not found');
    return dsar;
  }

  async deleteDsarRequest(id: string, schoolSlug: string) {
    const result = await this.dsarModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Data subject request not found');
    return { deleted: true };
  }
}
