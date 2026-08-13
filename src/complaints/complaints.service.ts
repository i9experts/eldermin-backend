import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ComplaintCaseType, ComplaintCaseTypeDocument,
  ComplaintCase, ComplaintCaseDocument,
} from './schemas/complaint.schema';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { EmailService } from '../email/email.service';
import { resolveCampusScope, ScopedUser } from '../auth/scope.util';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

@Injectable()
export class ComplaintsService {
  private logger = new Logger('ComplaintsService');

  constructor(
    @InjectModel(ComplaintCaseType.name) private caseTypeModel: Model<ComplaintCaseTypeDocument>,
    @InjectModel(ComplaintCase.name) private caseModel: Model<ComplaintCaseDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    private emailService: EmailService,
  ) {}

  // ── Case Types (setup) ──────────────────────────────────────
  async getCaseTypes(schoolSlug: string) {
    return this.caseTypeModel.find({ schoolSlug, isActive: true }).sort({ caseGroup: 1, name: 1 }).lean();
  }

  async createCaseType(schoolSlug: string, data: any) {
    return this.caseTypeModel.create({ ...data, schoolSlug });
  }

  async updateCaseType(id: string, schoolSlug: string, data: any) {
    const updated = await this.caseTypeModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!updated) throw new NotFoundException('Case type not found');
    return updated;
  }

  // ── Cases ────────────────────────────────────────────────────
  async createCase(schoolSlug: string, data: any, requestingUser?: ScopedUser) {
    let slaHours = data.slaHours || 48;
    let caseGroup = data.caseGroup, caseType = data.caseType;
    let defaultAssigneeDesignation: string | undefined;

    if (data.caseTypeId) {
      const type = await this.caseTypeModel.findById(data.caseTypeId).lean();
      if (type) {
        slaHours = (type as any).slaHours;
        caseGroup = (type as any).caseGroup;
        caseType = (type as any).name;
        defaultAssigneeDesignation = (type as any).defaultAssigneeDesignation;
      }
    }

    let assignedToName = data.assignedToName;
    const assignedDesignation = data.assignedDesignation || defaultAssigneeDesignation;
    if (data.assignedToId) {
      const staff = await this.staffModel.findById(data.assignedToId).lean();
      if (staff) assignedToName = `${(staff as any).firstName || ''} ${(staff as any).lastName || ''}`.trim();
    }

    const dueBy = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const complaintCase = new this.caseModel({
      caseTypeId: data.caseTypeId || null,
      caseGroup, caseType,
      title: data.title, description: data.description,
      raisedByType: data.raisedByType || 'parent',
      raisedByName: data.raisedByName, raisedByPhone: data.raisedByPhone, raisedByEmail: data.raisedByEmail,
      studentId: data.studentId || null, studentName: data.studentName,
      priority: data.priority || 'medium',
      assignedToId: data.assignedToId || null, assignedToName, assignedDesignation,
      status: 'open',
      slaHours, dueBy,
      schoolSlug,
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
    });
    await complaintCase.save();

    // Notify on assigning - real attempt, honestly logged.
    if (data.assignedToId) {
      const staff = await this.staffModel.findById(data.assignedToId).lean();
      if ((staff as any)?.email) {
        const sent = await this.emailService.sendEmail({
          to: (staff as any).email,
          subject: `New case assigned: ${complaintCase.caseNumber} — ${complaintCase.title}`,
          html: `<p>A new case has been assigned to you.</p><p><strong>${complaintCase.title}</strong></p><p>${complaintCase.description}</p><p>Priority: ${complaintCase.priority} | Due by: ${dueBy.toLocaleString()}</p>`,
        });
        complaintCase.notifiedAssignmentAt = new Date();
        complaintCase.notifiedAssignmentStatus = sent ? 'sent' : 'failed';
      } else {
        complaintCase.notifiedAssignmentStatus = 'no email on file for assignee';
      }
      await complaintCase.save();
    }

    return complaintCase;
  }

  async getCases(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, status, priority, caseGroup, assignedToId, overdue, campusId: requestedCampusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (caseGroup) filter.caseGroup = caseGroup;
    if (assignedToId) filter.assignedToId = new Types.ObjectId(assignedToId);
    if (overdue === 'true') { filter.status = { $ne: 'closed' }; filter.dueBy = { $lt: new Date() }; }
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, requestedCampusId) : requestedCampusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;

    const [data, total] = await Promise.all([
      this.caseModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.caseModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getCaseById(id: string, schoolSlug: string) {
    const c = await this.caseModel.findOne({ _id: id, schoolSlug }).lean();
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  /** Case Ageing - how long each open case has been sitting, matching EDAP's own "Case Ageing" report. */
  async getAgingReport(schoolSlug: string, requestingUser?: ScopedUser) {
    const filter: any = { schoolSlug, status: { $ne: 'closed' } };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, undefined) : undefined;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;

    const cases = await this.caseModel.find(filter).lean();
    const now = Date.now();
    const buckets = { '0-1_days': 0, '1-3_days': 0, '3-7_days': 0, '7+_days': 0 };
    let overdueCount = 0;
    for (const c of cases as any[]) {
      const ageDays = (now - new Date((c as any).createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays <= 1) buckets['0-1_days']++;
      else if (ageDays <= 3) buckets['1-3_days']++;
      else if (ageDays <= 7) buckets['3-7_days']++;
      else buckets['7+_days']++;
      if (new Date(c.dueBy).getTime() < now) overdueCount++;
    }
    return { totalOpen: cases.length, overdueCount, buckets };
  }

  // ── Case actions ─────────────────────────────────────────────
  async addRemark(id: string, schoolSlug: string, text: string, addedBy: string) {
    const c = await this.caseModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $push: { remarks: { text, addedBy, addedAt: new Date() } }, $set: { status: 'in_process' } },
      { new: true },
    );
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  async reassignCase(id: string, schoolSlug: string, newAssigneeId: string, reassignedBy: string, reason?: string) {
    const c = await this.caseModel.findOne({ _id: id, schoolSlug });
    if (!c) throw new NotFoundException('Case not found');
    const staff = await this.staffModel.findById(newAssigneeId).lean();
    if (!staff) throw new NotFoundException('New assignee not found');
    const newName = `${(staff as any).firstName || ''} ${(staff as any).lastName || ''}`.trim();

    c.reassignments.push({ fromName: c.assignedToName, toName: newName, reassignedBy, reassignedAt: new Date(), reason } as any);
    c.assignedToId = new Types.ObjectId(newAssigneeId);
    c.assignedToName = newName;
    await c.save();

    if ((staff as any).email) {
      await this.emailService.sendEmail({
        to: (staff as any).email,
        subject: `Case reassigned to you: ${c.caseNumber} — ${c.title}`,
        html: `<p>Case <strong>${c.caseNumber}</strong> (${c.title}) has been reassigned to you${reason ? ` — reason: ${reason}` : ''}.</p>`,
      });
    }
    return c;
  }

  async closeCase(id: string, schoolSlug: string, resolutionNotes: string, closedBy: string) {
    const c = await this.caseModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'closed', closedAt: new Date(), closedBy, resolutionNotes } },
      { new: true },
    );
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  async reopenCase(id: string, schoolSlug: string) {
    const c = await this.caseModel.findOneAndUpdate(
      { _id: id, schoolSlug, status: 'closed' },
      { $set: { status: 'in_process' }, $unset: { closedAt: '', closedBy: '' } },
      { new: true },
    );
    if (!c) throw new NotFoundException('Case not found or not closed');
    return c;
  }

  /**
   * Hourly automated escalation pass, mirroring the same @Cron pattern
   * as the fee defaulter reminder engine - matches EDAP's "Escalation
   * within (Days, Hours, Minutes)" with well-defined durations per case
   * type.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runEscalations() {
    const overdueCases = await this.caseModel.find({ status: { $ne: 'closed' }, dueBy: { $lt: new Date() } });
    let escalated = 0;

    for (const c of overdueCases) {
      const type = c.caseTypeId ? await this.caseTypeModel.findById(c.caseTypeId).lean() : null;
      const ladder = (type as any)?.escalationLevels || [];
      const nextLevel = ladder[c.currentEscalationLevel];
      if (!nextLevel) continue; // no further escalation configured

      const hoursSinceRaised = (Date.now() - new Date((c as any).createdAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceRaised < nextLevel.afterHours) continue; // not due for this level yet

      const notificationStatus = nextLevel.notifyName
        ? 'escalation logged (no email lookup configured for this level)'
        : 'no notify target configured';

      c.currentEscalationLevel += 1;
      c.escalations.push({
        level: c.currentEscalationLevel, escalatedAt: new Date(),
        notifiedName: nextLevel.notifyName, notificationStatus,
      } as any);
      await c.save();
      escalated++;
    }

    this.logger.log(`Case escalation run: ${escalated} case(s) escalated.`);
    return { escalated };
  }
}
