import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as net from 'net';
import { UploadService } from '../../upload/upload.service';
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
import { LeaveBalance, LeaveBalanceDocument } from './schemas/leave-balance.schema';
import { PayrollRun, PayrollRunDocument } from './schemas/payroll-run.schema';
import { Payslip, PayslipDocument } from './schemas/payslip.schema';
import { SalaryComponent, SalaryComponentDocument } from './schemas/salary-component.schema';
import { PerformanceReview, PerformanceReviewDocument } from './schemas/performance-review.schema';
import { Training, TrainingDocument } from './schemas/training.schema';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { School, SchoolDocument } from '../../organization/schemas/organization.schema';
import { StaffContract, StaffContractDocument } from './schemas/staff-contract.schema';
import { ExitRecord, ExitRecordDocument } from './schemas/exit-record.schema';
import { LeavePolicy, LeavePolicyDocument } from './schemas/leave-policy.schema';
import { BiometricConfig, BiometricConfigDocument } from './schemas/biometric-config.schema';

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
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    private readonly uploadService: UploadService,
  ) {}

  private newTid(t: string) { return t; }

  // ── Staff ────────────────────────────────────────────────────────────

  async getStaff(tenantId: string) {
    return this.staffModel
      .find({ tenantId: this.newTid(tenantId), isActive: true })
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

    return { email: user.email, tempPassword, primaryRole: user.primaryRole };
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
        return { ok: true as const, name: `${staff.firstName} ${staff.lastName}`, email: result.email, tempPassword: result.tempPassword };
      } catch (err: any) {
        return { ok: false as const, name: `${staff.firstName} ${staff.lastName}`, reason: err?.message || 'Failed' };
      }
    }));

    const created = results.filter(r => r.ok).map(r => ({ name: r.name, email: (r as any).email, tempPassword: (r as any).tempPassword }));
    const skipped = results.filter(r => !r.ok).map(r => ({ name: r.name, reason: (r as any).reason }));
    return { created, skipped, totalCreated: created.length, totalSkipped: skipped.length };
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

  async importAttendanceCsv(tenantId: string, institutionId: string, file: Express.Multer.File) {
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

    const staffList = await this.staffModel.find({ tenantId: this.newTid(tenantId) }).select('employeeId').lean();
    const employeeIdMap = new Map(staffList.map(s => [s.employeeId, s._id.toString()]));

    const ops: any[] = [];
    const skipped: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const rawId = cols[idCol];
      const staffId = Types.ObjectId.isValid(rawId) ? rawId : employeeIdMap.get(rawId);
      const date = cols[dateCol];
      if (!staffId || !date) { skipped.push(i + 1); continue; }
      ops.push({
        updateOne: {
          filter: { tenantId: this.newTid(tenantId), staffId: this.newTid(staffId), date: new Date(date) },
          update: {
            $set: {
              tenantId: this.newTid(tenantId),
              institutionId: this.newTid(institutionId),
              staffId: this.newTid(staffId),
              date: new Date(date),
              checkInTime: checkInCol !== -1 ? cols[checkInCol] || '' : '',
              checkOutTime: checkOutCol !== -1 ? cols[checkOutCol] || '' : '',
              status: statusCol !== -1 ? cols[statusCol] || 'present' : 'present',
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

  async updatePayrollStatus(tenantId: string, id: string, status: string, userId: string) {
    return this.payrollRunModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $set: { status, approvedBy: this.newTid(userId), approvedAt: new Date() } },
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

  async createPayslip(tenantId: string, institutionId: string, data: any) {
    const periodLabel = `${new Date(data.year, data.month - 1).toLocaleString('default', { month: 'long' })} ${data.year}`;
    const totalDeductions = (data.incomeTax || 0) + (data.providentFund || 0) + (data.loanDeduction || 0) + (data.leaveDeduction || 0) + (data.otherDeductions || 0);
    const netSalary = (data.grossSalary || 0) - totalDeductions;
    return this.payslipModel.create({
      ...data, periodLabel, totalDeductions, netSalary,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
    });
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
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.11, 0.23, 0.37);
    const gray = rgb(0.42, 0.45, 0.5);
    const lightGray = rgb(0.95, 0.96, 0.97);
    let y = 800;

    const drawText = (text: string, x: number, yPos: number, opts: { size?: number; f?: any; color?: any } = {}) => {
      page.drawText(text ?? '', { x, y: yPos, size: opts.size ?? 10, font: opts.f ?? font, color: opts.color ?? rgb(0.15, 0.15, 0.18) });
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

  async createExitRecord(tenantId: string, institutionId: string, data: any, userId: string) {
    const clearanceChecklist = [
      { department: 'IT', item: 'Return laptop/equipment', isDone: false },
      { department: 'IT', item: 'Disable system access', isDone: false },
      { department: 'IT', item: 'Handover email account', isDone: false },
      { department: 'Library', item: 'Return library books/materials', isDone: false },
      { department: 'Finance', item: 'Clear outstanding dues', isDone: false },
      { department: 'Finance', item: 'Final salary processed', isDone: false },
      { department: 'HR', item: 'Return ID card', isDone: false },
      { department: 'HR', item: 'Complete exit interview', isDone: false },
      { department: 'HR', item: 'Issue experience letter', isDone: false },
      { department: 'Academic', item: 'Handover classes/subjects', isDone: false },
      { department: 'Academic', item: 'Submit lesson plans/records', isDone: false },
    ];
    return this.exitRecordModel.create({
      ...data, clearanceChecklist,
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
}
