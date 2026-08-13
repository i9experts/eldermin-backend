import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PTMMeeting, PTMMeetingDocument } from './schemas/ptm-meeting.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Staff, StaffDocument } from '../hr/schemas/staff.schema';
import { EmailService } from '../../email/email.service';
import { resolveCampusScope, ScopedUser } from '../../auth/scope.util';

@Injectable()
export class PTMService {
  constructor(
    @InjectModel(PTMMeeting.name) private ptmModel: Model<PTMMeetingDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    private emailService: EmailService,
  ) {}

  private tid(t: string) { return t; }

  async createMeeting(tenantId: string, institutionId: string, data: any, requestedBy: string) {
    const [student, teacher] = await Promise.all([
      this.studentModel.findById(data.studentId).lean(),
      this.staffModel.findById(data.teacherId).lean(),
    ]);
    if (!student) throw new NotFoundException('Student not found');
    if (!teacher) throw new NotFoundException('Teacher not found');

    const primaryGuardian = (student as any).guardians?.find((g: any) => g.isPrimary) || (student as any).guardians?.[0];

    const meeting = new this.ptmModel({
      tenantId: this.tid(tenantId), institutionId,
      campusId: (student as any).campusId ? (() => { try { return new Types.ObjectId((student as any).campusId); } catch { return null; } })() : null,
      studentId: data.studentId,
      studentName: `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim(),
      gradeLevel: (student as any).currentGrade,
      sectionName: (student as any).currentSection,
      teacherId: data.teacherId,
      teacherName: `${(teacher as any).firstName || ''} ${(teacher as any).lastName || ''}`.trim(),
      scheduledDate: new Date(data.scheduledDate),
      startTime: data.startTime,
      endTime: data.endTime,
      guardianName: primaryGuardian?.name,
      guardianPhone: primaryGuardian?.phone,
      guardianEmail: primaryGuardian?.email,
      status: 'requested',
      academicYear: data.academicYear,
      discussionPoints: data.discussionPoints || [],
      requestedBy,
    });
    await meeting.save();

    // E-Alert - a real attempt, honestly logged.
    if (primaryGuardian?.email) {
      const sent = await this.emailService.sendEmail({
        to: primaryGuardian.email,
        subject: `Parent-Teacher Meeting Scheduled — ${meeting.studentName}`,
        html: `<p>Dear ${primaryGuardian.name || 'Parent/Guardian'},</p><p>A parent-teacher meeting has been scheduled for <strong>${meeting.studentName}</strong> with <strong>${meeting.teacherName}</strong> on <strong>${new Date(meeting.scheduledDate).toDateString()}</strong>${meeting.startTime ? ` at ${meeting.startTime}` : ''}.</p>${meeting.discussionPoints.length ? `<p>Discussion points:</p><ul>${meeting.discussionPoints.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}<p>Please confirm your attendance with the school office.</p>`,
      });
      meeting.notifiedAt = new Date();
      meeting.notificationStatus = sent ? 'sent' : 'failed';
    } else {
      meeting.notificationStatus = 'no email on file for this guardian';
    }
    await meeting.save();

    return meeting;
  }

  async getMeetings(tenantId: string, query: any, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.status) filter.status = query.status;
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (query.teacherId) filter.teacherId = new Types.ObjectId(query.teacherId);
    if (query.from || query.to) {
      filter.scheduledDate = {};
      if (query.from) filter.scheduledDate.$gte = new Date(query.from);
      if (query.to) filter.scheduledDate.$lte = new Date(query.to);
    }
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, query.campusId) : query.campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    return this.ptmModel.find(filter).sort({ scheduledDate: -1 }).limit(200).lean();
  }

  async getMeetingById(id: string, tenantId: string) {
    const meeting = await this.ptmModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  /** "Historical Data" - every past PTM for a student, oldest problems and progress visible together. */
  async getStudentHistory(studentId: string, tenantId: string) {
    return this.ptmModel
      .find({ tenantId: this.tid(tenantId), studentId: new Types.ObjectId(studentId) })
      .sort({ scheduledDate: -1 })
      .lean();
  }

  async confirmMeeting(id: string, tenantId: string) {
    const meeting = await this.ptmModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId), status: 'requested' },
      { $set: { status: 'confirmed' } }, { new: true },
    );
    if (!meeting) throw new NotFoundException('Meeting not found or not in a requested state');
    return meeting;
  }

  async reschedule(id: string, tenantId: string, data: { scheduledDate: string; startTime?: string; endTime?: string }) {
    const meeting = await this.ptmModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId), status: { $in: ['requested', 'confirmed'] } },
      { $set: { scheduledDate: new Date(data.scheduledDate), startTime: data.startTime, endTime: data.endTime, status: 'requested' } },
      { new: true },
    );
    if (!meeting) throw new NotFoundException('Meeting not found or already completed/cancelled');
    return meeting;
  }

  /** E-Management - record what actually happened once the meeting takes place. */
  async recordOutcome(id: string, tenantId: string, data: { meetingNotes?: string; actionItems?: any[]; parentAttended: boolean }) {
    const meeting = await this.ptmModel.findOne({ _id: id, tenantId: this.tid(tenantId) });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (meeting.status === 'cancelled') throw new BadRequestException('Cannot record an outcome for a cancelled meeting');

    meeting.status = data.parentAttended ? 'completed' : 'no_show';
    meeting.meetingNotes = data.meetingNotes || '';
    meeting.parentAttended = data.parentAttended;
    if (data.actionItems) {
      meeting.actionItems = data.actionItems.map((a: any) => ({
        description: a.description, assignedTo: a.assignedTo, dueDate: a.dueDate ? new Date(a.dueDate) : undefined, status: a.status || 'pending',
      })) as any;
    }
    await meeting.save();
    return meeting;
  }

  async updateActionItem(meetingId: string, actionItemId: string, tenantId: string, status: 'pending' | 'done') {
    const meeting = await this.ptmModel.findOne({ _id: meetingId, tenantId: this.tid(tenantId) });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const item = meeting.actionItems.find((a: any) => String(a._id) === actionItemId);
    if (!item) throw new NotFoundException('Action item not found');
    item.status = status;
    await meeting.save();
    return meeting;
  }

  async cancelMeeting(id: string, tenantId: string, reason: string, cancelledBy: string) {
    const meeting = await this.ptmModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: { status: 'cancelled', cancelledReason: reason, cancelledBy } }, { new: true },
    );
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  /** A teacher's own upcoming meetings - the personalized-scheduling view. */
  async getUpcomingForTeacher(teacherId: string, tenantId: string) {
    return this.ptmModel.find({
      tenantId: this.tid(tenantId), teacherId: new Types.ObjectId(teacherId),
      status: { $in: ['requested', 'confirmed'] }, scheduledDate: { $gte: new Date() },
    }).sort({ scheduledDate: 1 }).lean();
  }

  async getDashboardStats(tenantId: string) {
    const tid = this.tid(tenantId);
    const [upcoming, completed, noShow, actionItemsOpen] = await Promise.all([
      this.ptmModel.countDocuments({ tenantId: tid, status: { $in: ['requested', 'confirmed'] }, scheduledDate: { $gte: new Date() } }),
      this.ptmModel.countDocuments({ tenantId: tid, status: 'completed' }),
      this.ptmModel.countDocuments({ tenantId: tid, status: 'no_show' }),
      this.ptmModel.countDocuments({ tenantId: tid, 'actionItems.status': 'pending' }),
    ]);
    return { upcoming, completed, noShow, actionItemsOpen };
  }
}
