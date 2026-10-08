import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { Tenant, TenantDocument } from '../modules/organization/schemas/tenant.schema';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { Campus, CampusDocument } from '../organization/schemas/organization.schema';
import { TeacherProfile, TeacherProfileDocument } from '../modules/teaching/schemas/teacher-profile.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { StudentLeave, StudentLeaveDocument } from '../parent-portal/schemas/consent-and-leave.schema';
import {
  Notification, NotificationDocument,
  MessageThread, MessageThreadDocument,
  Message, MessageDocument,
} from '../parent-portal/schemas/notification-and-message.schema';
import { sameGrade, sameSection } from '../common/utils/class-match.util';
import { RolesService } from '../roles/roles.service';
import {
  StaffDeviceToken, StaffDeviceTokenDocument,
  StaffDeletionRequest, StaffDeletionRequestDocument,
} from './schemas/staff-portal.schema';
import { StaffNotifier } from './staff-notifier.service';
import {
  AccountDeleteRequestDto, CreateStaffThreadDto, RegisterDeviceTokenDto,
  ReviewStudentLeaveDto, SendThreadMessageDto,
} from './dto/staff-portal.dto';

/** The JWT payload attached by JwtStrategy. */
export interface PortalUser {
  userId: string;
  tenantId?: string;
  schoolSlug?: string;
  role?: string;
  name?: string;
  campusId?: string;
}

interface ClassRef { grade: string; section?: string }

const ADMIN_NOTIFY_ROLES = ['institution_owner', 'principal', 'admin', 'hr_manager'];

@Injectable()
export class StaffPortalService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(TeacherProfile.name) private profileModel: Model<TeacherProfileDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(StudentLeave.name) private studentLeaveModel: Model<StudentLeaveDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(MessageThread.name) private threadModel: Model<MessageThreadDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(StaffDeviceToken.name) private deviceTokenModel: Model<StaffDeviceTokenDocument>,
    @InjectModel(StaffDeletionRequest.name) private deletionModel: Model<StaffDeletionRequestDocument>,
    private rolesService: RolesService,
    private notifier: StaffNotifier,
  ) {}

  // ── Identity ────────────────────────────────────────────────

  private slugOf(user: PortalUser): string {
    if (!user.schoolSlug) throw new ForbiddenException('No school context on this account.');
    return user.schoolSlug;
  }

  /** Staff record linked to the logged-in user (Staff.userId). Always read from the DB, never trusted from the token, so a stale JWT can't act for a removed/changed staff member. */
  private async requireStaff(user: PortalUser): Promise<StaffDocument> {
    const staff = await this.staffModel.findOne({ userId: new Types.ObjectId(user.userId), isActive: { $ne: false } });
    if (!staff) throw new ForbiddenException('No staff profile is linked to this account.');
    return staff;
  }

  private async getProfile(staffId: Types.ObjectId) {
    return this.profileModel.findOne({ staffId }).lean();
  }

  /** Classes this staff member may act on: class-teacher assignment + current teaching assignments. */
  private classesOf(profile: any): ClassRef[] {
    const out: ClassRef[] = [];
    if (profile?.isClassTeacher && profile.classTeacherOfGradeName) {
      out.push({ grade: profile.classTeacherOfGradeName, section: profile.classTeacherOfSectionName || undefined });
    }
    for (const a of profile?.currentAssignments || []) {
      if (a?.gradeLevel) out.push({ grade: a.gradeLevel, section: a.sectionName || undefined });
    }
    return out;
  }

  private teachesStudent(classes: ClassRef[], student: any): boolean {
    return classes.some(
      (c) => sameGrade(c.grade, student.currentGrade)
        && (!c.section || sameSection(c.section, student.currentSection)),
    );
  }

  private async classTeacherClassOrThrow(staff: StaffDocument): Promise<ClassRef> {
    const profile: any = await this.profileModel
      .findOne({ staffId: staff._id, isClassTeacher: true })
      .select('classTeacherOfGradeName classTeacherOfSectionName').lean();
    if (!profile?.classTeacherOfGradeName) {
      throw new ForbiddenException('Only class teachers can review student leave requests.');
    }
    return { grade: profile.classTeacherOfGradeName, section: profile.classTeacherOfSectionName || undefined };
  }

  // ── GET /me ─────────────────────────────────────────────────

  async getMe(user: PortalUser) {
    const [dbUser, staff, tenant, permissions] = await Promise.all([
      this.userModel.findOne({ _id: user.userId, isActive: true }).select('-passwordHash').lean() as any,
      this.requireStaff(user),
      user.tenantId && Types.ObjectId.isValid(user.tenantId)
        ? this.tenantModel.findById(user.tenantId).lean()
        : this.tenantModel.findOne({ slug: user.schoolSlug }).lean(),
      this.rolesService.getPermissionsForUser(user.userId),
    ]);
    if (!dbUser) throw new NotFoundException('User not found');

    const profile: any = await this.getProfile(staff._id as Types.ObjectId);
    const campusId = (staff as any).campusId || (profile?.campusId ?? null);
    const campus: any = campusId ? await this.campusModel.findById(campusId).select('name').lean() : null;

    return {
      user: {
        id: dbUser._id,
        name: dbUser.name || `${dbUser.profile?.firstName || ''} ${dbUser.profile?.lastName || ''}`.trim(),
        email: dbUser.email,
        role: dbUser.primaryRole || dbUser.role,
        avatarUrl: dbUser.profile?.avatarUrl || null,
        permissions: permissions || undefined,
      },
      staffId: String(staff._id),
      teacherProfileId: profile ? String(profile._id) : null,
      teacherProfile: profile
        ? {
            employeeId: profile.employeeId,
            designation: profile.designation,
            department: profile.department,
            photoUrl: profile.photoUrl,
            subjectsCanTeach: profile.subjectsCanTeach || [],
            gradeLevelsCanTeach: profile.gradeLevelsCanTeach || [],
            currentAssignments: profile.currentAssignments || [],
            status: profile.status,
            isClassTeacher: !!profile.isClassTeacher,
            classTeacherOf: profile.isClassTeacher
              ? {
                  gradeId: profile.classTeacherOfGradeId || null,
                  gradeName: profile.classTeacherOfGradeName || null,
                  sectionName: profile.classTeacherOfSectionName || null,
                  label: profile.classTeacherOfName || null,
                }
              : null,
          }
        : null,
      department: (staff as any).department || profile?.department || null,
      campus: campusId ? { id: String(campusId), name: campus?.name || null } : null,
      institution: {
        name: (tenant as any)?.displayName || user.schoolSlug || null,
        slug: (tenant as any)?.slug || user.schoolSlug || null,
        plan: (tenant as any)?.plan || null,
        activeModules: (tenant as any)?.activeModules || [],
      },
    };
  }

  // ── Notifications (staff side of the shared collection) ─────

  async listNotifications(user: PortalUser, query: { limit?: string; before?: string; unread?: string }) {
    const schoolSlug = this.slugOf(user);
    const limit = Math.min(Math.max(parseInt(query.limit || '30', 10) || 30, 1), 100);
    const filter: any = { recipientUserId: new Types.ObjectId(user.userId), schoolSlug };
    if (query.unread === 'true') filter.isRead = false;
    if (query.before) {
      const d = new Date(query.before);
      if (!isNaN(d.getTime())) filter.createdAt = { $lt: d };
    }
    const rows = await this.notificationModel.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1] as any).createdAt : null,
      unreadCount: await this.unreadCount(user),
    };
  }

  async unreadCount(user: PortalUser): Promise<number> {
    return this.notificationModel.countDocuments({
      recipientUserId: new Types.ObjectId(user.userId), schoolSlug: this.slugOf(user), isRead: false,
    });
  }

  async markNotificationRead(user: PortalUser, id: string) {
    const n = await this.notificationModel.findOneAndUpdate(
      { _id: id, recipientUserId: new Types.ObjectId(user.userId), schoolSlug: this.slugOf(user) },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true },
    );
    if (!n) throw new NotFoundException('Notification not found');
    return n;
  }

  async markAllNotificationsRead(user: PortalUser) {
    const r = await this.notificationModel.updateMany(
      { recipientUserId: new Types.ObjectId(user.userId), schoolSlug: this.slugOf(user), isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return { updated: r.modifiedCount };
  }

  // ── Messaging with guardians ────────────────────────────────

  async listThreads(user: PortalUser, query: { status?: string }) {
    const staff = await this.requireStaff(user);
    const filter: any = { staffId: staff._id, schoolSlug: this.slugOf(user) };
    if (query.status === 'open' || query.status === 'closed') filter.status = query.status;
    const items = await this.threadModel.find(filter).sort({ lastMessageAt: -1 }).limit(100).lean();
    // Count over ALL matching threads, not just the 100 returned rows (a cap here made the badge wrong for busy teachers).
    const unreadCount = await this.threadModel.countDocuments({ ...filter, staffHasUnread: true });
    return { items, unreadCount };
  }

  private async ownThread(user: PortalUser, threadId: string): Promise<MessageThreadDocument> {
    const staff = await this.requireStaff(user);
    if (!Types.ObjectId.isValid(threadId)) throw new NotFoundException('Thread not found');
    const thread = await this.threadModel.findOne({ _id: threadId, staffId: staff._id, schoolSlug: this.slugOf(user) });
    if (!thread) throw new NotFoundException('Thread not found');
    return thread;
  }

  /**
   * The NEWEST 500 messages, returned oldest -> newest (the previous version sorted ascending and cut at 500, so a long
   * thread never showed its latest messages). `after` (ISO date) returns only messages created after it, oldest first, so
   * a polling client does not re-download the whole thread; an invalid `after` is ignored.
   */
  async getThreadMessages(user: PortalUser, threadId: string, after?: string) {
    const thread = await this.ownThread(user, threadId);
    const filter: any = { threadId: thread._id, schoolSlug: thread.schoolSlug };
    const afterDate = after ? new Date(after) : null;
    if (afterDate && !isNaN(afterDate.getTime())) {
      filter.createdAt = { $gt: afterDate };
      const messages = await this.messageModel.find(filter).sort({ createdAt: 1 }).limit(500).lean();
      return { thread: thread.toObject(), messages };
    }
    const newest = await this.messageModel.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return { thread: thread.toObject(), messages: newest.reverse() };
  }

  async sendMessage(user: PortalUser, threadId: string, dto: SendThreadMessageDto) {
    const thread = await this.ownThread(user, threadId);
    if (thread.status === 'closed') throw new ConflictException('This conversation is closed.');
    const senderName = user.name || thread.staffName;
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Message body is required.');
    const message = await this.messageModel.create({
      threadId: thread._id, senderRole: 'staff', senderName, body, schoolSlug: thread.schoolSlug,
    });
    thread.lastMessagePreview = body.slice(0, 140);
    thread.lastMessageAt = new Date();
    thread.guardianHasUnread = true;
    thread.staffHasUnread = false;
    await thread.save();
    await this.notifier.notify({
      recipientUserId: thread.guardianUserId, schoolSlug: thread.schoolSlug, type: 'message',
      title: `New message from ${senderName}`, body: body.slice(0, 140), relatedEntityId: String(thread._id),
    });
    return message.toObject();
  }

  async markThreadRead(user: PortalUser, threadId: string) {
    const thread = await this.ownThread(user, threadId);
    thread.staffHasUnread = false;
    await thread.save();
    return { ok: true };
  }

  async closeThread(user: PortalUser, threadId: string) {
    const thread = await this.ownThread(user, threadId);
    thread.status = 'closed';
    await thread.save();
    return thread.toObject();
  }

  /** Guardians of a student the teacher teaches - names only, no contact details. */
  async listStudentGuardians(user: PortalUser, studentId: string) {
    const student = await this.teachableStudentOrThrow(user, studentId);
    const guardians = await this.userModel
      .find({ tenantId: user.tenantId, guardianOfStudentIds: student._id, isActive: true })
      .select('name profile.firstName profile.lastName').lean();
    return guardians.map((g: any) => ({
      userId: String(g._id),
      name: g.name || `${g.profile?.firstName || ''} ${g.profile?.lastName || ''}`.trim(),
    }));
  }

  private async teachableStudentOrThrow(user: PortalUser, studentId: string): Promise<any> {
    const staff = await this.requireStaff(user);
    if (!Types.ObjectId.isValid(studentId)) throw new NotFoundException('Student not found');
    const student: any = await this.studentModel.findOne({ _id: studentId, schoolSlug: this.slugOf(user) }).lean();
    if (!student) throw new NotFoundException('Student not found');
    const classes = this.classesOf(await this.getProfile(staff._id as Types.ObjectId));
    if (!this.teachesStudent(classes, student)) {
      throw new ForbiddenException('You do not teach this student.');
    }
    return student;
  }

  async createThread(user: PortalUser, dto: CreateStaffThreadDto) {
    const staff = await this.requireStaff(user);
    const student = await this.teachableStudentOrThrow(user, dto.studentId);
    const guardian: any = await this.userModel
      .findOne({ _id: dto.guardianUserId, tenantId: user.tenantId, guardianOfStudentIds: student._id, isActive: true })
      .select('name profile.firstName profile.lastName').lean();
    if (!guardian) throw new ForbiddenException('That person is not a registered guardian of this student.');
    const schoolSlug = this.slugOf(user);
    const staffName = user.name || `${(staff as any).firstName} ${(staff as any).lastName}`.trim();
    const guardianName = guardian.name || `${guardian.profile?.firstName || ''} ${guardian.profile?.lastName || ''}`.trim() || 'Guardian';
    const thread = await this.threadModel.create({
      subject: dto.subject.trim(), studentId: student._id,
      studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      guardianUserId: guardian._id, guardianName, staffId: staff._id, staffName,
      lastMessagePreview: dto.firstMessage.slice(0, 140), lastMessageAt: new Date(),
      guardianHasUnread: true, staffHasUnread: false, schoolSlug,
    });
    await this.messageModel.create({
      threadId: thread._id, senderRole: 'staff', senderName: staffName, body: dto.firstMessage.trim(), schoolSlug,
    });
    await this.notifier.notify({
      recipientUserId: guardian._id, schoolSlug, type: 'message',
      title: `New message from ${staffName}`, body: dto.firstMessage.slice(0, 140), relatedEntityId: String(thread._id),
    });
    return thread.toObject();
  }

  // ── Student leave review (class teacher) ────────────────────

  async listStudentLeaves(user: PortalUser, query: { status?: string; limit?: string }) {
    const staff = await this.requireStaff(user);
    const cls = await this.classTeacherClassOrThrow(staff);
    const schoolSlug = this.slugOf(user);
    const limit = Math.min(Math.max(parseInt(query.limit || '50', 10) || 50, 1), 200);
    // Grade/section strings are free text ('Grade 5' vs '5', ' a ' vs 'A'),
    // so match tolerantly in memory instead of an exact Mongo query.
    const schoolStudents: any[] = await this.studentModel
      .find({ schoolSlug }).select('_id currentGrade currentSection').lean();
    const studentIds = schoolStudents.filter((s) => this.teachesStudent([cls], s)).map((s) => s._id);
    const filter: any = { schoolSlug, studentId: { $in: studentIds } };
    if (['pending', 'approved', 'rejected'].includes(query.status || '')) filter.status = query.status;
    const items = await this.studentLeaveModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return { items };
  }

  async reviewStudentLeave(user: PortalUser, id: string, dto: ReviewStudentLeaveDto) {
    const staff = await this.requireStaff(user);
    const cls = await this.classTeacherClassOrThrow(staff);
    const schoolSlug = this.slugOf(user);
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Leave request not found');
    const leave: any = await this.studentLeaveModel.findOne({ _id: id, schoolSlug });
    if (!leave) throw new NotFoundException('Leave request not found');
    const student: any = await this.studentModel.findOne({ _id: leave.studentId, schoolSlug }).select('currentGrade currentSection').lean();
    if (!student || !this.teachesStudent([cls], student)) {
      throw new ForbiddenException('This student is not in your class.');
    }
    if (leave.status !== 'pending') throw new ConflictException(`This request was already ${leave.status}.`);
    leave.status = dto.status;
    leave.approverName = user.name || `${(staff as any).firstName} ${(staff as any).lastName}`.trim();
    leave.approverNote = dto.remarks?.trim() || undefined;
    leave.approvedAt = new Date();
    await leave.save();
    await this.notifier.notify({
      recipientUserId: leave.requestedByUserId, schoolSlug, type: 'leave_decision',
      title: `Leave request ${dto.status}`,
      body: `${leave.studentName}'s leave request was ${dto.status}${dto.remarks ? `: ${dto.remarks.slice(0, 120)}` : '.'}`,
      relatedEntityId: String(leave._id),
    });
    return leave.toObject();
  }

  // ── Device token (stored only; v1 app does not push) ────────

  async registerDeviceToken(user: PortalUser, dto: RegisterDeviceTokenDto) {
    const schoolSlug = this.slugOf(user);
    const userId = new Types.ObjectId(user.userId);
    await this.deviceTokenModel.updateOne(
      { userId, token: dto.token },
      { $set: { schoolSlug, platform: dto.platform, deviceId: dto.deviceId, appVersion: dto.appVersion, isActive: true, lastSeenAt: new Date() } },
      { upsert: true },
    );
    if (dto.deviceId) {
      await this.deviceTokenModel.updateMany(
        { userId, deviceId: dto.deviceId, token: { $ne: dto.token } }, { $set: { isActive: false } },
      );
    }
    return { ok: true };
  }

  async removeDeviceToken(user: PortalUser, token: string) {
    await this.deviceTokenModel.updateOne(
      { userId: new Types.ObjectId(user.userId), token }, { $set: { isActive: false } },
    );
    return { ok: true };
  }

  // ── Account deletion REQUEST (never hard-deletes) ───────────

  async requestAccountDeletion(user: PortalUser, dto: AccountDeleteRequestDto) {
    if (!dto.confirm) throw new BadRequestException('Please confirm the request.');
    const schoolSlug = this.slugOf(user);
    const staff = await this.requireStaff(user);
    const userId = new Types.ObjectId(user.userId);
    const existing = await this.deletionModel.findOne({ userId, status: 'pending' }).lean();
    if (existing) return { requestId: String((existing as any)._id), status: 'pending', alreadyRequested: true };
    const name = user.name || `${(staff as any).firstName} ${(staff as any).lastName}`.trim();
    const req = await this.deletionModel.create({
      userId, staffId: staff._id, requestedByName: name, reason: dto.reason?.trim() || undefined, schoolSlug,
    });
    const admins = await this.userModel
      .find({ tenantId: user.tenantId, isActive: true, primaryRole: { $in: ADMIN_NOTIFY_ROLES } }).select('_id').limit(25).lean();
    await Promise.all(admins.map((a: any) => this.notifier.notify({
      recipientUserId: a._id, schoolSlug, type: 'other',
      title: 'Account deletion requested',
      body: `${name} has requested deletion of their staff app account. Review in HR before removing any records.`,
      relatedEntityId: String(req._id),
    })));
    return {
      requestId: String(req._id), status: 'pending',
      message: 'Your request was sent to the school administration. Your records are retained until they process it.',
    };
  }
}
