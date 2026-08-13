import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Invoice, InvoiceDocument,
} from './schemas/finance.schema';
import {
  DefaulterReminderLog, DefaulterReminderLogDocument,
  PaymentCommitment, PaymentCommitmentDocument,
  DefaulterPolicy, DefaulterPolicyDocument,
} from './schemas/defaulter.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Campus, CampusDocument } from '../organization/schemas/organization.schema';
import { Tenant, TenantDocument } from '../modules/organization/schemas/tenant.schema';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../email/whatsapp.service';
import { SmsService } from '../email/sms.service';
import { resolveCampusScope, ScopedUser } from '../auth/scope.util';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

type Severity = 'minor_concern' | 'concern' | 'major_concern' | null;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

@Injectable()
export class FeeDefaulterService {
  private logger = new Logger('FeeDefaulterService');

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(DefaulterReminderLog.name) private reminderLogModel: Model<DefaulterReminderLogDocument>,
    @InjectModel(PaymentCommitment.name) private commitmentModel: Model<PaymentCommitmentDocument>,
    @InjectModel(DefaulterPolicy.name) private policyModel: Model<DefaulterPolicyDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    private emailService: EmailService,
    private whatsAppService: WhatsAppService,
    private smsService: SmsService,
  ) {}

  // ── Policy ───────────────────────────────────────────────────
  async getPolicy(schoolSlug: string): Promise<DefaulterPolicyDocument> {
    let policy = await this.policyModel.findOne({ schoolSlug });
    if (!policy) {
      // Every school gets sane defaults the first time this is touched -
      // no separate "seed" step required, and every default mirrors the
      // schema's own @Prop defaults so this never drifts out of sync.
      policy = await this.policyModel.create({ schoolSlug });
    }
    return policy;
  }

  async updatePolicy(schoolSlug: string, data: Partial<DefaulterPolicy>) {
    return this.policyModel.findOneAndUpdate(
      { schoolSlug }, { $set: data }, { new: true, upsert: true },
    );
  }

  private severityFor(daysOverdue: number, policy: DefaulterPolicyDocument): Severity {
    if (daysOverdue <= 0) return null;
    if (daysOverdue >= policy.majorConcernDays) return 'major_concern';
    if (daysOverdue >= policy.concernDays) return 'concern';
    if (daysOverdue >= policy.minorConcernDays) return 'minor_concern';
    return null; // overdue but not yet crossed even the minor threshold
  }

  private agingBucketFor(daysOverdue: number, policy: DefaulterPolicyDocument): string {
    if (daysOverdue <= 0) return 'current';
    if (daysOverdue <= policy.agingBucket1Days) return '1-30';
    if (daysOverdue <= policy.agingBucket2Days) return '31-60';
    if (daysOverdue <= policy.agingBucket3Days) return '61-90';
    return '90+';
  }

  // ── Aging report — "Paid & Unpaid with Aging in one click" ─────
  async getAgingReport(schoolSlug: string, requestingUser?: ScopedUser) {
    const policy = await this.getPolicy(schoolSlug);
    const filter: any = { schoolSlug, isDeleted: { $ne: true }, balanceDue: { $gt: 0 } };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, undefined) : undefined;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;

    const invoices = await this.invoiceModel.find(filter).lean();
    const now = new Date();
    const buckets: Record<string, { count: number; total: number }> = {
      current: { count: 0, total: 0 },
      '1-30': { count: 0, total: 0 },
      '31-60': { count: 0, total: 0 },
      '61-90': { count: 0, total: 0 },
      '90+': { count: 0, total: 0 },
    };
    const severityCounts: Record<string, number> = { minor_concern: 0, concern: 0, major_concern: 0 };

    for (const inv of invoices as any[]) {
      const daysOverdue = inv.dueDate ? daysBetween(new Date(inv.dueDate), now) : 0;
      const bucket = this.agingBucketFor(daysOverdue, policy);
      buckets[bucket].count++;
      buckets[bucket].total += inv.balanceDue;
      const severity = this.severityFor(daysOverdue, policy);
      if (severity) severityCounts[severity]++;
    }

    return {
      asOf: now,
      totalOutstanding: invoices.reduce((a: number, i: any) => a + i.balanceDue, 0),
      totalInvoicesOutstanding: invoices.length,
      buckets,
      severityCounts,
    };
  }

  // ── Defaulters list — the per-student/invoice view behind the report ──
  async getDefaulters(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, severity, bucket, campusId: requestedCampusId } = query;
    const { skip } = paged(page, limit);
    const policy = await this.getPolicy(schoolSlug);

    const filter: any = { schoolSlug, isDeleted: { $ne: true }, balanceDue: { $gt: 0 }, dueDate: { $lt: new Date() } };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, requestedCampusId) : requestedCampusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;

    const invoices = await this.invoiceModel.find(filter).sort({ dueDate: 1 }).lean();
    const now = new Date();

    let enriched = (invoices as any[]).map((inv) => {
      const daysOverdue = daysBetween(new Date(inv.dueDate), now);
      return {
        ...inv,
        daysOverdue,
        agingBucket: this.agingBucketFor(daysOverdue, policy),
        severity: this.severityFor(daysOverdue, policy),
      };
    });

    if (severity) enriched = enriched.filter((i) => i.severity === severity);
    if (bucket) enriched = enriched.filter((i) => i.agingBucket === bucket);

    const total = enriched.length;
    const data = enriched.slice(skip, skip + limit);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ── Reminders ────────────────────────────────────────────────

  /** Manual, single-invoice reminder - a staff member clicked "Send Reminder". */
  async sendReminder(invoiceId: string, schoolSlug: string, channel: 'email' | 'sms' | 'whatsapp', sentBy: string) {
    const invoice = await this.invoiceModel.findOne({ _id: invoiceId, schoolSlug, isDeleted: { $ne: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.balanceDue <= 0) throw new BadRequestException('This invoice has no outstanding balance');

    const policy = await this.getPolicy(schoolSlug);
    const result = await this.deliverReminder(invoice, policy, channel, 'manual', sentBy);
    return result;
  }

  /** Bulk manual reminder across a filtered set of overdue invoices - "individually or in bulk", matching EDAP's own framing for defaulter actions. */
  async sendBulkReminders(schoolSlug: string, invoiceIds: string[], channel: 'email' | 'sms' | 'whatsapp', sentBy: string) {
    const policy = await this.getPolicy(schoolSlug);
    const invoices = await this.invoiceModel.find({
      _id: { $in: invoiceIds.map((id) => new Types.ObjectId(id)) },
      schoolSlug, isDeleted: { $ne: true }, balanceDue: { $gt: 0 },
    });
    const results: { invoiceId: string; channel: string; status: string; reason?: string }[] = [];
    for (const invoice of invoices) {
      results.push(await this.deliverReminder(invoice, policy, channel, 'manual', sentBy));
    }
    return { attempted: invoices.length, results };
  }

  /**
   * The actual send-and-log step, shared by manual and automated paths.
   * Every attempt is logged regardless of outcome - the audit trail is
   * honest about what actually happened (sent / failed / skipped), not
   * just what was requested.
   */
  private async deliverReminder(
    invoice: InvoiceDocument, policy: DefaulterPolicyDocument,
    channel: 'email' | 'sms' | 'whatsapp', trigger: 'automated' | 'manual', sentBy?: string,
  ) {
    const now = new Date();
    const daysOverdue = invoice.dueDate ? daysBetween(new Date(invoice.dueDate), now) : 0;
    const severity = this.severityFor(daysOverdue, policy) || 'minor_concern';

    let status: 'sent' | 'failed' | 'skipped' = 'skipped';
    let reason: string | undefined;

    try {
      if (channel === 'email') {
        const student = await this.studentModel.findById(invoice.studentId).lean();
        const guardianEmail = (student as any)?.guardians?.find((g: any) => g.email)?.email;
        if (!guardianEmail) {
          reason = 'No guardian email on file for this student';
        } else {
          const sent = await this.emailService.sendFeeReminder(
            guardianEmail,
            (student as any)?.guardians?.[0]?.name || 'Parent/Guardian',
            invoice.studentName, invoice.grade, invoice.balanceDue,
            invoice.dueDate ? new Date(invoice.dueDate).toDateString() : '',
            (student as any)?.schoolSlug || invoice.schoolSlug,
            invoice.invoiceNumber,
          );
          status = sent ? 'sent' : 'failed';
          if (!sent) reason = 'Email send failed (SES rejected or misconfigured)';
        }
      } else if (channel === 'whatsapp') {
        const student = await this.studentModel.findById(invoice.studentId).lean();
        const phone = (student as any)?.guardians?.find((g: any) => g.phone)?.phone;
        if (!phone) {
          reason = 'No guardian phone on file for this student';
        } else {
          const result = await this.whatsAppService.sendTemplateMessage(phone, 'fee_reminder', {
            studentName: invoice.studentName, amount: String(invoice.balanceDue), dueDate: invoice.dueDate ? new Date(invoice.dueDate).toDateString() : '',
          });
          status = result.sent ? 'sent' : 'failed';
          reason = result.reason;
        }
      } else if (channel === 'sms') {
        const student = await this.studentModel.findById(invoice.studentId).lean();
        const phone = (student as any)?.guardians?.find((g: any) => g.phone)?.phone;
        if (!phone) {
          reason = 'No guardian phone on file for this student';
        } else {
          const message = `${invoice.studentName}'s fee of PKR ${invoice.balanceDue.toLocaleString()} (Invoice ${invoice.invoiceNumber}) is overdue. Please pay at your earliest convenience.`;
          const result = await this.smsService.sendSms(phone, message);
          status = result.sent ? 'sent' : 'failed';
          reason = result.reason;
        }
      }
    } catch (err: any) {
      status = 'failed';
      reason = err.message;
    }

    await this.reminderLogModel.create({
      invoiceId: invoice._id,
      studentId: invoice.studentId,
      studentName: invoice.studentName,
      channel, status, reason,
      severityAtSendTime: severity,
      daysOverdueAtSendTime: daysOverdue,
      amountDue: invoice.balanceDue,
      trigger, sentBy,
      schoolSlug: invoice.schoolSlug,
      campusId: invoice.campusId,
    });

    return { invoiceId: String(invoice._id), channel, status, reason };
  }

  /**
   * Daily automated pass across every school - "free unlimited reminders",
   * but throttled per policy.reminderThrottleDays so the same invoice
   * doesn't get reminded every single day regardless of how long it's
   * been overdue.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runAutomatedReminders() {
    const tenants = await this.tenantModel.find({ status: { $ne: 'suspended' } }).select('slug').lean();
    let totalSent = 0, totalSkipped = 0, totalFailed = 0;

    for (const tenant of tenants) {
      const schoolSlug = (tenant as any).slug;
      const policy = await this.getPolicy(schoolSlug);
      if (!policy.automatedRemindersEnabled) continue;

      const overdueInvoices = await this.invoiceModel.find({
        schoolSlug, isDeleted: { $ne: true }, balanceDue: { $gt: 0 }, dueDate: { $lt: new Date() },
      });
      if (overdueInvoices.length === 0) continue;

      const throttleCutoff = new Date(Date.now() - policy.reminderThrottleDays * 24 * 60 * 60 * 1000);
      const recentlyReminded = await this.reminderLogModel.find({
        schoolSlug, status: 'sent', createdAt: { $gte: throttleCutoff },
      }).select('invoiceId').lean();
      const throttledInvoiceIds = new Set(recentlyReminded.map((r: any) => String(r.invoiceId)));

      for (const invoice of overdueInvoices) {
        if (throttledInvoiceIds.has(String(invoice._id))) { totalSkipped++; continue; }
        for (const channel of (policy.enabledChannels as ('email' | 'sms' | 'whatsapp')[])) {
          const result = await this.deliverReminder(invoice, policy, channel, 'automated');
          if (result.status === 'sent') totalSent++;
          else if (result.status === 'failed') totalFailed++;
          else totalSkipped++;
        }
      }
    }

    this.logger.log(`Automated defaulter reminders run: ${totalSent} sent, ${totalFailed} failed, ${totalSkipped} skipped/throttled.`);
    return { totalSent, totalFailed, totalSkipped };
  }

  // ── Penalties ────────────────────────────────────────────────

  /** Applies the school's configured penalty rule to a single overdue invoice, individually. */
  async applyPenalty(invoiceId: string, schoolSlug: string) {
    const invoice = await this.invoiceModel.findOne({ _id: invoiceId, schoolSlug, isDeleted: { $ne: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const policy = await this.getPolicy(schoolSlug);
    const daysOverdue = invoice.dueDate ? daysBetween(new Date(invoice.dueDate), new Date()) : 0;
    if (daysOverdue < policy.penaltyGraceDays) {
      throw new BadRequestException(`This invoice is only ${daysOverdue} day(s) overdue - the configured grace period is ${policy.penaltyGraceDays} days.`);
    }
    const penalty = policy.penaltyType === 'percentage'
      ? Math.round(invoice.balanceDue * (policy.penaltyAmount / 100))
      : policy.penaltyAmount;
    if (penalty <= 0) throw new BadRequestException('No penalty amount configured for this school. Set one in Defaulter Policy first.');

    return this.invoiceModel.findByIdAndUpdate(invoiceId, {
      $inc: { lateFine: penalty, totalAmount: penalty, balanceDue: penalty },
    }, { new: true });
  }

  /** Same rule, applied across many invoices at once - "individually or in bulk". */
  async applyBulkPenalty(invoiceIds: string[], schoolSlug: string) {
    const results: { invoiceId: string; applied: boolean; reason?: string }[] = [];
    for (const id of invoiceIds) {
      try {
        await this.applyPenalty(id, schoolSlug);
        results.push({ invoiceId: id, applied: true });
      } catch (err: any) {
        results.push({ invoiceId: id, applied: false, reason: err.message });
      }
    }
    return { attempted: invoiceIds.length, results };
  }

  // ── Payment Commitments (installment plans for chronic defaulters) ──

  async createCommitment(schoolSlug: string, data: any, createdBy: string) {
    const student = await this.studentModel.findById(data.studentId).lean();
    if (!student) throw new NotFoundException('Student not found');

    const totalAmount = (data.installments || []).reduce((a: number, i: any) => a + i.amount, 0);
    if (totalAmount <= 0) throw new BadRequestException('At least one installment with an amount is required');

    return this.commitmentModel.create({
      studentId: data.studentId,
      studentName: `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim(),
      invoiceIds: (data.invoiceIds || []).map((id: string) => new Types.ObjectId(id)),
      totalAmount,
      installments: (data.installments || []).map((i: any, idx: number) => ({
        installmentNumber: idx + 1, amount: i.amount, dueDate: new Date(i.dueDate), status: 'pending',
      })),
      notes: data.notes,
      createdBy,
      schoolSlug,
      campusId: (student as any).campusId ? (() => { try { return new Types.ObjectId((student as any).campusId); } catch { return null; } })() : null,
    });
  }

  async getCommitments(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, status, studentId, campusId: requestedCampusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, requestedCampusId) : requestedCampusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    const [data, total] = await Promise.all([
      this.commitmentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.commitmentModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async recordInstallmentPayment(commitmentId: string, installmentNumber: number, schoolSlug: string, paidAmount: number) {
    const commitment = await this.commitmentModel.findOne({ _id: commitmentId, schoolSlug });
    if (!commitment) throw new NotFoundException('Commitment not found');
    const installment = commitment.installments.find((i) => i.installmentNumber === installmentNumber);
    if (!installment) throw new NotFoundException('Installment not found');

    installment.status = 'paid';
    installment.paidDate = new Date();
    installment.paidAmount = paidAmount;

    const allPaid = commitment.installments.every((i) => i.status === 'paid');
    if (allPaid) commitment.status = 'completed';

    await commitment.save();
    return commitment;
  }

  async markInstallmentMissed(commitmentId: string, installmentNumber: number, schoolSlug: string) {
    const commitment = await this.commitmentModel.findOne({ _id: commitmentId, schoolSlug });
    if (!commitment) throw new NotFoundException('Commitment not found');
    const installment = commitment.installments.find((i) => i.installmentNumber === installmentNumber);
    if (!installment) throw new NotFoundException('Installment not found');
    installment.status = 'missed';
    await commitment.save();
    return commitment;
  }

  async breakCommitment(commitmentId: string, schoolSlug: string, reason: string) {
    const commitment = await this.commitmentModel.findOneAndUpdate(
      { _id: commitmentId, schoolSlug },
      { $set: { status: 'broken', brokenAt: new Date(), brokenReason: reason } },
      { new: true },
    );
    if (!commitment) throw new NotFoundException('Commitment not found');
    return commitment;
  }
}
