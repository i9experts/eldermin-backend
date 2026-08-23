import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as net from 'net';
import * as crypto from 'crypto';
import { UploadService } from '../../upload/upload.service';
import { EmailService } from '../../email/email.service';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../organization/schemas/user.schema';
import { Staff, StaffDocument } from './schemas/staff.schema';
import { Designation, DesignationDocument } from './schemas/designation.schema';
import { LeaveApplication, LeaveApplicationDocument } from './schemas/leave-application.schema';
import { StaffLifecycle, StaffLifecycleDocument } from './schemas/staff-lifecycle.schema';
import { JobOpening, JobOpeningDocument } from './schemas/job-opening.schema';
import { JobApplication, JobApplicationDocument } from './schemas/job-application.schema';
import { InterviewSchedule, InterviewScheduleDocument } from './schemas/interview-schedule.schema';
import { StaffAttendance, StaffAttendanceDocument } from './schemas/staff-attendance.schema';
import { resolveCampusScope, resolveDepartmentScope, ScopedUser } from '../../auth/scope.util';
import { LeaveBalance, LeaveBalanceDocument } from './schemas/leave-balance.schema';
import { PayrollRun, PayrollRunDocument } from './schemas/payroll-run.schema';
import { Payslip, PayslipDocument } from './schemas/payslip.schema';
import { SalaryComponent, SalaryComponentDocument } from './schemas/salary-component.schema';
import { PerformanceReview, PerformanceReviewDocument } from './schemas/performance-review.schema';
import { Training, TrainingDocument } from './schemas/training.schema';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import { School, SchoolDocument } from '../../organization/schemas/organization.schema';
import { StaffContract, StaffContractDocument } from './schemas/staff-contract.schema';
import { ExitRecord, ExitRecordDocument } from './schemas/exit-record.schema';
import { LeavePolicy, LeavePolicyDocument } from './schemas/leave-policy.schema';
import { BiometricConfig, BiometricConfigDocument } from './schemas/biometric-config.schema';
import { Holiday, HolidayDocument } from './schemas/holiday.schema';
import { ExitSettings, ExitSettingsDocument } from './schemas/exit-settings.schema';
import { HiringSettings, HiringSettingsDocument } from './schemas/hiring-settings.schema';
import { AttendanceSettings, AttendanceSettingsDocument } from './schemas/attendance-settings.schema';
import { Shift, ShiftDocument } from './schemas/shift.schema';
import { Grievance, GrievanceDocument } from './schemas/grievance.schema';
import { DailyWorkSummary, DailyWorkSummaryDocument } from './schemas/daily-work-summary.schema';
import { ExpenseClaim, ExpenseClaimDocument } from './schemas/expense-claim.schema';
import { Advance, AdvanceDocument } from './schemas/advance.schema';
import { FinanceService } from '../../finance/finance.service';

@Injectable()
export class HrService {
  constructor(
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(Designation.name) private designationModel: Model<DesignationDocument>,
    @InjectModel(LeaveApplication.name) private leaveApplicationModel: Model<LeaveApplicationDocument>,
    @InjectModel(StaffLifecycle.name) private lifecycleModel: Model<StaffLifecycleDocument>,
    @InjectModel(JobOpening.name) private jobOpeningModel: Model<JobOpeningDocument>,
    @InjectModel(JobApplication.name) private jobApplicationModel: Model<JobApplicationDocument>,
    @InjectModel(InterviewSchedule.name) private interviewScheduleModel: Model<InterviewScheduleDocument>,
    @InjectModel(StaffAttendance.name) private staffAttendanceModel: Model<StaffAttendanceDocument>,
    @InjectModel(LeaveBalance.name) private leaveBalanceModel: Model<LeaveBalanceDocument>,
    @InjectModel(PayrollRun.name) private payrollRunModel: Model<PayrollRunDocument>,
    @InjectModel(Payslip.name) private payslipModel: Model<PayslipDocument>,
    @InjectModel(SalaryComponent.name) private salaryComponentModel: Model<SalaryComponentDocument>,
    @InjectModel(PerformanceReview.name) private performanceModel: Model<PerformanceReviewDocument>,
    @InjectModel(Training.name) private trainingModel: Model<TrainingDocument>,
    @InjectModel(StaffContract.name) private contractModel: Model<StaffContractDocument>,
    @InjectModel(ExitRecord.name) private exitRecordModel: Model<ExitRecordDocument>,
    @InjectModel(LeavePolicy.name) private leavePolicyModel: Model<LeavePolicyDocument>,
    @InjectModel(BiometricConfig.name) private biometricConfigModel: Model<BiometricConfigDocument>,
    @InjectModel(Holiday.name) private holidayModel: Model<HolidayDocument>,
    @InjectModel(ExitSettings.name) private exitSettingsModel: Model<ExitSettingsDocument>,
    @InjectModel(HiringSettings.name) private hiringSettingsModel: Model<HiringSettingsDocument>,
    @InjectModel(AttendanceSettings.name) private attendanceSettingsModel: Model<AttendanceSettingsDocument>,
    @InjectModel(Shift.name) private shiftModel: Model<ShiftDocument>,
    @InjectModel(Grievance.name) private grievanceModel: Model<GrievanceDocument>,
    @InjectModel(DailyWorkSummary.name) private dailyWorkSummaryModel: Model<DailyWorkSummaryDocument>,
    @InjectModel(ExpenseClaim.name) private expenseClaimModel: Model<ExpenseClaimDocument>,
    @InjectModel(Advance.name) private advanceModel: Model<AdvanceDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    private readonly uploadService: UploadService,
    private readonly emailService: EmailService,
    private readonly financeService: FinanceService,
  ) {}

  // Ledger postings must never block the underlying HR transaction (payroll
  // must still process even if, say, COA hasn't been seeded for this school
  // yet) — errors are swallowed here and show up as gaps in the Trial
  // Balance instead of a hard failure on payroll/claims/advances.
  private async safePostJournal(schoolSlug: string | undefined, dto: Parameters<FinanceService['postJournalEntry']>[1]) {
    if (!schoolSlug) return;
    try { await this.financeService.postJournalEntry(schoolSlug, dto); } catch (err) { /* see comment above */ }
  }

  private newTid(t: string) { return t; }

  // ── Staff ────────────────────────────────────────────────────────────

  async getStaff(tenantId: string, campusId?: string, department?: string, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.newTid(tenantId), isActive: true };
    if (requestingUser) {
      // Hard-blocks (403) if the caller asked for a campus/department
      // outside their own scope; otherwise resolves the effective
      // filter - their own campus/department for campus/department-
      // scoped roles, or the requested value (if any) for
      // institution/platform-level roles who aren't restricted.
      const effectiveCampusId = resolveCampusScope(requestingUser, campusId);
      const effectiveDepartment = resolveDepartmentScope(requestingUser, department);
      if (effectiveCampusId) filter.campusId = this.newTid(effectiveCampusId);
      if (effectiveDepartment) filter.department = effectiveDepartment;
    } else {
      // No requesting user context (e.g. an internal/system call) -
      // behave exactly as before: campusId is just an optional filter.
      if (campusId) filter.campusId = this.newTid(campusId);
      if (department) filter.department = department;
    }
    return this.staffModel
      .find(filter)
      .populate('designationId', 'name code department')
      .populate('campusId', 'name code')
      .sort({ firstName: 1 })
      .lean();
  }

  async createStaff(tenantId: string, data: any) {
    let employeeId = data.employeeId;
    if (!employeeId) {
      const last = await this.staffModel
        .findOne({ tenantId: this.newTid(tenantId) })
        .sort({ employeeId: -1 })
        .lean();
      const lastNum = last?.employeeId ? parseInt(last.employeeId.match(/(\d+)$/)?.[1] ?? '0', 10) : 0;
      employeeId = `EMP-${String(lastNum + 1).padStart(3, '0')}`;
    }
    return this.staffModel.create({ ...data, employeeId, tenantId: this.newTid(tenantId) });
  }

  private generateTempPassword(): string {
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `Welcome${digits}!`;
  }

  private readonly VALID_PRIMARY_ROLES = [
    'super_admin', 'institution_owner', 'principal', 'vice_principal', 'admin',
    'academic_coordinator', 'finance_manager', 'hr_manager', 'teacher',
    'librarian', 'parent', 'student', 'support_staff',
  ];

  private resolvePrimaryRole(erpRole?: string): string {
    const cleaned = (erpRole || '').toLowerCase().trim();
    return this.VALID_PRIMARY_ROLES.includes(cleaned) ? cleaned : 'teacher';
  }

  // Adding a staff member (manually or via bulk import) only creates an HR
  // record — it never creates a real login-capable account, which is why
  // newly-added employees don't show up anywhere that lists actual users
  // (like Roles & Permissions' Team Members). This explicitly provisions one.
  async createLoginForStaff(tenantId: string, institutionId: string, staffId: string) {
    const staff = await this.staffModel.findOne({ _id: staffId, tenantId: this.newTid(tenantId) });
    if (!staff) throw new NotFoundException('Staff member not found');
    if (staff.userId) throw new BadRequestException('This staff member already has a login account');
    if (!staff.email) throw new BadRequestException('This staff member has no email on file — add one first');

    const existing = await this.userModel.findOne({ email: staff.email.toLowerCase() });
    if (existing) throw new BadRequestException('An account with this email already exists');

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await this.userModel.create({
      tenantId: this.newTid(tenantId),
      institutionId,
      email: staff.email.toLowerCase(),
      passwordHash,
      profile: { firstName: staff.firstName, lastName: staff.lastName },
      primaryRole: this.resolvePrimaryRole(staff.erpRole),
      isActive: true,
    });

    staff.userId = user._id as any;
    await staff.save();

    // Real welcome email: Employee ID (safe to share) + a genuine, secure
    // set-password link (same reset-token mechanism as forgot-password),
    // rather than emailing the raw temp password itself - a plaintext
    // password sitting in an inbox forever is a real risk, and this way
    // the employee sets their own password directly. The temp password is
    // still generated and returned below as a fallback the admin can share
    // directly if email doesn't reach them for some reason.
    let emailSent = false;
    let emailError: string | undefined;
    try {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours - longer than the 1hr forgot-password window since this is a one-time onboarding step, not an urgent reset
      await this.userModel.findByIdAndUpdate(user._id, {
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpires: expires,
      });
      const setPasswordUrl = `https://app.eldermin.com/reset-password?token=${rawToken}`;
      const emailResult = await this.emailService.sendEmail({
        to: user.email,
        subject: 'Your Eldermin ERP account is ready',
        html: `
          <p>Hi ${staff.firstName},</p>
          <p>Your Eldermin ERP portal account has been created.</p>
          <p><strong>Employee ID:</strong> ${staff.employeeId || '—'}<br/>
          <strong>Login email:</strong> ${user.email}</p>
          <p><a href="${setPasswordUrl}">Set your password</a> to get started (valid 48 hours).</p>
        `,
      });
      emailSent = emailResult.sent;
      if (!emailResult.sent) emailError = emailResult.error || 'SES did not confirm delivery';
    } catch (err: any) {
      emailError = err?.message || 'Failed to send welcome email';
    }

    return { email: user.email, tempPassword, primaryRole: user.primaryRole, emailSent, emailError };
  }

  async bulkCreateLogins(tenantId: string, institutionId: string, staffIds?: string[]) {
    const filter: any = { tenantId: this.newTid(tenantId), userId: null, email: { $exists: true, $ne: '' } };
    if (staffIds?.length) filter._id = { $in: staffIds };
    const candidates = await this.staffModel.find(filter);

    // Each account involves a deliberately slow bcrypt hash plus several DB
    // round-trips — doing this sequentially for a real batch (18+ staff)
    // can take long enough to blow past the frontend's request timeout even
    // though the batch itself completes successfully server-side (exactly
    // what happened: a client-side "failed" error, but the accounts were
    // genuinely all created). Running them concurrently instead of one at
    // a time is the real fix, not just a longer timeout.
    const results = await Promise.all(candidates.map(async (staff) => {
      try {
        const result = await this.createLoginForStaff(tenantId, institutionId, staff._id.toString());
        return { ok: true as const, name: `${staff.firstName} ${staff.lastName}`, email: result.email, tempPassword: result.tempPassword, emailSent: result.emailSent, emailError: result.emailError };
      } catch (err: any) {
        return { ok: false as const, name: `${staff.firstName} ${staff.lastName}`, reason: err?.message || 'Failed' };
      }
    }));

    const created = results.filter(r => r.ok).map(r => ({ name: r.name, email: (r as any).email, tempPassword: (r as any).tempPassword, emailSent: (r as any).emailSent, emailError: (r as any).emailError }));
    const skipped = results.filter(r => !r.ok).map(r => ({ name: r.name, reason: (r as any).reason }));
    const emailsSent = created.filter(c => c.emailSent).length;
    return { created, skipped, totalCreated: created.length, totalSkipped: skipped.length, emailsSent, emailsFailed: created.length - emailsSent };
  }

  async getStaffById(tenantId: string, staffId: string) {
    const staff = await this.staffModel
      .findOne({ _id: staffId, tenantId: this.newTid(tenantId) })
      .populate('designationId', 'name code department')
      .populate('campusId', 'name code')
      .lean();
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  async updateStaff(tenantId: string, staffId: string, data: any) {
    const staff = await this.staffModel
      .findOneAndUpdate({ _id: staffId, tenantId: this.newTid(tenantId) }, { $set: data }, { new: true })
      .lean();
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  async uploadStaffPhoto(tenantId: string, staffId: string, file: Express.Multer.File, schoolSlug: string) {
    const { url } = await this.uploadService.uploadFile(file, 'staff-avatars', schoolSlug);
    const staff = await this.staffModel
      .findOneAndUpdate({ _id: staffId, tenantId: this.newTid(tenantId) }, { $set: { avatarUrl: url } }, { new: true })
      .lean();
    if (!staff) throw new NotFoundException('Staff member not found');
    return { avatarUrl: url };
  }

  async getStaffDocuments(tenantId: string, staffId: string) {
    const staff = await this.staffModel
      .findOne({ _id: staffId, tenantId: this.newTid(tenantId) })
      .select('documents')
      .lean();
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff.documents || [];
  }

  async addStaffDocument(tenantId: string, staffId: string, file: Express.Multer.File, label: string, schoolSlug: string) {
    const result = await this.uploadService.uploadFile(file, 'staff-documents', schoolSlug);
    const doc = {
      label: label || file.originalname,
      url: result.url,
      key: result.key,
      fileName: result.fileName,
      fileSize: result.fileSize,
      fileType: result.fileType,
      verified: false,
      uploadedAt: new Date(),
    };
    const staff = await this.staffModel
      .findOneAndUpdate(
        { _id: staffId, tenantId: this.newTid(tenantId) },
        { $push: { documents: doc } },
        { new: true },
      )
      .select('documents')
      .lean();
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff.documents;
  }

  // ── Designations ─────────────────────────────────────────────────────

  async getDesignations(tenantId: string) {
    return this.designationModel
      .find({ tenantId: this.newTid(tenantId), isActive: true })
      .sort({ level: 1, name: 1 })
      .lean();
  }

  async createDesignation(tenantId: string, data: any) {
    return this.designationModel.create({ ...data, tenantId: this.newTid(tenantId) });
  }

  // ── Leave Applications (legacy endpoint) ─────────────────────────────

  async getLeaveApplications(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (query.staffId) filter.staffId = this.newTid(query.staffId);
    if (query.status) filter.status = query.status;
    return this.leaveApplicationModel.find(filter).populate('approvedBy', 'profile email').sort({ createdAt: -1 }).lean();
  }

  async submitLeaveApplication(tenantId: string, data: any) {
    return this.leaveApplicationModel.create({
      ...data,
      tenantId: this.newTid(tenantId),
      status: 'pending',
    });
  }

  // ── Staff Lifecycle ───────────────────────────────────────────────────

  async getLifecycleCandidates(tenantId: string) {
    const tid = this.newTid(tenantId);
    const candidates = await this.lifecycleModel.find({ tenantId: tid }).sort({ createdAt: -1 }).lean();
    const grouped: Record<string, any[]> = {
      candidate: [], interview: [], selected: [], offered: [],
      onboarding: [], active: [], exit: [], rejected: [], withdrawn: [],
    };
    candidates.forEach(c => { if (grouped[c.stage] !== undefined) grouped[c.stage].push(c); });
    return { candidates, grouped, total: candidates.length };
  }

  async createCandidate(tenantId: string, institutionId: string, data: any) {
    return this.lifecycleModel.create({
      ...data,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      applicationDate: new Date(),
      stageChangedAt: new Date(),
      stage: 'candidate',
      stageHistory: [{ stage: 'candidate', movedAt: new Date(), note: 'Application received' }],
    });
  }

  async moveToStage(tenantId: string, id: string, stage: string, note: string, userId: string) {
    const candidate = await this.lifecycleModel.findOne({ _id: id, tenantId: this.newTid(tenantId) });
    if (!candidate) throw new NotFoundException('Candidate not found');

    candidate.stage = stage;
    candidate.stageChangedAt = new Date();
    candidate.stageHistory.push({ stage, movedAt: new Date(), movedBy: this.newTid(userId), note });

    if (stage === 'onboarding' && candidate.onboardingChecklist.length === 0) {
      candidate.onboardingChecklist = [
        { task: 'Collect National ID copy', category: 'documents', isDone: false },
        { task: 'Collect degree certificates', category: 'documents', isDone: false },
        { task: 'Collect passport copy', category: 'documents', isDone: false },
        { task: 'Collect medical fitness certificate', category: 'documents', isDone: false },
        { task: 'Create ERP user account', category: 'access', isDone: false },
        { task: 'Setup email account', category: 'access', isDone: false },
        { task: 'Issue access card / ID card', category: 'equipment', isDone: false },
        { task: 'Assign workstation / classroom', category: 'equipment', isDone: false },
        { task: 'Complete HR orientation', category: 'training', isDone: false },
        { task: 'Complete school policy briefing', category: 'training', isDone: false },
        { task: 'Introduce to department head', category: 'introduction', isDone: false },
        { task: 'Introduce to team members', category: 'introduction', isDone: false },
        { task: 'Sign employment contract', category: 'documents', isDone: false },
        { task: 'Complete payroll setup', category: 'documents', isDone: false },
      ];
    }

    await candidate.save();
    return candidate;
  }

  async scheduleInterview(tenantId: string, id: string, data: any) {
    return this.lifecycleModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $push: { interviews: { ...data, status: 'scheduled' } }, $set: { stage: 'interview', stageChangedAt: new Date() } },
      { new: true },
    ).lean();
  }

  async updateInterviewFeedback(tenantId: string, id: string, round: number, feedback: any) {
    return this.lifecycleModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId), 'interviews.round': round },
      {
        $set: {
          'interviews.$.feedback': feedback.feedback,
          'interviews.$.rating': feedback.rating,
          'interviews.$.recommendation': feedback.recommendation,
          'interviews.$.status': 'completed',
        },
      },
      { new: true },
    ).lean();
  }

  async makeOffer(tenantId: string, id: string, offerData: any) {
    return this.lifecycleModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      {
        $set: { offer: { ...offerData, status: 'pending', offerDate: new Date() }, stage: 'offered', stageChangedAt: new Date() },
        $push: { stageHistory: { stage: 'offered', movedAt: new Date(), note: 'Offer extended' } },
      },
      { new: true },
    ).lean();
  }

  async respondToOffer(tenantId: string, id: string, response: string, note: string) {
    const newStage = response === 'accepted' ? 'onboarding' : 'rejected';
    return this.lifecycleModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      {
        $set: {
          'offer.status': response, 'offer.respondedAt': new Date(), 'offer.candidateResponse': note,
          stage: newStage, stageChangedAt: new Date(),
        },
        $push: { stageHistory: { stage: newStage, movedAt: new Date(), note: `Offer ${response}: ${note}` } },
      },
      { new: true },
    ).lean();
  }

  async updateOnboardingTask(tenantId: string, id: string, taskIndex: number, isDone: boolean) {
    const field = `onboardingChecklist.${taskIndex}.isDone`;
    const doneAtField = `onboardingChecklist.${taskIndex}.doneAt`;
    return this.lifecycleModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $set: { [field]: isDone, [doneAtField]: isDone ? new Date() : null } },
      { new: true },
    ).lean();
  }

  async getLifecycleById(tenantId: string, id: string) {
    return this.lifecycleModel.findOne({ _id: id, tenantId: this.newTid(tenantId) }).lean();
  }

  async updateCandidate(tenantId: string, id: string, data: any) {
    return this.lifecycleModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }

  async getLifecycleStats(tenantId: string) {
    const tid = this.newTid(tenantId);
    const [byStage, thisMonth] = await Promise.all([
      this.lifecycleModel.aggregate([{ $match: { tenantId: tid } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
      this.lifecycleModel.countDocuments({ tenantId: tid, createdAt: { $gte: new Date(new Date().setDate(1)) } }),
    ]);
    const stats: any = { thisMonth };
    byStage.forEach(s => { stats[s._id] = s.count; });
    return stats;
  }

  // ── Job Openings ──────────────────────────────────────────────────────

  async getJobOpenings(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (query.status) filter.status = query.status;
    return this.jobOpeningModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createJobOpening(tenantId: string, institutionId: string, data: any, userId: string) {
    const count = await this.jobOpeningModel.countDocuments({ tenantId: this.newTid(tenantId) });
    const jobCode = `JOB-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    return this.jobOpeningModel.create({
      ...data, jobCode,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      createdBy: this.newTid(userId),
    });
  }

  async updateJobOpening(tenantId: string, id: string, data: any) {
    return this.jobOpeningModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) }, { $set: data }, { new: true },
    ).lean();
  }

  async getJobOpeningById(tenantId: string, id: string) {
    const job = await this.jobOpeningModel.findOne({ _id: id, tenantId: this.newTid(tenantId) }).lean();
    const applications = await this.jobApplicationModel.find({ jobId: this.newTid(id), tenantId: this.newTid(tenantId) }).lean();
    return { ...job, applications };
  }

  async getRecruitmentStats(tenantId: string) {
    const tid = this.newTid(tenantId);
    const [totalJobs, activeJobs, totalApplications, pendingInterviews] = await Promise.all([
      this.jobOpeningModel.countDocuments({ tenantId: tid }),
      this.jobOpeningModel.countDocuments({ tenantId: tid, status: 'active' }),
      this.jobApplicationModel.countDocuments({ tenantId: tid }),
      this.interviewScheduleModel.countDocuments({ tenantId: tid, status: 'scheduled', scheduledAt: { $gte: new Date() } }),
    ]);
    const byStage = await this.jobApplicationModel.aggregate([
      { $match: { tenantId: tid } },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]);
    const stageStats: any = {};
    byStage.forEach(s => { stageStats[s._id] = s.count; });
    return { totalJobs, activeJobs, totalApplications, pendingInterviews, stageStats };
  }

  // ── Job Applications ──────────────────────────────────────────────────

  async getApplications(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (query.jobId) filter.jobId = this.newTid(query.jobId);
    if (query.stage) filter.stage = query.stage;
    return this.jobApplicationModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createApplication(tenantId: string, institutionId: string, jobId: string, data: any) {
    const job = await this.jobOpeningModel.findById(jobId).lean();
    const count = await this.jobApplicationModel.countDocuments({ tenantId: this.newTid(tenantId) });
    const applicationNo = `APP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const application = await this.jobApplicationModel.create({
      ...data, applicationNo,
      jobId: this.newTid(jobId),
      jobTitle: (job as any)?.title,
      jobCode: (job as any)?.jobCode,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      stageHistory: [{ stage: 'applied', movedAt: new Date(), note: 'Application received' }],
    });
    await this.jobOpeningModel.findByIdAndUpdate(jobId, { $inc: { applicationsCount: 1 } });
    return application;
  }

  async updateApplicationStage(tenantId: string, id: string, stage: string, note: string) {
    const application = await this.jobApplicationModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      {
        $set: { stage, stageChangedAt: new Date(), isShortlisted: stage === 'shortlisted' },
        $push: { stageHistory: { stage, movedAt: new Date(), note } },
      },
      { new: true },
    ).lean();
    if (stage === 'shortlisted' && application) {
      await this.jobOpeningModel.findByIdAndUpdate((application as any).jobId, { $inc: { shortlistedCount: 1 } });
    }
    return application;
  }

  async getApplicationById(tenantId: string, id: string) {
    return this.jobApplicationModel.findOne({ _id: id, tenantId: this.newTid(tenantId) }).lean();
  }

  // ── Interview Schedule ────────────────────────────────────────────────

  async getInterviewSchedule(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (query.date) {
      const d = new Date(query.date); const next = new Date(d); next.setDate(next.getDate() + 1);
      filter.scheduledAt = { $gte: d, $lt: next };
    }
    if (query.status) filter.status = query.status;
    return this.interviewScheduleModel.find(filter).sort({ scheduledAt: 1 }).lean();
  }

  async scheduleInterview2(tenantId: string, institutionId: string, applicationId: string, data: any, userId: string) {
    const application = await this.jobApplicationModel.findById(applicationId).lean() as any;
    const interview = await this.interviewScheduleModel.create({
      ...data,
      applicationId: this.newTid(applicationId),
      jobId: application?.jobId,
      candidateName: `${application?.firstName} ${application?.lastName}`,
      jobTitle: application?.jobTitle,
      jobCode: application?.jobCode,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      scheduledBy: this.newTid(userId),
    });
    await this.updateApplicationStage(tenantId, applicationId, 'interview', 'Interview scheduled');
    return interview;
  }

  async updateInterviewFeedback2(tenantId: string, id: string, data: any) {
    const overall = Math.round(
      ((data.technicalRating || 0) + (data.communicationRating || 0) + (data.attitudeRating || 0)) / 3 * 10,
    ) / 10;
    return this.interviewScheduleModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $set: { ...data, overallRating: overall, status: 'completed', feedbackSubmittedAt: new Date() } },
      { new: true },
    ).lean();
  }

  // ── ATTENDANCE ────────────────────────────────────────────────────────

  async getStaffAttendance(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (query.date) filter.date = new Date(query.date);
    if (query.staffId) filter.staffId = this.newTid(query.staffId);
    if (query.month && query.year) {
      const start = new Date(query.year, query.month - 1, 1);
      const end = new Date(query.year, query.month, 0);
      filter.date = { $gte: start, $lte: end };
    }
    return this.staffAttendanceModel
      .find(filter)
      .populate('staffId', 'firstName lastName employeeId designation designationId')
      .sort({ date: -1 })
      .lean();
  }

  async markStaffAttendance(tenantId: string, institutionId: string, records: any[]) {
    const ops = records.map(r => ({
      updateOne: {
        filter: { tenantId: this.newTid(tenantId), staffId: this.newTid(r.staffId), date: new Date(r.date) },
        update: { $set: { ...r, tenantId: this.newTid(tenantId), institutionId: this.newTid(institutionId) } },
        upsert: true,
      },
    }));
    await this.staffAttendanceModel.bulkWrite(ops);
    return { message: `${records.length} attendance records saved` };
  }

  async getAttendanceSummary(tenantId: string, month: number, year: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return this.staffAttendanceModel.aggregate([
      { $match: { tenantId: this.newTid(tenantId), date: { $gte: start, $lte: end } } },
      { $group: { _id: { staffId: '$staffId', status: '$status' }, count: { $sum: 1 } } },
    ]);
  }

  // ── BIOMETRIC INTEGRATION ────────────────────────────────────────────
  // ZKTeco devices (common in Pakistan schools) speak a proprietary UDP/TCP
  // protocol on port 4370. Pulling raw punch logs requires a device SDK
  // (e.g. node-zklib) which is not yet wired in — syncBiometricAttendance
  // below only verifies TCP reachability and is a stub for that integration.
  // CSV import (importAttendanceCsv) is the fully working path for now,
  // matching the export format of ZKTeco's bundled attendance software.

  async saveBiometricConfig(tenantId: string, data: { deviceIp: string; devicePort?: number; deviceType?: string; autoSyncEnabled?: boolean; autoSyncIntervalMins?: number }) {
    if (!data.deviceIp) throw new BadRequestException('Device IP is required');
    return this.biometricConfigModel.findOneAndUpdate(
      { tenantId: this.newTid(tenantId) },
      {
        $set: {
          deviceIp: data.deviceIp,
          devicePort: data.devicePort || 4370,
          deviceType: data.deviceType || 'zkteco',
          ...(data.autoSyncEnabled !== undefined ? { autoSyncEnabled: data.autoSyncEnabled } : {}),
          ...(data.autoSyncIntervalMins ? { autoSyncIntervalMins: data.autoSyncIntervalMins } : {}),
        },
      },
      { new: true, upsert: true },
    ).lean();
  }

  private testDeviceConnection(ip: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
      const socket = new net.Socket();
      const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 3000);
      socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true); });
      socket.once('error', () => { clearTimeout(timer); socket.destroy(); resolve(false); });
      socket.connect(port, ip);
    });
  }

  async getBiometricStatus(tenantId: string) {
    const config = await this.biometricConfigModel.findOne({ tenantId: this.newTid(tenantId) }).lean();
    if (!config) return { configured: false, connected: false, lastSyncAt: null };
    const connected = await this.testDeviceConnection(config.deviceIp, config.devicePort);
    if (connected !== config.isConnected) {
      await this.biometricConfigModel.updateOne({ _id: config._id }, { $set: { isConnected: connected } });
    }
    return {
      configured: true,
      connected,
      deviceIp: config.deviceIp,
      devicePort: config.devicePort,
      deviceType: config.deviceType,
      autoSyncEnabled: config.autoSyncEnabled,
      autoSyncIntervalMins: config.autoSyncIntervalMins,
      lastSyncAt: config.lastSyncAt || null,
      lastSyncCount: config.lastSyncCount || 0,
      lastSyncError: config.lastSyncError || null,
    };
  }

  async syncBiometricAttendance(tenantId: string, institutionId: string) {
    const config = await this.biometricConfigModel.findOne({ tenantId: this.newTid(tenantId) }).lean();
    if (!config) throw new BadRequestException('Biometric device is not configured yet');

    const reachable = await this.testDeviceConnection(config.deviceIp, config.devicePort);
    await this.biometricConfigModel.updateOne({ _id: config._id }, { $set: { isConnected: reachable } });
    if (!reachable) {
      await this.biometricConfigModel.updateOne(
        { _id: config._id },
        { $set: { lastSyncError: `Could not reach device at ${config.deviceIp}:${config.devicePort}` } },
      );
      throw new BadRequestException(`Could not reach device at ${config.deviceIp}:${config.devicePort}`);
    }

    // TODO: integrate a ZKTeco SDK (e.g. node-zklib) here to pull real punch
    // logs over the socket and translate them into StaffAttendance records
    // via the same upsert path as markStaffAttendance(). Device is reachable
    // but no punch data is pulled yet — use CSV import as the working path.
    await this.biometricConfigModel.updateOne(
      { _id: config._id },
      { $set: { lastSyncAt: new Date(), lastSyncCount: 0, lastSyncError: null } },
    );
    return {
      message: 'Device is reachable. Live punch-log sync is not implemented yet — use CSV import for now.',
      synced: 0,
      lastSyncAt: new Date(),
    };
  }

  async importAttendanceCsv(tenantId: string, institutionId: string, file: Express.Multer.File, schoolSlug?: string) {
    if (!file) throw new BadRequestException('No file uploaded');
    const text = file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) throw new BadRequestException('CSV file has no data rows');

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const idCol = headers.findIndex(h => h === 'staffid' || h === 'employeeid');
    const dateCol = headers.findIndex(h => h === 'date');
    const checkInCol = headers.findIndex(h => h === 'checkin' || h === 'checkintime');
    const checkOutCol = headers.findIndex(h => h === 'checkout' || h === 'checkouttime');
    const statusCol = headers.findIndex(h => h === 'status');
    if (idCol === -1 || dateCol === -1) {
      throw new BadRequestException('CSV must include staffId/employeeId and date columns');
    }

    // When the CSV has no explicit status column, derive present/late/half_day
    // from the actual check-in time against the staff member's assigned
    // shift (falling back to the school's default shift, then to the
    // school-wide AttendanceSettings if no shifts are configured at all)
    // instead of defaulting every row to 'present' regardless of when
    // someone actually checked in.
    const attendanceSettings = schoolSlug ? await this.getAttendanceSettings(tenantId, schoolSlug) : null;
    const shifts = schoolSlug ? await this.shiftModel.find({ schoolSlug, isActive: true }).lean() : [];
    const shiftById = new Map(shifts.map((s: any) => [String(s._id), s]));
    const defaultShift = shifts.find((s: any) => s.isDefault) || null;

    const staffList = await this.staffModel.find({ tenantId: this.newTid(tenantId) }).select('employeeId shiftId').lean();
    const employeeIdMap = new Map(staffList.map(s => [s.employeeId, s._id.toString()]));
    const staffShiftMap = new Map(staffList.map((s: any) => [String(s._id), s.shiftId ? String(s.shiftId) : null]));

    const ops: any[] = [];
    const skipped: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const rawId = cols[idCol];
      const staffId = Types.ObjectId.isValid(rawId) ? rawId : employeeIdMap.get(rawId);
      const date = cols[dateCol];
      if (!staffId || !date) { skipped.push(i + 1); continue; }
      const checkInTime = checkInCol !== -1 ? cols[checkInCol] || '' : '';
      let status = 'present';
      if (statusCol !== -1) {
        status = cols[statusCol] || 'present';
      } else if (attendanceSettings || shifts.length) {
        const assignedShiftId = staffShiftMap.get(String(staffId));
        const shift = (assignedShiftId && shiftById.get(assignedShiftId)) || defaultShift;
        const rule = shift
          ? {
              standardCheckInTime: shift.startTime,
              graceMinutes: shift.graceMinutes,
              lateThresholdMinutes: shift.lateThresholdMinutes,
              halfDayCutoffTime: shift.halfDayCutoffTime || attendanceSettings?.halfDayCutoffTime,
            }
          : attendanceSettings;
        status = rule ? this.computeAttendanceStatus(checkInTime, rule) : 'present';
      }
      ops.push({
        updateOne: {
          filter: { tenantId: this.newTid(tenantId), staffId: this.newTid(staffId), date: new Date(date) },
          update: {
            $set: {
              tenantId: this.newTid(tenantId),
              institutionId: this.newTid(institutionId),
              staffId: this.newTid(staffId),
              date: new Date(date),
              checkInTime,
              checkOutTime: checkOutCol !== -1 ? cols[checkOutCol] || '' : '',
              status,
            },
          },
          upsert: true,
        },
      });
    }
    if (ops.length) await this.staffAttendanceModel.bulkWrite(ops);

    const config = await this.biometricConfigModel.findOne({ tenantId: this.newTid(tenantId) });
    if (config) await config.updateOne({ $set: { lastSyncAt: new Date(), lastSyncCount: ops.length } });

    return { message: `Imported ${ops.length} attendance record(s)`, imported: ops.length, skippedRows: skipped };
  }

  // ── LEAVE ─────────────────────────────────────────────────────────────

  async createLeaveApplication(tenantId: string, institutionId: string, data: any) {
    const count = await this.leaveApplicationModel.countDocuments({ tenantId: this.newTid(tenantId) });
    const leaveNo = `LV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const totalDays = Math.ceil(
      (new Date(data.toDate).getTime() - new Date(data.fromDate).getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;
    return this.leaveApplicationModel.create({
      ...data, leaveNo, totalDays,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
    });
  }

  // Leave types tracked in LeaveBalance (entitled/used pairs); others (emergency, study, other) are untracked.
  private static readonly BALANCE_LEAVE_TYPES: Record<string, string> = {
    annual: 'annualUsed', sick: 'sickUsed', casual: 'casualUsed',
    maternity: 'maternityUsed', paternity: 'paternityUsed',
    hajj: 'hajjUsed', unpaid: 'unpaidUsed',
  };

  async updateLeaveStatus(tenantId: string, id: string, status: string, approverId: string, note: string) {
    const tid = this.newTid(tenantId);
    const existing = await this.leaveApplicationModel.findOne({ _id: id, tenantId: tid }).lean();
    if (!existing) throw new NotFoundException('Leave application not found');

    const updated = await this.leaveApplicationModel.findOneAndUpdate(
      { _id: id, tenantId: tid },
      { $set: { status, approvedBy: this.newTid(approverId), approvedAt: new Date(), approverNote: note } },
      { new: true },
    ).lean();

    const usedField = HrService.BALANCE_LEAVE_TYPES[existing.leaveType];
    const wasApproved = existing.status === 'approved';
    const isApproved = status === 'approved';
    if (usedField && wasApproved !== isApproved) {
      const delta = isApproved ? existing.totalDays : -existing.totalDays;
      await this.leaveBalanceModel.updateOne(
        { tenantId: tid, staffId: existing.staffId },
        { $inc: { [usedField]: delta } },
      );
    }

    return updated;
  }

  async getLeaveBalance(tenantId: string, staffId: string) {
    return this.leaveBalanceModel.findOne({ tenantId: this.newTid(tenantId), staffId: this.newTid(staffId) }).lean();
  }

  async getAllLeaveBalances(tenantId: string) {
    const tid = this.newTid(tenantId);
    const [staffList, balances] = await Promise.all([
      this.staffModel.find({ tenantId: tid, isActive: true }, { firstName: 1, lastName: 1, employeeId: 1, department: 1, designationId: 1 }).populate('designationId', 'name').lean(),
      this.leaveBalanceModel.find({ tenantId: tid }).lean(),
    ]);
    const byStaff = new Map((balances as any[]).map((b: any) => [String(b.staffId), b]));
    return (staffList as any[]).map((s: any) => {
      const bal: any = byStaff.get(String(s._id)) || {};
      return {
        staffId: s._id, staffName: `${s.firstName} ${s.lastName}`, employeeId: s.employeeId,
        department: s.department || s.designationId?.name || '—',
        annual: { entitled: bal.annualEntitled ?? 0, used: bal.annualUsed ?? 0, remaining: (bal.annualEntitled ?? 0) - (bal.annualUsed ?? 0) },
        sick: { entitled: bal.sickEntitled ?? 0, used: bal.sickUsed ?? 0, remaining: (bal.sickEntitled ?? 0) - (bal.sickUsed ?? 0) },
        casual: { entitled: bal.casualEntitled ?? 0, used: bal.casualUsed ?? 0, remaining: (bal.casualEntitled ?? 0) - (bal.casualUsed ?? 0) },
        maternity: { entitled: bal.maternityEntitled ?? 0, used: bal.maternityUsed ?? 0, remaining: (bal.maternityEntitled ?? 0) - (bal.maternityUsed ?? 0) },
        paternity: { entitled: bal.paternityEntitled ?? 0, used: bal.paternityUsed ?? 0, remaining: (bal.paternityEntitled ?? 0) - (bal.paternityUsed ?? 0) },
        hajj: { entitled: bal.hajjEntitled ?? 0, used: bal.hajjUsed ?? 0, remaining: (bal.hajjEntitled ?? 0) - (bal.hajjUsed ?? 0) },
        hasPolicy: byStaff.has(String(s._id)),
      };
    });
  }

  async getLeaveStats(tenantId: string) {
    const [pending, approved, total] = await Promise.all([
      this.leaveApplicationModel.countDocuments({ tenantId: this.newTid(tenantId), status: 'pending' }),
      this.leaveApplicationModel.countDocuments({ tenantId: this.newTid(tenantId), status: 'approved', fromDate: { $gte: new Date(new Date().setDate(1)) } }),
      this.leaveApplicationModel.countDocuments({ tenantId: this.newTid(tenantId) }),
    ]);
    return { pending, approved, total };
  }

  // ── PAYROLL ───────────────────────────────────────────────────────────

  async getPayrollRuns(tenantId: string) {
    return this.payrollRunModel.find({ tenantId: this.newTid(tenantId) }).sort({ year: -1, month: -1 }).lean();
  }

  async createPayrollRun(tenantId: string, institutionId: string, data: any, userId: string) {
    const periodLabel = `${new Date(data.year, data.month - 1).toLocaleString('default', { month: 'long' })} ${data.year}`;
    return this.payrollRunModel.create({
      ...data, periodLabel,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      processedBy: this.newTid(userId),
    });
  }

  /** The actual fix for the real bug found in QA: the previous flow had
   * the frontend loop calling POST /payslips once per staff member -
   * 30+ separate HTTP round-trips, no per-staff error handling, and a
   * hard uniqueness constraint on Payslip(staffId, month, year) that
   * made a failed run un-retryable (retrying would immediately fail
   * again on the first already-processed person and abort before ever
   * reaching whoever still needed processing). This moves the whole
   * batch server-side, atomically per-run, with three real fixes:
   *  1. Idempotent - a staff member who already has a payslip for this
   *     month/year is silently SKIPPED, not treated as an error. This
   *     is what actually makes retry safe: re-running payroll for a
   *     month that partially succeeded just picks up where it left off.
   *  2. Per-staff error isolation - one person's failure (bad data,
   *     whatever) doesn't abort the rest of the batch. Each outcome is
   *     tracked individually and returned in the summary.
   *  3. Honest status - the run is only ever marked 'completed' if
   *     every single staff member ended up with a real payslip (whether
   *     from this run or an earlier one). Any real failure leaves it
   *     at 'processing' with the failures visible, not silently
   *     reported as done.
   */
  async processPayrollBatch(tenantId: string, institutionId: string, schoolSlug: string, payrollRunId: string, rows: any[], userId: string) {
    const run = await this.payrollRunModel.findOne({ _id: payrollRunId, tenantId: this.newTid(tenantId) });
    if (!run) throw new NotFoundException('Payroll run not found');

    const succeeded: any[] = [];
    const skipped: any[] = [];
    const failed: { staffId: string; staffName: string; error: string }[] = [];

    for (const row of rows) {
      const already = await this.payslipModel.findOne({
        tenantId: this.newTid(tenantId), staffId: this.newTid(row.staffId), month: row.month, year: row.year,
      }).lean();
      if (already) {
        skipped.push({ staffId: row.staffId, staffName: row.staffName, payslipId: already._id });
        continue;
      }
      try {
        const payslip = await this.createPayslip(tenantId, institutionId, schoolSlug, { ...row, payrollRunId });
        succeeded.push({ staffId: row.staffId, staffName: row.staffName, payslipId: payslip._id });
      } catch (err: any) {
        failed.push({ staffId: row.staffId, staffName: row.staffName, error: err?.message || 'Unknown error' });
      }
    }

    // Only honestly "completed" if every single row now has a real
    // payslip, whether created just now or already existing from a
    // prior attempt at this same run.
    const allAccountedFor = failed.length === 0;
    const totals = [...succeeded, ...skipped];
    if (allAccountedFor) {
      const allPayslips = await this.payslipModel.find({ tenantId: this.newTid(tenantId), payrollRunId: this.newTid(payrollRunId) }).lean();
      const totalGrossSalary = allPayslips.reduce((s, p: any) => s + (p.grossSalary || 0), 0);
      const totalDeductions = allPayslips.reduce((s, p: any) => s + (p.totalDeductions || 0), 0);
      const totalNetSalary = allPayslips.reduce((s, p: any) => s + (p.netSalary || 0), 0);
      await this.payrollRunModel.updateOne(
        { _id: payrollRunId },
        { $set: { status: 'completed', totalEmployees: allPayslips.length, totalGrossSalary, totalDeductions, totalNetSalary, processedBy: this.newTid(userId), processedAt: new Date() } },
      );
    }

    return {
      runId: payrollRunId,
      status: allAccountedFor ? 'completed' : 'processing',
      totalRows: rows.length,
      succeededCount: succeeded.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      failed, // full detail on exactly who failed and why, so a real retry (not a rebuild) is possible
    };
  }

  /** Safety net for a genuinely stuck run (the actual scenario this
   * whole fix exists to prevent, but a real recovery path matters
   * regardless) - only allowed while nothing has been marked paid yet,
   * since a paid payslip has real money and a real GL entry behind it
   * that deleting the run must never silently orphan. */
  async deletePayrollRun(tenantId: string, id: string) {
    const run = await this.payrollRunModel.findOne({ _id: id, tenantId: this.newTid(tenantId) });
    if (!run) throw new NotFoundException('Payroll run not found');
    const paidCount = await this.payslipModel.countDocuments({ tenantId: this.newTid(tenantId), payrollRunId: this.newTid(id), status: 'paid' });
    if (paidCount > 0) {
      throw new BadRequestException(`Cannot delete - ${paidCount} payslip(s) on this run are already marked paid. Those need to be handled individually first.`);
    }
    await this.payslipModel.deleteMany({ tenantId: this.newTid(tenantId), payrollRunId: this.newTid(id) });
    await this.payrollRunModel.deleteOne({ _id: id });
    return { deleted: true };
  }

  // Real state machine, not a blind string write - the previous version
  // accepted any status value with no transition check at all, meaning
  // a run that was correctly left at 'processing' by processPayrollBatch
  // (because some staff genuinely failed) could still be clicked
  // straight to 'approved' from the UI, with no one ever noticing some
  // staff never got a payslip. 'approved' is only reachable from
  // 'completed' now - the actual fix for that gap.
  private static readonly PAYROLL_TRANSITIONS: Record<string, string[]> = {
    draft: ['processing', 'cancelled'],
    processing: ['completed', 'cancelled'], // NOT 'approved' directly - must genuinely complete first
    completed: ['approved', 'cancelled'],
    approved: ['paid', 'cancelled'],
    paid: [], // terminal - real money has moved, nothing should change this after the fact
    cancelled: [], // terminal
  };

  async updatePayrollStatus(tenantId: string, id: string, status: string, userId: string) {
    if (!Object.keys(HrService.PAYROLL_TRANSITIONS).includes(status)) {
      throw new BadRequestException(`Invalid payroll status: ${status}`);
    }
    const run = await this.payrollRunModel.findOne({ _id: id, tenantId: this.newTid(tenantId) });
    if (!run) throw new NotFoundException('Payroll run not found');
    const allowed = HrService.PAYROLL_TRANSITIONS[run.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot move a payroll run from '${run.status}' to '${status}'.`);
    }
    const update: any = { status };
    // Only a genuine approval actually stamps who approved it and when -
    // every other transition (marking paid, cancelling, etc) leaves that
    // field alone rather than overwriting it with whoever happened to
    // click the next button.
    if (status === 'approved') {
      update.approvedBy = this.newTid(userId);
      update.approvedAt = new Date();
    }
    return this.payrollRunModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $set: update },
      { new: true },
    ).lean();
  }

  async getPayslips(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (query.staffId) filter.staffId = this.newTid(query.staffId);
    if (query.month) filter.month = parseInt(query.month);
    if (query.year) filter.year = parseInt(query.year);
    return this.payslipModel.find(filter).sort({ year: -1, month: -1 }).lean();
  }

  async createPayslip(tenantId: string, institutionId: string, schoolSlug: string, data: any) {
    const periodLabel = `${new Date(data.year, data.month - 1).toLocaleString('default', { month: 'long' })} ${data.year}`;

    // Fold in any approved-but-unsettled expense claims for this staff member
    // that are marked to settle via payroll. Two different cases here,
    // handled differently so the ledger stays correct:
    //  - a claim NOT linked to an advance is a genuine new reimbursement —
    //    it adds to Other Allowances/gross salary, same bucketing pattern
    //    used for custom salary components.
    //  - a claim linked to an advance is just proof the money the employee
    //    already received (the advance disbursement) was validly spent —
    //    it must NOT add to the payslip (that would pay them twice); it
    //    only clears the Employee Advances balance in the GL below.
    // Either way each claim is marked settled against this payslip so it's
    // never double-counted on a future one.
    let reimbursement = 0;
    let pendingClaims: any[] = [];
    let advanceLinkedClaims: any[] = [];
    if (data.staffId) {
      pendingClaims = await this.expenseClaimModel.find({
        tenantId: this.newTid(tenantId), staffId: this.newTid(data.staffId),
        status: 'approved', settlementMethod: 'payroll', settledInPayroll: false,
      }).lean();
      advanceLinkedClaims = pendingClaims.filter((c: any) => c.advanceId);
      const nonAdvanceClaims = pendingClaims.filter((c: any) => !c.advanceId);
      reimbursement = nonAdvanceClaims.reduce((sum, c: any) => sum + (c.amount || 0), 0);
    }

    const otherAllowances = (data.otherAllowances || 0) + reimbursement;
    const totalDeductions = (data.incomeTax || 0) + (data.providentFund || 0) + (data.loanDeduction || 0) + (data.leaveDeduction || 0) + (data.otherDeductions || 0);
    const grossSalary = (data.grossSalary || 0) + reimbursement;
    const netSalary = grossSalary - totalDeductions;

    const payslip = await this.payslipModel.create({
      ...data, periodLabel, totalDeductions, netSalary, otherAllowances, grossSalary,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
    });

    if (pendingClaims.length > 0) {
      await this.expenseClaimModel.updateMany(
        { _id: { $in: pendingClaims.map((c: any) => c._id) } },
        { $set: { settledInPayroll: true, settledPayslipId: payslip._id } },
      );
    }

    // Post to the GL: base salary expense, reimbursements booked separately
    // from pure salary cost, deductions split into their own payable/tax
    // accounts, and everything nets to Salary Payable (what's actually
    // owed to the employee once paid).
    const baseSalaryExpense = data.grossSalary || 0;
    const nonTaxDeductions = (data.loanDeduction || 0) + (data.leaveDeduction || 0) + (data.otherDeductions || 0);
    const lines: any[] = [
      { accountCode: '5000', debit: baseSalaryExpense, partnerType: 'staff', partnerId: String(data.staffId || ''), partnerName: data.staffName, costCenterName: data.department },
    ];
    if (reimbursement > 0) lines.push({ accountCode: '5500', debit: reimbursement, partnerType: 'staff', partnerId: String(data.staffId || ''), partnerName: data.staffName, costCenterName: data.department });
    lines.push({ accountCode: '2100', credit: netSalary + nonTaxDeductions, partnerType: 'staff', partnerId: String(data.staffId || ''), partnerName: data.staffName, costCenterName: data.department });
    if (data.incomeTax) lines.push({ accountCode: '2200', credit: data.incomeTax, partnerType: 'staff', partnerId: String(data.staffId || ''), partnerName: data.staffName, costCenterName: data.department });
    if (data.providentFund) lines.push({ accountCode: '2300', credit: data.providentFund, partnerType: 'staff', partnerId: String(data.staffId || ''), partnerName: data.staffName, costCenterName: data.department });
    await this.safePostJournal(schoolSlug, {
      date: new Date(), reference: periodLabel, narration: `Payroll — ${data.staffName || ''} — ${periodLabel}`,
      sourceType: 'payroll', sourceId: String(payslip._id), lines,
    });

    // Advance-linked claims settle separately from payroll payable — the
    // employee was already paid via the advance, so this just recognizes
    // the expense and clears the Employee Advances balance, in its own
    // entry per claim for a clean audit trail back to each claim.
    for (const claim of advanceLinkedClaims) {
      await this.safePostJournal(schoolSlug, {
        date: new Date(), reference: claim.claimNo, narration: `Advance settled via claim ${claim.claimNo} — ${claim.staffName}`,
        sourceType: 'expense_claim', sourceId: String(claim._id),
        lines: [
          { accountCode: '5500', debit: claim.amount, partnerType: 'staff', partnerId: String(claim.staffId), partnerName: claim.staffName },
          { accountCode: '1300', credit: claim.amount, partnerType: 'staff', partnerId: String(claim.staffId), partnerName: claim.staffName },
        ],
      });
    }

    return payslip;
  }

  // ── Salary Components (the payroll "root system") ────────────────────
  // Each school defines its own components — this is what lets different
  // schools run genuinely different payroll structures instead of every
  // school being forced into one hardcoded Basic/HRA/Transport/Medical
  // shape baked into the app.
  private readonly DEFAULT_SALARY_COMPONENTS = [
    { name: 'Basic Salary', code: 'BASIC', type: 'earning', calculationType: 'manual', isTaxable: true, displayOrder: 1 },
    { name: 'House Rent Allowance', code: 'HRA', type: 'earning', calculationType: 'percentage_of_basic', percentageValue: 40, isTaxable: true, displayOrder: 2 },
    { name: 'Transport Allowance', code: 'TRANSPORT', type: 'earning', calculationType: 'fixed', defaultAmount: 1000, isTaxable: false, displayOrder: 3 },
    { name: 'Medical Allowance', code: 'MEDICAL', type: 'earning', calculationType: 'fixed', defaultAmount: 500, isTaxable: false, displayOrder: 4 },
    { name: 'Income Tax', code: 'TAX', type: 'deduction', calculationType: 'manual', isTaxable: false, displayOrder: 5 },
    { name: 'Provident Fund', code: 'PF', type: 'deduction', calculationType: 'manual', isTaxable: false, displayOrder: 6 },
  ];

  async getSalaryComponents(tenantId: string, schoolSlug: string) {
    const existing = await this.salaryComponentModel.find({ schoolSlug }).sort({ displayOrder: 1 }).lean();
    if (existing.length > 0) return existing;
    // First time this school has opened Salary Components — seed sensible,
    // fully editable/deletable starting defaults rather than showing a
    // completely blank, intimidating screen. Nothing here is locked in;
    // every one of these can be renamed, reconfigured, or removed.
    const seeded = await this.salaryComponentModel.insertMany(
      this.DEFAULT_SALARY_COMPONENTS.map(c => ({ ...c, tenantId: this.newTid(tenantId), schoolSlug, isActive: true })),
    );
    return seeded;
  }

  async createSalaryComponent(tenantId: string, schoolSlug: string, dto: any) {
    const code = (dto.code || dto.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 30);
    const existing = await this.salaryComponentModel.findOne({ schoolSlug, code });
    if (existing) throw new BadRequestException(`A component with code "${code}" already exists`);
    return this.salaryComponentModel.create({ ...dto, code, tenantId: this.newTid(tenantId), schoolSlug });
  }

  async updateSalaryComponent(id: string, schoolSlug: string, dto: any) {
    // Same duplicate-code check as create - the database's own unique
    // index already prevents the actual collision, but without this a
    // renamed/re-coded component would surface a raw MongoDB E11000
    // error instead of a real, readable message.
    if (dto.code) {
      const clash = await this.salaryComponentModel.findOne({ schoolSlug, code: dto.code, _id: { $ne: this.newTid(id) } }).lean();
      if (clash) throw new BadRequestException(`A component with code "${dto.code}" already exists`);
    }
    const component = await this.salaryComponentModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!component) throw new NotFoundException('Salary component not found');
    return component;
  }

  async deleteSalaryComponent(id: string, schoolSlug: string) {
    const inUse = await this.staffModel.countDocuments({ schoolSlug: schoolSlug, 'salaryStructure.componentId': this.newTid(id) } as any);
    if (inUse > 0) {
      throw new BadRequestException(`This component is assigned to ${inUse} staff member(s) — deactivate it instead of deleting, or remove it from their salary structure first`);
    }
    const result = await this.salaryComponentModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Salary component not found');
    return { message: 'Salary component deleted' };
  }

  // Sets a specific staff member's actual salary structure — the real
  // per-employee values (a teacher's Basic differs from an admin's Basic),
  // built from this school's own configured components rather than a
  // one-size-fits-all default.
  async setStaffSalaryStructure(staffId: string, tenantId: string, schoolSlug: string, lines: { componentId: string; amount: number }[]) {
    const components = await this.salaryComponentModel.find({ schoolSlug, _id: { $in: lines.map(l => this.newTid(l.componentId)) } }).lean();
    const componentMap = new Map(components.map((c: any) => [String(c._id), c]));

    const basicLine = lines.find(l => componentMap.get(l.componentId)?.code === 'BASIC');
    const basicAmount = basicLine?.amount || 0;

    const salaryStructure = lines.map(l => {
      const comp = componentMap.get(l.componentId);
      if (!comp) return null;
      const amount = comp.calculationType === 'percentage_of_basic'
        ? Math.round(basicAmount * ((comp.percentageValue || 0) / 100))
        : l.amount;
      return { componentId: comp._id, code: comp.code, name: comp.name, type: comp.type, amount };
    }).filter(Boolean);

    const grossSalary = salaryStructure.filter((l: any) => l.type === 'earning').reduce((s: number, l: any) => s + (l.amount || 0), 0);

    const staff = await this.staffModel.findOneAndUpdate(
      { _id: staffId, tenantId: this.newTid(tenantId) },
      { $set: { salaryStructure, salary: grossSalary } },
      { new: true },
    );
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  async generatePayslipPdf(payslipId: string, tenantId: string, schoolSlug: string): Promise<Buffer> {
    const payslip = await this.payslipModel.findOne({ _id: payslipId, tenantId: this.newTid(tenantId) }).lean();
    if (!payslip) throw new NotFoundException('Payslip not found');
    const school = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    const schoolName = (school as any)?.name || 'Eldermin School';

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    // Standard fonts only support WinAnsi encoding - a staff name (or
    // school name) containing Arabic script crashes the whole payslip
    // otherwise. Same real, verified fix already applied to student
    // profile PDFs - tries the requested font first, only falls back to
    // this real Arabic-capable font if that specific draw call throws.
    const arabicFontBytes = fs.readFileSync(
      require.resolve('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2'),
    );
    const arabicFont = await pdfDoc.embedFont(arabicFontBytes);
    const navy = rgb(0.11, 0.23, 0.37);
    const gray = rgb(0.42, 0.45, 0.5);
    const lightGray = rgb(0.95, 0.96, 0.97);
    let y = 800;

    const drawText = (text: string, x: number, yPos: number, opts: { size?: number; f?: any; color?: any } = {}) => {
      const drawOpts = { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? rgb(0.15, 0.15, 0.18) };
      try {
        page.drawText(text ?? '', drawOpts);
      } catch {
        page.drawText(text ?? '', { ...drawOpts, font: arabicFont });
      }
    };
    const fmt = (n: number) => `${payslip.currency || 'PKR'} ${Number(n || 0).toLocaleString()}`;

    // Header
    page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: navy });
    drawText(schoolName, 40, 812, { size: 16, f: bold, color: rgb(1, 1, 1) });
    drawText('PAYSLIP', 480, 812, { size: 14, f: bold, color: rgb(1, 1, 1) });
    y = 765;

    drawText(payslip.periodLabel || `${payslip.month}/${payslip.year}`, 40, y, { size: 12, f: bold, color: navy });
    y -= 25;

    // Employee details block
    page.drawRectangle({ x: 40, y: y - 55, width: 515, height: 60, color: lightGray });
    drawText('Employee Name', 50, y - 12, { size: 8, color: gray });
    drawText(payslip.staffName || '—', 50, y - 26, { size: 11, f: bold });
    drawText('Employee ID', 220, y - 12, { size: 8, color: gray });
    drawText(payslip.employeeId || '—', 220, y - 26, { size: 11, f: bold });
    drawText('Designation', 350, y - 12, { size: 8, color: gray });
    drawText(payslip.designation || '—', 350, y - 26, { size: 11, f: bold });
    drawText('Department', 50, y - 44, { size: 8, color: gray });
    drawText(payslip.department || '—', 50, y - 56, { size: 10 });
    drawText('Status', 350, y - 44, { size: 8, color: gray });
    drawText((payslip.status || 'draft').toUpperCase(), 350, y - 56, { size: 10, f: bold });
    y -= 85;

    // Earnings / Deductions two-column table
    const colWidth = 250;
    drawText('EARNINGS', 40, y, { size: 10, f: bold, color: navy });
    drawText('DEDUCTIONS', 40 + colWidth + 25, y, { size: 10, f: bold, color: navy });
    y -= 5;
    page.drawLine({ start: { x: 40, y }, end: { x: 40 + colWidth, y }, thickness: 0.5, color: gray });
    page.drawLine({ start: { x: 40 + colWidth + 25, y }, end: { x: 595 - 40, y }, thickness: 0.5, color: gray });
    y -= 18;

    const earnings = [
      ['Basic Salary', payslip.basicSalary], ['HRA', payslip.hra],
      ['Transport Allowance', payslip.transportAllowance], ['Medical Allowance', payslip.medicalAllowance],
      ['Other Allowances', payslip.otherAllowances],
    ];
    const deductions = [
      ['Income Tax', payslip.incomeTax], ['Provident Fund', payslip.providentFund],
      ['Loan Deduction', payslip.loanDeduction], ['Leave Deduction', payslip.leaveDeduction],
      ['Other Deductions', payslip.otherDeductions],
    ];
    let ey = y, dy = y;
    for (const [label, amt] of earnings) {
      if (!amt) continue;
      drawText(label as string, 40, ey, { size: 9 });
      drawText(fmt(amt as number), 40 + colWidth - 70, ey, { size: 9 });
      ey -= 16;
    }
    for (const [label, amt] of deductions) {
      if (!amt) continue;
      drawText(label as string, 40 + colWidth + 25, dy, { size: 9 });
      drawText(fmt(amt as number), 595 - 110, dy, { size: 9 });
      dy -= 16;
    }
    y = Math.min(ey, dy) - 10;
    page.drawLine({ start: { x: 40, y }, end: { x: 40 + colWidth, y }, thickness: 0.5, color: gray });
    page.drawLine({ start: { x: 40 + colWidth + 25, y }, end: { x: 595 - 40, y }, thickness: 0.5, color: gray });
    y -= 16;
    drawText('Gross Salary', 40, y, { size: 9, f: bold });
    drawText(fmt(payslip.grossSalary), 40 + colWidth - 70, y, { size: 9, f: bold });
    drawText('Total Deductions', 40 + colWidth + 25, y, { size: 9, f: bold });
    drawText(fmt(payslip.totalDeductions), 595 - 110, y, { size: 9, f: bold });
    y -= 40;

    // Net Salary highlight
    page.drawRectangle({ x: 40, y: y - 30, width: 515, height: 40, color: navy });
    drawText('NET SALARY', 55, y - 15, { size: 12, f: bold, color: rgb(1, 1, 1) });
    drawText(fmt(payslip.netSalary), 420, y - 15, { size: 14, f: bold, color: rgb(1, 1, 1) });
    y -= 65;

    // Attendance summary
    drawText('Attendance Summary', 40, y, { size: 10, f: bold, color: navy });
    y -= 18;
    drawText(`Present: ${payslip.presentDays ?? 0}  ·  Absent: ${payslip.absentDays ?? 0}  ·  Leave: ${payslip.leaveDays ?? 0}`, 40, y, { size: 9, color: gray });
    y -= 40;

    drawText('This is a system-generated payslip and does not require a signature.', 40, 40, { size: 7, color: gray });

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  async getPayrollStats(tenantId: string) {
    const now = new Date();
    const [totalPayslips, thisMonthTotal, pendingRuns] = await Promise.all([
      this.payslipModel.countDocuments({ tenantId: this.newTid(tenantId) }),
      this.payslipModel.aggregate([
        { $match: { tenantId: this.newTid(tenantId), month: now.getMonth() + 1, year: now.getFullYear() } },
        { $group: { _id: null, total: { $sum: '$netSalary' } } },
      ]),
      this.payrollRunModel.countDocuments({ tenantId: this.newTid(tenantId), status: { $in: ['draft', 'processing'] } }),
    ]);
    return { totalPayslips, thisMonthTotal: thisMonthTotal[0]?.total || 0, pendingRuns };
  }

  // ── PERFORMANCE ───────────────────────────────────────────────────────

  async getPerformanceReviews(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (query.staffId) filter.staffId = this.newTid(query.staffId);
    if (query.status) filter.status = query.status;
    return this.performanceModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createPerformanceReview(tenantId: string, institutionId: string, data: any) {
    return this.performanceModel.create({
      ...data,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      criteria: [
        { category: 'Teaching Quality', criteria: 'Lesson planning and delivery', selfScore: 0, managerScore: 0, weight: 25 },
        { category: 'Teaching Quality', criteria: 'Student engagement', selfScore: 0, managerScore: 0, weight: 20 },
        { category: 'Professionalism', criteria: 'Punctuality and attendance', selfScore: 0, managerScore: 0, weight: 15 },
        { category: 'Professionalism', criteria: 'Communication skills', selfScore: 0, managerScore: 0, weight: 15 },
        { category: 'Growth', criteria: 'Professional development', selfScore: 0, managerScore: 0, weight: 15 },
        { category: 'Growth', criteria: 'Collaboration and teamwork', selfScore: 0, managerScore: 0, weight: 10 },
      ],
    });
  }

  async updatePerformanceReview(tenantId: string, id: string, data: any) {
    return this.performanceModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) }, { $set: data }, { new: true },
    ).lean();
  }

  // ── TRAINING ──────────────────────────────────────────────────────────

  async getTrainings(tenantId: string) {
    return this.trainingModel.find({ tenantId: this.newTid(tenantId) }).sort({ startDate: -1 }).lean();
  }

  async createTraining(tenantId: string, institutionId: string, data: any, userId: string) {
    return this.trainingModel.create({
      ...data,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      createdBy: this.newTid(userId),
    });
  }

  async updateTraining(tenantId: string, id: string, data: any) {
    return this.trainingModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) }, { $set: data }, { new: true },
    ).lean();
  }

  async enrollInTraining(tenantId: string, id: string, staffId: string, staffName: string) {
    return this.trainingModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $addToSet: { participants: { staffId: this.newTid(staffId), staffName, status: 'enrolled' } } },
      { new: true },
    ).lean();
  }

  // ── CONTRACTS ─────────────────────────────────────────────────────────

  async getContracts(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (query.staffId) filter.staffId = this.newTid(query.staffId);
    if (query.status) filter.status = query.status;
    return this.contractModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createContract(tenantId: string, institutionId: string, data: any, userId: string) {
    const count = await this.contractModel.countDocuments({ tenantId: this.newTid(tenantId) });
    const contractNo = `CON-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const expiresAt = data.endDate ? new Date(data.endDate) : null;
    return this.contractModel.create({
      ...data, contractNo, expiresAt,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      createdBy: this.newTid(userId),
    });
  }

  async updateContract(tenantId: string, id: string, data: any) {
    return this.contractModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) }, { $set: data }, { new: true },
    ).lean();
  }

  async getContractStats(tenantId: string) {
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [active, expiringSoon, expired] = await Promise.all([
      this.contractModel.countDocuments({ tenantId: this.newTid(tenantId), status: 'active' }),
      this.contractModel.countDocuments({ tenantId: this.newTid(tenantId), status: 'active', expiresAt: { $lte: thirtyDays, $gte: now } }),
      this.contractModel.countDocuments({ tenantId: this.newTid(tenantId), status: 'active', expiresAt: { $lt: now } }),
    ]);
    return { active, expiringSoon, expired };
  }

  // ── EXIT ──────────────────────────────────────────────────────────────

  async getExitRecords(tenantId: string) {
    return this.exitRecordModel.find({ tenantId: this.newTid(tenantId) }).sort({ createdAt: -1 }).lean();
  }

  async createExitRecord(tenantId: string, institutionId: string, data: any, userId: string, schoolSlug?: string) {
    // Clearance checklist and notice period now come from this school's own
    // configured Exit Settings (falling back to the same sensible defaults
    // every record used to get hardcoded to) rather than one fixed list for
    // every school and every employee type.
    const settings = schoolSlug ? await this.getExitSettings(tenantId, schoolSlug) : null;
    const templateChecklist = settings?.clearanceChecklistTemplate?.length
      ? settings.clearanceChecklistTemplate
      : this.DEFAULT_CLEARANCE_CHECKLIST;
    const clearanceChecklist = templateChecklist.map((c: any) => ({ department: c.department, item: c.item, isDone: false }));

    let noticePeriodDays = data.noticePeriodDays;
    if (noticePeriodDays === undefined || noticePeriodDays === null) {
      const byType = settings?.noticePeriodDaysByEmploymentType || {};
      noticePeriodDays = byType[data.employmentType] ?? settings?.defaultNoticePeriodDays ?? 30;
    }

    return this.exitRecordModel.create({
      ...data, clearanceChecklist, noticePeriodDays,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      processedBy: this.newTid(userId),
    });
  }

  async updateExitRecord(tenantId: string, id: string, data: any) {
    return this.exitRecordModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) }, { $set: data }, { new: true },
    ).lean();
  }

  async updateClearanceItem(tenantId: string, id: string, itemIndex: number, isDone: boolean, clearedBy: string) {
    const f = `clearanceChecklist.${itemIndex}`;
    return this.exitRecordModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $set: { [`${f}.isDone`]: isDone, [`${f}.clearedBy`]: clearedBy, [`${f}.clearedAt`]: isDone ? new Date() : null } },
      { new: true },
    ).lean();
  }

  // ── LEAVE POLICIES ────────────────────────────────────────────────────

  async getLeavePolicies(tenantId: string) {
    return this.leavePolicyModel
      .find({ tenantId: this.newTid(tenantId), isActive: true })
      .sort({ isDefault: -1, name: 1 })
      .lean();
  }

  async createLeavePolicy(tenantId: string, data: any) {
    return this.leavePolicyModel.create({ ...data, tenantId: this.newTid(tenantId) });
  }

  async updateLeavePolicy(tenantId: string, id: string, data: any) {
    return this.leavePolicyModel
      .findOneAndUpdate({ _id: id, tenantId: this.newTid(tenantId) }, { $set: data }, { new: true })
      .lean();
  }

  async assignLeavePolicy(tenantId: string, policyId: string, staffId: string, _academicYearId: string) {
    const policy = await this.leavePolicyModel.findOne({ _id: policyId, tenantId: this.newTid(tenantId) }).lean();
    if (!policy) throw new NotFoundException('Leave policy not found');
    const balanceData = {
      annualEntitled:   policy.annualDays,
      sickEntitled:     policy.sickDays,
      casualEntitled:   policy.casualDays,
      maternityEntitled: policy.maternityDays,
      paternityEntitled: policy.paternityDays,
      hajjEntitled:     policy.hajjDays || 0,
    };
    await this.leaveBalanceModel.updateOne(
      { tenantId: this.newTid(tenantId), staffId: this.newTid(staffId) },
      { $set: balanceData, $setOnInsert: { academicYearId: new Types.ObjectId() } },
      { upsert: true },
    );
    return { success: true };
  }

  async bulkAssignLeavePolicy(tenantId: string, policyId: string, _academicYearId?: string) {
    const [policy, staffList] = await Promise.all([
      this.leavePolicyModel.findOne({ _id: policyId, tenantId: this.newTid(tenantId) }).lean(),
      this.staffModel.find({ tenantId: this.newTid(tenantId), isActive: true }, { _id: 1 }).lean(),
    ]);
    if (!policy) throw new NotFoundException('Leave policy not found');
    const balanceData = {
      annualEntitled:   policy.annualDays,
      sickEntitled:     policy.sickDays,
      casualEntitled:   policy.casualDays,
      maternityEntitled: policy.maternityDays,
      paternityEntitled: policy.paternityDays,
      hajjEntitled:     policy.hajjDays || 0,
    };
    const ops = (staffList as any[]).map((s: any) => ({
      updateOne: {
        filter: { tenantId: this.newTid(tenantId), staffId: String(s._id) },
        update: { $set: balanceData, $setOnInsert: { academicYearId: new Types.ObjectId() } },
        upsert: true,
      },
    }));
    if (ops.length > 0) await this.leaveBalanceModel.bulkWrite(ops as any);
    return { assignedCount: staffList.length };
  }

  async seedLeavePolicies(tenantId: string) {
    const tid = this.newTid(tenantId);
    const defaults = [
      { code: 'STD-TEACHER',  name: 'Standard Teacher Policy',    applicableTo: 'permanent', isDefault: true,  annualDays: 21, sickDays: 10, casualDays: 10, maternityDays: 90, paternityDays: 10, emergencyDays: 3, studyDays: 5, unpaidDays: 30, hajjDays: 15 },
      { code: 'STD-ADMIN',    name: 'Admin & Support Policy',     applicableTo: 'all',       isDefault: false, annualDays: 18, sickDays: 10, casualDays: 7,  maternityDays: 90, paternityDays: 10, emergencyDays: 3, studyDays: 0, unpaidDays: 30, hajjDays: 15 },
      { code: 'STD-CONTRACT', name: 'Contract Staff Policy',      applicableTo: 'contract',  isDefault: false, annualDays: 14, sickDays: 7,  casualDays: 5,  maternityDays: 90, paternityDays: 5,  emergencyDays: 2, studyDays: 0, unpaidDays: 20, hajjDays: 0  },
      { code: 'STD-PARTTIME', name: 'Part-Time & Visiting Policy', applicableTo: 'part_time', isDefault: false, annualDays: 7,  sickDays: 5,  casualDays: 3,  maternityDays: 0,  paternityDays: 0,  emergencyDays: 1, studyDays: 0, unpaidDays: 0,  hajjDays: 0  },
    ];
    const results = await Promise.allSettled(
      defaults.map(d =>
        this.leavePolicyModel.findOneAndUpdate(
          { tenantId: tid, code: d.code },
          { $setOnInsert: { ...d, tenantId: tid, isActive: true } },
          { upsert: true, new: true },
        ).lean(),
      ),
    );
    return { created: results.filter(r => r.status === 'fulfilled').length };
  }

  // ── REMINDERS (holidays + upcoming birthdays/anniversaries) ───────────

  async getHolidays(tenantId: string, schoolSlug: string) {
    return this.holidayModel.find({ schoolSlug }).sort({ date: 1 }).lean();
  }

  async createHoliday(tenantId: string, schoolSlug: string, dto: any) {
    return this.holidayModel.create({ ...dto, tenantId: this.newTid(tenantId), schoolSlug });
  }

  async updateHoliday(id: string, schoolSlug: string, dto: any) {
    const holiday = await this.holidayModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!holiday) throw new NotFoundException('Holiday not found');
    return holiday;
  }

  async deleteHoliday(id: string, schoolSlug: string) {
    const result = await this.holidayModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Holiday not found');
    return { message: 'Holiday deleted' };
  }

  // Upcoming birthdays, work anniversaries, and holidays in the next `withinDays`
  // days — computed live from Staff.dateOfBirth / Staff.dateOfJoining rather than
  // needing a separate record per person per year.
  async getUpcomingReminders(tenantId: string, schoolSlug: string, withinDays = 30) {
    const tid = this.newTid(tenantId);
    const staffList = await this.staffModel
      .find({ tenantId: tid, isActive: true }, { firstName: 1, lastName: 1, dateOfBirth: 1, dateOfJoining: 1, department: 1 })
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextOccurrence = (date: Date) => {
      const d = new Date(date);
      const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      return next;
    };
    const daysUntil = (d: Date) => Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const birthdays: any[] = [];
    const anniversaries: any[] = [];
    for (const s of staffList) {
      const name = `${s.firstName} ${s.lastName}`;
      if (s.dateOfBirth) {
        const next = nextOccurrence(s.dateOfBirth);
        const inDays = daysUntil(next);
        if (inDays <= withinDays) birthdays.push({ staffId: s._id, name, department: s.department, date: next, inDays, type: 'birthday' });
      }
      if (s.dateOfJoining) {
        const next = nextOccurrence(s.dateOfJoining);
        const inDays = daysUntil(next);
        const years = next.getFullYear() - new Date(s.dateOfJoining).getFullYear();
        if (inDays <= withinDays && years > 0) anniversaries.push({ staffId: s._id, name, department: s.department, date: next, inDays, years, type: 'anniversary' });
      }
    }

    const holidays = await this.holidayModel
      .find({ schoolSlug, date: { $gte: today, $lte: new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000) } })
      .sort({ date: 1 })
      .lean();

    return {
      birthdays: birthdays.sort((a, b) => a.inDays - b.inDays),
      anniversaries: anniversaries.sort((a, b) => a.inDays - b.inDays),
      holidays: holidays.map(h => ({ ...h, type: 'holiday', inDays: daysUntil(new Date(h.date)) })),
    };
  }

  // ── EXIT SETTINGS ──────────────────────────────────────────────────────

  private readonly DEFAULT_CLEARANCE_CHECKLIST = [
    { department: 'IT', item: 'Return laptop/equipment' },
    { department: 'IT', item: 'Disable system access' },
    { department: 'IT', item: 'Handover email account' },
    { department: 'Library', item: 'Return library books/materials' },
    { department: 'Finance', item: 'Clear outstanding dues' },
    { department: 'Finance', item: 'Final salary processed' },
    { department: 'HR', item: 'Return ID card' },
    { department: 'HR', item: 'Complete exit interview' },
    { department: 'HR', item: 'Issue experience letter' },
    { department: 'Academic', item: 'Handover classes/subjects' },
    { department: 'Academic', item: 'Submit lesson plans/records' },
  ];
  private readonly DEFAULT_EXIT_INTERVIEW_QUESTIONS = [
    'What is your primary reason for leaving?',
    'How would you rate your overall experience working here?',
    'Did you feel supported by your manager and colleagues?',
    'What could we have done differently to retain you?',
    'Would you consider working here again in the future?',
  ];

  async getExitSettings(tenantId: string, schoolSlug: string) {
    const existing = await this.exitSettingsModel.findOne({ schoolSlug }).lean();
    if (existing) return existing;
    // Seed with the same sensible defaults every exit record used to get hardcoded —
    // fully editable from here on, nothing locked in.
    return this.exitSettingsModel.create({
      tenantId: this.newTid(tenantId),
      schoolSlug,
      defaultNoticePeriodDays: 30,
      noticePeriodDaysByEmploymentType: { permanent: 30, contract: 15, probation: 7, part_time: 7 },
      clearanceChecklistTemplate: this.DEFAULT_CLEARANCE_CHECKLIST,
      exitInterviewQuestions: this.DEFAULT_EXIT_INTERVIEW_QUESTIONS,
    });
  }

  async updateExitSettings(tenantId: string, schoolSlug: string, dto: any) {
    await this.getExitSettings(tenantId, schoolSlug); // ensure a doc exists to update
    return this.exitSettingsModel.findOneAndUpdate({ schoolSlug }, { $set: dto }, { new: true });
  }

  // ── HIRING SETTINGS ────────────────────────────────────────────────────

  async getHiringSettings(tenantId: string, schoolSlug: string) {
    const existing = await this.hiringSettingsModel.findOne({ schoolSlug }).lean();
    if (existing) return existing;
    return this.hiringSettingsModel.create({ tenantId: this.newTid(tenantId), schoolSlug });
  }

  async updateHiringSettings(tenantId: string, schoolSlug: string, dto: any) {
    await this.getHiringSettings(tenantId, schoolSlug);
    return this.hiringSettingsModel.findOneAndUpdate({ schoolSlug }, { $set: dto }, { new: true });
  }

  // ── ATTENDANCE SETTINGS ────────────────────────────────────────────────

  async getAttendanceSettings(tenantId: string, schoolSlug: string) {
    const existing = await this.attendanceSettingsModel.findOne({ schoolSlug }).lean();
    if (existing) return existing;
    return this.attendanceSettingsModel.create({ tenantId: this.newTid(tenantId), schoolSlug });
  }

  async updateAttendanceSettings(tenantId: string, schoolSlug: string, dto: any) {
    await this.getAttendanceSettings(tenantId, schoolSlug);
    return this.attendanceSettingsModel.findOneAndUpdate({ schoolSlug }, { $set: dto }, { new: true });
  }

  // ── SHIFTS ───────────────────────────────────────────────────────────
  // Shift definitions are the real dependency underneath accurate attendance:
  // a single school-wide "standard check-in time" breaks down the moment a
  // school has staff on different schedules (admin vs teaching, or rotating
  // duty shifts at a boarding school). Staff get assigned a shift; attendance
  // status is computed against THEIR shift, falling back to whichever shift
  // is marked as the school's default, then to AttendanceSettings if no
  // shifts are configured at all.

  async getShifts(tenantId: string, schoolSlug: string) {
    return this.shiftModel.find({ schoolSlug }).sort({ isDefault: -1, name: 1 }).lean();
  }

  async createShift(tenantId: string, schoolSlug: string, dto: any) {
    if (dto.isDefault) await this.shiftModel.updateMany({ schoolSlug }, { $set: { isDefault: false } });
    return this.shiftModel.create({ ...dto, tenantId: this.newTid(tenantId), schoolSlug });
  }

  async updateShift(id: string, schoolSlug: string, dto: any) {
    if (dto.isDefault) await this.shiftModel.updateMany({ schoolSlug, _id: { $ne: id } }, { $set: { isDefault: false } });
    const shift = await this.shiftModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  async deleteShift(id: string, schoolSlug: string) {
    const inUse = await this.staffModel.countDocuments({ schoolSlug, shiftId: this.newTid(id) } as any);
    if (inUse > 0) {
      throw new BadRequestException(`This shift is assigned to ${inUse} staff member(s) — reassign them first or deactivate the shift instead of deleting it`);
    }
    const result = await this.shiftModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Shift not found');
    return { message: 'Shift deleted' };
  }

  async assignStaffShift(staffId: string, tenantId: string, shiftId: string | null) {
    const staff = await this.staffModel.findOneAndUpdate(
      { _id: staffId, tenantId: this.newTid(tenantId) },
      { $set: { shiftId: shiftId ? this.newTid(shiftId) : null } },
      { new: true },
    );
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  // Computes present/late/half_day from a raw "HH:mm" check-in time using the
  // school's configured grace period and half-day cutoff, instead of every
  // imported row silently defaulting to 'present' regardless of when someone
  // actually checked in.
  private computeAttendanceStatus(checkInTime: string, settings: any): string {
    if (!checkInTime) return 'absent';
    const toMinutes = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const checkInMins = toMinutes(checkInTime);
    const standardMins = toMinutes(settings.standardCheckInTime || '08:00');
    const halfDayCutoffMins = toMinutes(settings.halfDayCutoffTime || '13:00');
    const graceMins = settings.graceMinutes ?? 15;
    const lateThresholdMins = settings.lateThresholdMinutes ?? 60;

    if (checkInMins >= halfDayCutoffMins) return 'half_day';
    const lateBy = checkInMins - standardMins;
    if (lateBy <= graceMins) return 'present';
    if (lateBy <= graceMins + lateThresholdMins) return 'late';
    return 'half_day';
  }

  // ── GRIEVANCE ────────────────────────────────────────────────────────
  // Deliberately narrow first version: status workflow + basic case
  // tracking, not a full investigation toolkit.

  // SLA target (days to first resolution) by priority — used to auto-set dueDate on creation.
  private readonly GRIEVANCE_SLA_DAYS: Record<string, number> = { urgent: 2, high: 5, medium: 10, low: 20 };

  private withOverdue(g: any) {
    const isOverdue = !!g.dueDate && !['resolved', 'dismissed'].includes(g.status) && new Date(g.dueDate).getTime() < Date.now();
    return { ...g, isOverdue };
  }

  async getGrievances(tenantId: string, filters: { status?: string; staffId?: string; category?: string; priority?: string } = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (filters.status) filter.status = filters.status;
    if (filters.staffId) filter.raisedByStaffId = this.newTid(filters.staffId);
    if (filters.category) filter.category = filters.category;
    if (filters.priority) filter.priority = filters.priority;
    const rows = await this.grievanceModel.find(filter).sort({ createdAt: -1 }).lean();
    return rows.map((g) => this.withOverdue(g));
  }

  async getGrievanceById(tenantId: string, id: string) {
    const g = await this.grievanceModel.findOne({ _id: id, tenantId: this.newTid(tenantId) }).lean();
    if (!g) throw new NotFoundException('Grievance not found');
    return this.withOverdue(g);
  }

  async createGrievance(tenantId: string, institutionId: string, schoolSlug: string, dto: any) {
    const count = await this.grievanceModel.countDocuments({ tenantId: this.newTid(tenantId) });
    const caseNo = `GRV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const priority = dto.priority || 'medium';
    const slaDays = this.GRIEVANCE_SLA_DAYS[priority] ?? 10;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + slaDays);
    return this.grievanceModel.create({
      ...dto, caseNo, priority, dueDate,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      schoolSlug,
      timeline: [{ note: 'Grievance submitted', byName: dto.raisedByName || 'Staff', status: 'submitted', at: new Date() }],
    });
  }

  async updateGrievanceStatus(tenantId: string, id: string, status: string, note: string, byName: string) {
    const update: any = {
      $set: { status },
      $push: { timeline: { note: note || `Status changed to ${status}`, byName: byName || 'HR', status, at: new Date() } },
    };
    if (status === 'resolved') { update.$set.resolvedAt = new Date(); }
    const g = await this.grievanceModel.findOneAndUpdate({ _id: id, tenantId: this.newTid(tenantId) }, update, { new: true });
    if (!g) throw new NotFoundException('Grievance not found');
    return g;
  }

  async assignGrievance(tenantId: string, id: string, assignedToStaffId: string, assignedToName: string) {
    const g = await this.grievanceModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      {
        $set: { assignedToStaffId: this.newTid(assignedToStaffId), assignedToName, status: 'investigating' },
        $push: { timeline: { note: `Assigned to ${assignedToName}`, byName: 'HR', status: 'investigating', at: new Date() } },
      },
      { new: true },
    );
    if (!g) throw new NotFoundException('Grievance not found');
    return g;
  }

  // ── DAILY WORK SUMMARY ───────────────────────────────────────────────
  // Intentionally a lightweight accountability log, not a task tracker.

  async getDailyWorkSummaries(tenantId: string, filters: { staffId?: string; date?: string; from?: string; to?: string } = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (filters.staffId) filter.staffId = this.newTid(filters.staffId);
    if (filters.date) filter.date = new Date(filters.date);
    else if (filters.from || filters.to) {
      filter.date = {};
      if (filters.from) filter.date.$gte = new Date(filters.from);
      if (filters.to) filter.date.$lte = new Date(filters.to);
    }
    return this.dailyWorkSummaryModel.find(filter).sort({ date: -1 }).lean();
  }

  async upsertDailyWorkSummary(tenantId: string, schoolSlug: string, dto: any) {
    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);
    return this.dailyWorkSummaryModel.findOneAndUpdate(
      { tenantId: this.newTid(tenantId), staffId: this.newTid(dto.staffId), date },
      { $set: { ...dto, date, tenantId: this.newTid(tenantId), schoolSlug, acknowledged: false } },
      { upsert: true, new: true },
    );
  }

  async acknowledgeDailyWorkSummary(tenantId: string, id: string, byName: string) {
    const s = await this.dailyWorkSummaryModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $set: { acknowledged: true, acknowledgedBy: byName, acknowledgedAt: new Date() } },
      { new: true },
    );
    if (!s) throw new NotFoundException('Daily work summary not found');
    return s;
  }

  // Manager rollup for a given day: who submitted, and who's missing.
  async getDailyWorkSummaryRollup(tenantId: string, schoolSlug: string, dateStr: string) {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const [staffList, submitted] = await Promise.all([
      this.staffModel.find({ tenantId: this.newTid(tenantId), isActive: true }, { firstName: 1, lastName: 1, department: 1 }).lean(),
      this.dailyWorkSummaryModel.find({ tenantId: this.newTid(tenantId), date }).lean(),
    ]);
    const submittedStaffIds = new Set(submitted.map((s: any) => String(s.staffId)));
    const missing = staffList.filter((s: any) => !submittedStaffIds.has(String(s._id)))
      .map((s: any) => ({ staffId: s._id, name: `${s.firstName} ${s.lastName}`, department: s.department }));
    return { submitted, missing, totalStaff: staffList.length };
  }

  // ── EXPENSE CLAIMS ───────────────────────────────────────────────────

  async getExpenseClaims(tenantId: string, filters: { status?: string; staffId?: string } = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (filters.status) filter.status = filters.status;
    if (filters.staffId) filter.staffId = this.newTid(filters.staffId);
    return this.expenseClaimModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createExpenseClaim(tenantId: string, institutionId: string, schoolSlug: string, dto: any) {
    const count = await this.expenseClaimModel.countDocuments({ tenantId: this.newTid(tenantId) });
    const claimNo = `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    return this.expenseClaimModel.create({
      ...dto, claimNo,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      schoolSlug,
    });
  }

  async addExpenseClaimReceipt(tenantId: string, id: string, file: Express.Multer.File, schoolSlug: string) {
    const result = await this.uploadService.uploadFile(file, 'expense-receipts', schoolSlug);
    const claim = await this.expenseClaimModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $push: { receipts: { label: file.originalname, url: result.url, key: result.key, fileName: result.fileName } } },
      { new: true },
    );
    if (!claim) throw new NotFoundException('Expense claim not found');
    return claim;
  }

  async updateExpenseClaimStatus(tenantId: string, id: string, status: string, schoolSlug?: string, approvedBy?: string, rejectionReason?: string) {
    const update: any = { $set: { status } };
    if (status === 'approved') { update.$set.approvedBy = approvedBy; update.$set.approvedAt = new Date(); }
    if (status === 'rejected') { update.$set.rejectionReason = rejectionReason; }

    const claim = await this.expenseClaimModel.findOneAndUpdate({ _id: id, tenantId: this.newTid(tenantId) }, update, { new: true });
    if (!claim) throw new NotFoundException('Expense claim not found');

    // If this claim settles an advance, roll the amount into the advance's
    // settled total once approved.
    if (status === 'approved' && claim.advanceId) {
      await this.advanceModel.updateOne(
        { _id: claim.advanceId },
        [{ $set: { settledAmount: { $add: ['$settledAmount', claim.amount] } } }] as any,
      );
    }

    // Only post here for direct settlement — a payroll-settlement claim
    // gets its GL posting when it's actually folded into a payslip
    // (createPayslip), otherwise it would be double-counted once at
    // approval and again at payroll time. If the claim settles a prior
    // advance, credit Employee Advances instead of creating a new payable —
    // the employee was already paid when the advance was disbursed.
    if (status === 'approved' && claim.settlementMethod === 'direct') {
      await this.safePostJournal(schoolSlug, {
        date: new Date(), reference: claim.claimNo, narration: `Expense claim ${claim.claimNo} — ${claim.staffName}`,
        sourceType: 'expense_claim', sourceId: String(claim._id),
        lines: [
          { accountCode: '5500', debit: claim.amount, partnerType: 'staff', partnerId: String(claim.staffId), partnerName: claim.staffName },
          { accountCode: claim.advanceId ? '1300' : '2000', credit: claim.amount, partnerType: 'staff', partnerId: String(claim.staffId), partnerName: claim.staffName },
        ],
      });
    }
    return claim;
  }

  // ── ADVANCES ─────────────────────────────────────────────────────────

  async getAdvances(tenantId: string, filters: { status?: string; staffId?: string } = {}) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (filters.status) filter.status = filters.status;
    if (filters.staffId) filter.staffId = this.newTid(filters.staffId);
    return this.advanceModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createAdvance(tenantId: string, institutionId: string, schoolSlug: string, dto: any) {
    const count = await this.advanceModel.countDocuments({ tenantId: this.newTid(tenantId) });
    const advanceNo = `ADV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    return this.advanceModel.create({
      ...dto, advanceNo,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
      schoolSlug,
    });
  }

  async updateAdvanceStatus(tenantId: string, id: string, status: string, schoolSlug?: string, approvedBy?: string) {
    const update: any = { $set: { status } };
    if (status === 'approved') { update.$set.approvedBy = approvedBy; update.$set.approvedAt = new Date(); }
    if (status === 'disbursed') { update.$set.disbursedAt = new Date(); }
    const advance = await this.advanceModel.findOneAndUpdate({ _id: id, tenantId: this.newTid(tenantId) }, update, { new: true });
    if (!advance) throw new NotFoundException('Advance not found');

    if (status === 'disbursed') {
      await this.safePostJournal(schoolSlug, {
        date: new Date(), reference: advance.advanceNo, narration: `Advance disbursed — ${advance.staffName} — ${advance.reason}`,
        sourceType: 'advance', sourceId: String(advance._id),
        lines: [
          { accountCode: '1300', debit: advance.amount, partnerType: 'staff', partnerId: String(advance.staffId), partnerName: advance.staffName },
          { accountCode: '1000', credit: advance.amount, partnerType: 'staff', partnerId: String(advance.staffId), partnerName: advance.staffName },
        ],
      });
    }
    return advance;
  }
}
