import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CalendarEvent, CalendarEventDocument, CALENDAR_EVENT_COLORS } from './schemas/calendar-event.schema';
import { Circular, CircularDocument } from './schemas/circular.schema';
import { CircularAcknowledgment, CircularAcknowledgmentDocument } from './schemas/circular-acknowledgment.schema';
import { Invoice, InvoiceDocument } from '../finance/schemas/finance.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { Tenant, TenantDocument } from '../modules/organization/schemas/tenant.schema';
import { Notification, NotificationDocument } from '../parent-portal/schemas/notification-and-message.schema';
import { EmailService } from '../email/email.service';

interface AudienceRecipient { userId: string; name: string; email?: string; phone?: string }

@Injectable()
export class SchoolCalendarService {
  private logger = new Logger('SchoolCalendarService');

  constructor(
    @InjectModel(CalendarEvent.name) private eventModel: Model<CalendarEventDocument>,
    @InjectModel(Circular.name) private circularModel: Model<CircularDocument>,
    @InjectModel(CircularAcknowledgment.name) private ackModel: Model<CircularAcknowledgmentDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    private emailService: EmailService,
  ) {}

  // ─── Calendar ───────────────────────────────────────────────────────────

  async createEvent(schoolSlug: string, createdBy: string, data: any) {
    if (!data.title) throw new BadRequestException('title is required');
    if (!data.type) throw new BadRequestException('type is required');
    if (!data.startDate) throw new BadRequestException('startDate is required');
    return this.eventModel.create({
      ...data,
      endDate: data.endDate || data.startDate,
      schoolSlug,
      createdBy,
    });
  }

  async updateEvent(schoolSlug: string, id: string, data: any) {
    const updated = await this.eventModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true }).lean();
    if (!updated) throw new NotFoundException('Calendar event not found');
    return updated;
  }

  async deleteEvent(schoolSlug: string, id: string) {
    const deleted = await this.eventModel.findOneAndDelete({ _id: id, schoolSlug }).lean();
    if (!deleted) throw new NotFoundException('Calendar event not found');
    return { message: 'Deleted' };
  }

  // Merges manually-created entries with fee due dates computed live from
  // Finance (source:'finance') - never duplicated into calendar_events, so
  // this can't go stale against the real invoice records. Exam/term dates
  // from Academics are not wired yet (Phase 2, documented in the module's
  // README rather than silently missing).
  async getEvents(schoolSlug: string, query: { from?: string; to?: string; campusId?: string }) {
    const from = query.from ? new Date(query.from) : new Date(new Date().getFullYear(), 0, 1);
    const to = query.to ? new Date(query.to) : new Date(new Date().getFullYear(), 11, 31);

    const filter: any = { schoolSlug, startDate: { $lte: to }, endDate: { $gte: from } };
    const manual = await this.eventModel.find(filter).sort({ startDate: 1 }).lean();

    const invoiceFilter: any = { schoolSlug, dueDate: { $gte: from, $lte: to }, status: { $nin: ['paid', 'cancelled'] } };
    const invoices = await this.invoiceModel.find(invoiceFilter).select('dueDate totalAmount balanceDue').lean();
    const byDueDate = new Map<string, { count: number; total: number }>();
    for (const inv of invoices) {
      const key = new Date((inv as any).dueDate).toISOString().slice(0, 10);
      const existing = byDueDate.get(key) || { count: 0, total: 0 };
      existing.count += 1;
      existing.total += (inv as any).balanceDue ?? (inv as any).totalAmount ?? 0;
      byDueDate.set(key, existing);
    }
    const feeDueEvents = Array.from(byDueDate.entries()).map(([date, agg]) => ({
      _id: `fee-due-${date}`,
      title: `Fee Due (${agg.count} invoice${agg.count > 1 ? 's' : ''})`,
      description: `Total outstanding: ${agg.total.toFixed(2)}`,
      type: 'fee_due',
      color: CALENDAR_EVENT_COLORS.fee_due,
      startDate: date,
      endDate: date,
      allDay: true,
      campusId: null,
      gradeLevels: [],
      source: 'finance',
    }));

    return [
      ...manual.map((e) => ({ ...e, color: e.color || CALENDAR_EVENT_COLORS[e.type] || CALENDAR_EVENT_COLORS.other, source: 'manual' })),
      ...feeDueEvents,
    ].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  // ─── Circulars ──────────────────────────────────────────────────────────

  async createCircular(schoolSlug: string, createdBy: string, data: any) {
    if (!data.title) throw new BadRequestException('title is required');
    if (!data.body) throw new BadRequestException('body is required');
    if (!data.audience?.roles?.length) throw new BadRequestException('audience.roles must include at least one of parent, staff, student');
    return this.circularModel.create({ ...data, schoolSlug, createdBy, status: data.publishAt ? 'scheduled' : 'draft' });
  }

  async updateCircular(schoolSlug: string, id: string, data: any) {
    const circular = await this.circularModel.findOne({ _id: id, schoolSlug });
    if (!circular) throw new NotFoundException('Circular not found');
    if (circular.status === 'published') throw new BadRequestException('Cannot edit a circular that has already been published');
    Object.assign(circular, data);
    if (data.publishAt) circular.status = 'scheduled';
    await circular.save();
    return circular;
  }

  async deleteCircular(schoolSlug: string, id: string) {
    const circular = await this.circularModel.findOne({ _id: id, schoolSlug });
    if (!circular) throw new NotFoundException('Circular not found');
    if (circular.status === 'published') throw new BadRequestException('Cannot delete a published circular - it has already reached recipients');
    await circular.deleteOne();
    return { message: 'Deleted' };
  }

  async getCirculars(schoolSlug: string, query: { status?: string; category?: string; limit?: number }) {
    const filter: any = { schoolSlug };
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    return this.circularModel.find(filter).sort({ createdAt: -1 }).limit(query.limit || 100).lean();
  }

  async getCircularById(schoolSlug: string, id: string) {
    const circular = await this.circularModel.findOne({ _id: id, schoolSlug }).lean();
    if (!circular) throw new NotFoundException('Circular not found');
    return circular;
  }

  async publishCircular(schoolSlug: string, id: string) {
    const circular = await this.circularModel.findOne({ _id: id, schoolSlug });
    if (!circular) throw new NotFoundException('Circular not found');
    if (circular.status === 'published') throw new BadRequestException('Already published');

    const recipients = await this.resolveAudience(schoolSlug, circular.audience as any);
    if (recipients.length === 0) {
      throw new BadRequestException('No recipients matched this circular\'s audience - check the targeting before publishing');
    }

    await this.notificationModel.insertMany(recipients.map((r) => ({
      recipientUserId: new Types.ObjectId(r.userId),
      type: 'circular',
      title: circular.title,
      body: circular.body.replace(/<[^>]+>/g, ' ').trim().slice(0, 500),
      relatedEntityId: String(circular._id),
      schoolSlug,
    })));

    if (circular.priority === 'urgent') {
      await this.emailUrgentCircular(circular, recipients);
    }

    circular.status = 'published';
    circular.publishedAt = new Date();
    circular.recipientCount = recipients.length;
    await circular.save();
    return { message: 'Published', recipientCount: recipients.length };
  }

  // Sent as individual per-recipient emails, never one email with everyone
  // in "To" - a circular blast must not expose the whole recipient list to
  // every parent on it. Best-effort/batched: one bad address shouldn't
  // block the rest, and SES gets hit with limited concurrency.
  private async emailUrgentCircular(circular: CircularDocument, recipients: AudienceRecipient[]) {
    const withEmail = recipients.filter((r) => r.email);
    const BATCH = 10;
    for (let i = 0; i < withEmail.length; i += BATCH) {
      const batch = withEmail.slice(i, i + BATCH);
      await Promise.all(batch.map((r) =>
        this.emailService.sendEmail({
          to: r.email as string,
          subject: `[Urgent] ${circular.title}`,
          html: circular.body,
        }).catch((e) => this.logger.error(`Failed to email circular ${circular._id} to ${r.email}: ${e?.message}`)),
      ));
    }
  }

  // Fires every minute; publishes any circular whose scheduled time has
  // arrived - same "cron finds due work" shape as
  // AccountingIntegrationsService.autoSyncAll.
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledCirculars() {
    const due = await this.circularModel.find({ status: 'scheduled', publishAt: { $lte: new Date() } });
    for (const circular of due) {
      try {
        await this.publishCircular(circular.schoolSlug, String(circular._id));
      } catch (e: any) {
        this.logger.error(`Scheduled publish failed for circular ${circular._id}: ${e?.message}`);
      }
    }
  }

  async acknowledgeCircular(schoolSlug: string, circularId: string, userId: string, userName: string) {
    const circular = await this.circularModel.findOne({ _id: circularId, schoolSlug }).lean();
    if (!circular) throw new NotFoundException('Circular not found');
    return this.ackModel.findOneAndUpdate(
      { circularId: new Types.ObjectId(circularId), userId: new Types.ObjectId(userId) },
      { $set: { userName, acknowledgedAt: new Date(), schoolSlug } },
      { upsert: true, new: true },
    );
  }

  async getAcknowledgmentStatus(schoolSlug: string, circularId: string) {
    const circular = await this.circularModel.findOne({ _id: circularId, schoolSlug }).lean();
    if (!circular) throw new NotFoundException('Circular not found');
    if (!circular.requiresAcknowledgment) {
      return { requiresAcknowledgment: false, total: 0, acknowledged: 0, pending: [] };
    }
    const recipients = await this.resolveAudience(schoolSlug, circular.audience as any);
    const acks = await this.ackModel.find({ circularId: new Types.ObjectId(circularId) }).lean();
    const ackedIds = new Set(acks.map((a) => String(a.userId)));
    const pending = recipients.filter((r) => !ackedIds.has(r.userId));
    return {
      requiresAcknowledgment: true,
      total: recipients.length,
      acknowledged: recipients.length - pending.length,
      pending: pending.map((p) => ({ userId: p.userId, name: p.name })),
    };
  }

  // ─── Audience resolution ────────────────────────────────────────────────

  private async resolveAudience(schoolSlug: string, spec: {
    roles: string[]; scope: string; campusId?: string | null; gradeLevels?: string[]; userIds?: string[];
  }): Promise<AudienceRecipient[]> {
    const tenant = await this.tenantModel.findOne({ slug: schoolSlug }).lean();
    if (!tenant) throw new NotFoundException('School not found');

    const nameOf = (u: any) => `${u.profile?.firstName || ''} ${u.profile?.lastName || ''}`.trim() || u.email;

    if (spec.scope === 'individual') {
      const users = await this.userModel.find({ _id: { $in: (spec.userIds || []).map((id) => new Types.ObjectId(id)) }, tenantId: (tenant as any)._id }).lean();
      return users.map((u) => ({ userId: String(u._id), name: nameOf(u), email: u.email, phone: u.phone }));
    }

    const recipients = new Map<string, AudienceRecipient>();
    const roles = spec.roles || [];

    if (roles.includes('parent') || roles.includes('student')) {
      const studentFilter: any = { schoolSlug };
      if (spec.scope === 'campus' && spec.campusId) studentFilter.campusId = spec.campusId;
      if (spec.scope === 'grade' && spec.gradeLevels?.length) studentFilter.currentGrade = { $in: spec.gradeLevels };
      const students = await this.studentModel.find(studentFilter).select('_id').lean();
      const studentIds = students.map((s) => s._id);

      if (roles.includes('parent') && studentIds.length) {
        const parents = await this.userModel.find({
          tenantId: (tenant as any)._id, primaryRole: 'parent', guardianOfStudentIds: { $in: studentIds },
        }).lean();
        for (const p of parents) recipients.set(String(p._id), { userId: String(p._id), name: nameOf(p), email: p.email, phone: p.phone });
      }
      if (roles.includes('student') && studentIds.length) {
        const studentUsers = await this.userModel.find({
          tenantId: (tenant as any)._id, primaryRole: 'student', linkedStudentId: { $in: studentIds },
        }).lean();
        for (const s of studentUsers) recipients.set(String(s._id), { userId: String(s._id), name: nameOf(s), email: s.email, phone: s.phone });
      }
    }

    if (roles.includes('staff')) {
      const staffFilter: any = { tenantId: (tenant as any)._id };
      if (spec.scope === 'campus' && spec.campusId) staffFilter.campusId = new Types.ObjectId(spec.campusId);
      const staffDocs = await this.staffModel.find(staffFilter).select('userId').lean();
      const staffUserIds = staffDocs.map((s) => s.userId).filter(Boolean);
      if (staffUserIds.length) {
        const staffUsers = await this.userModel.find({ _id: { $in: staffUserIds } }).lean();
        for (const u of staffUsers) recipients.set(String(u._id), { userId: String(u._id), name: nameOf(u), email: u.email, phone: u.phone });
      }
    }

    return Array.from(recipients.values());
  }
}
