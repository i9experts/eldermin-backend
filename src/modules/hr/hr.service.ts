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
import { computeSalaryStructure, validateSalaryComponentGraph, CircularSalaryComponentError, ComputedSalaryLine } from './salary-calc.util';
import { renderOfferLetterTemplate } from './offer-letter-template.util';
import { sanitizeSelfLeaveInput } from './leave-self.util';
import { Payslip, PayslipDocument } from './schemas/payslip.schema';
import { PayrollPayment, PayrollPaymentDocument } from './schemas/payroll-payment.schema';
import { BankAccount, BankAccountDocument } from '../../finance/schemas/finance.schema';
import { SalaryComponent, SalaryComponentDocument } from './schemas/salary-component.schema';
import { SalaryTemplate, SalaryTemplateDocument } from './schemas/salary-template.schema';
import { PerformanceReview, PerformanceReviewDocument } from './schemas/performance-review.schema';
import { Training, TrainingDocument } from './schemas/training.schema';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import { School, SchoolDocument } from '../../organization/schemas/organization.schema';
import { StaffContract, StaffContractDocument } from './schemas/staff-contract.schema';
import { ContractTemplate, ContractTemplateDocument } from './schemas/contract-template.schema';
import { PdfService } from '../../pdf/pdf.service';
import { OfferLetter, OfferLetterDocument } from './schemas/offer-letter.schema';
import { OfferLetterTemplate, OfferLetterTemplateDocument } from './schemas/offer-letter-template.schema';
import { AppointmentLetter, AppointmentLetterDocument } from './schemas/appointment-letter.schema';
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
    @InjectModel(PayrollPayment.name) private payrollPaymentModel: Model<PayrollPaymentDocument>,
    @InjectModel(BankAccount.name) private bankAccountModel: Model<BankAccountDocument>,
    @InjectModel(SalaryComponent.name) private salaryComponentModel: Model<SalaryComponentDocument>,
    @InjectModel(SalaryTemplate.name) private salaryTemplateModel: Model<SalaryTemplateDocument>,
    @InjectModel(PerformanceReview.name) private performanceModel: Model<PerformanceReviewDocument>,
    @InjectModel(Training.name) private trainingModel: Model<TrainingDocument>,
    @InjectModel(StaffContract.name) private contractModel: Model<StaffContractDocument>,
    @InjectModel(ContractTemplate.name) private contractTemplateModel: Model<ContractTemplateDocument>,
    @InjectModel(OfferLetter.name) private offerLetterModel: Model<OfferLetterDocument>,
    @InjectModel(OfferLetterTemplate.name) private offerLetterTemplateModel: Model<OfferLetterTemplateDocument>,
    @InjectModel(AppointmentLetter.name) private appointmentLetterModel: Model<AppointmentLetterDocument>,
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
    private readonly pdfService: PdfService,
  ) {}

  // Ledger postings must never block the underlying HR transaction (payroll
  // must still process even if, say, COA hasn't been seeded for this school
  // yet) — errors are swallowed here and show up as gaps in the Trial
  // Balance instead of a hard failure on payroll/claims/advances.
  //
  // Real gap found in QA: seedDefaultCOA was only ever triggered by a
  // manual admin action in Finance settings - a school that never clicked
  // it had EVERY payroll/advance/claim GL posting fail silently, forever,
  // with zero visibility anywhere (payslips, PDFs, Mark Paid all "worked"
  // normally while Finance stayed completely empty). Self-healing now:
  // on the specific "account not found" failure, auto-seed (idempotent -
  // upsert-only, never touches an already-configured COA) and retry once.
  // Zero extra cost for a school that's already set up (no error, no
  // retry path taken); one-time self-heal for one that was never seeded.
  private async safePostJournal(schoolSlug: string | undefined, dto: Parameters<FinanceService['postJournalEntry']>[1]) {
    if (!schoolSlug) return;
    try {
      await this.financeService.postJournalEntry(schoolSlug, dto);
    } catch (err: any) {
      if (err?.message?.includes('not found') && err?.message?.includes('Suspense')) {
        try {
          await this.financeService.seedDefaultCOA(schoolSlug);
          await this.financeService.postJournalEntry(schoolSlug, dto);
        } catch (retryErr) { /* genuinely failed even after self-heal attempt - swallowed per the comment above */ }
      }
      /* other failures swallowed per the comment above */
    }
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

  // Shared by createStaff (HR-01: optional salary structure at enrollment
  // time) and setStaffSalaryStructure (Payroll tab, pre-existing) so both
  // go through the exact same calculation engine and validation rather than
  // duplicating the amount-resolution logic. See salary-calc.util.ts.
  private async resolveSalaryStructureFromLines(schoolSlug: string, lines: { componentId: string; amount: number }[]) {
    const components = await this.salaryComponentModel.find({ schoolSlug, _id: { $in: lines.map(l => this.newTid(l.componentId)) } }).lean();
    const componentMap = new Map(components.map((c: any) => [String(c._id), c]));
    const overrideByCode: Record<string, number> = {};
    for (const l of lines) {
      const comp = componentMap.get(l.componentId);
      if (comp) overrideByCode[comp.code] = l.amount;
    }
    let result;
    try {
      result = computeSalaryStructure(components as any, overrideByCode);
    } catch (err) {
      if (err instanceof CircularSalaryComponentError) throw new BadRequestException(err.message);
      throw err;
    }
    const salaryStructure = result.lines
      .filter(l => componentMap.has(String(l.componentId)))
      .map(l => ({ componentId: l.componentId, code: l.code, name: l.name, type: l.type, amount: l.amount }));
    return { salaryStructure, grossSalary: result.grossSalary };
  }

  // HR-01: enrollment can now optionally assign real salary-structure
  // components (data.salaryStructureLines: {componentId, amount}[], built
  // from this school's own SalaryComponent list, same shape Payroll's
  // "Assign Structure" sends) at creation time, going through the exact
  // same computeSalaryStructure engine/validation Payroll already uses.
  // Strictly additive: when salaryStructureLines is absent/empty, behaviour
  // is byte-for-byte the same as before this change - only a flat
  // data.salary is stored, and structure stays assignable later via
  // Payroll exactly as today.
  async createStaff(tenantId: string, data: any, schoolSlug?: string) {
    let employeeId = data.employeeId;
    if (!employeeId) {
      const last = await this.staffModel
        .findOne({ tenantId: this.newTid(tenantId) })
        .sort({ employeeId: -1 })
        .lean();
      const lastNum = last?.employeeId ? parseInt(last.employeeId.match(/(\d+)$/)?.[1] ?? '0', 10) : 0;
      employeeId = `EMP-${String(lastNum + 1).padStart(3, '0')}`;
    }

    const { salaryStructureLines, ...rest } = data;
    let extra: any = {};
    if (Array.isArray(salaryStructureLines) && salaryStructureLines.length > 0 && schoolSlug) {
      const { salaryStructure, grossSalary } = await this.resolveSalaryStructureFromLines(schoolSlug, salaryStructureLines);
      extra = { salaryStructure, salary: grossSalary };
    }

    return this.staffModel.create({ ...rest, ...extra, employeeId, tenantId: this.newTid(tenantId) });
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
      // UTC, matching how markStaffAttendance/deleteStaffAttendance store
      // `date` (new Date("YYYY-MM-DD") is always UTC midnight) - a local-time
      // construction here would drift by the server's UTC offset and could
      // silently exclude the last day of the month from results.
      const start = new Date(Date.UTC(query.year, query.month - 1, 1));
      const end = new Date(Date.UTC(query.year, query.month, 0, 23, 59, 59, 999));
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

  /** Deletes specific staff members' attendance records for one date -
   * the real gap behind the toolbar's delete icon in the comparison
   * screenshot. Scoped to (tenantId, date, staffId in [...]) rather than
   * accepting raw record ids, since the frontend already tracks
   * selection by staffId for this exact screen. */
  async deleteStaffAttendance(tenantId: string, date: string, staffIds: string[]) {
    if (!staffIds?.length) throw new BadRequestException('No staff selected to delete attendance for');
    const result = await this.staffAttendanceModel.deleteMany({
      tenantId: this.newTid(tenantId), date: new Date(date), staffId: { $in: staffIds.map((id) => this.newTid(id)) },
    });
    return { deletedCount: result.deletedCount };
  }

  async getAttendanceSummary(tenantId: string, month: number, year: number) {
    // Same UTC-vs-local fix as getStaffAttendance above - this feeds payroll's
    // attendance-based deductions, so a dropped last-day-of-month record here
    // understates absences for the period.
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
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

    const staffList = await this.staffModel.find({ tenantId: this.newTid(tenantId) }).select('employeeId shiftId shiftIds').lean();
    const employeeIdMap = new Map(staffList.map(s => [s.employeeId, s._id.toString()]));
    // shiftIds (new, multi-shift) takes priority; legacy single shiftId is
    // the fallback for staff never migrated to the new array - both keep
    // working, nothing silently breaks for an already-configured school.
    const staffShiftsMap = new Map(staffList.map((s: any) => {
      const ids: string[] = (s.shiftIds && s.shiftIds.length > 0) ? s.shiftIds.map((id: any) => String(id)) : (s.shiftId ? [String(s.shiftId)] : []);
      return [String(s._id), ids];
    }));

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
        const assignedIds = staffShiftsMap.get(String(staffId)) || [];
        const assignedShifts = assignedIds.map(id => shiftById.get(id)).filter(Boolean);
        // A specific date this person was actually assigned a shift for -
        // e.g. their Mon-Thu shift on a Monday, their Friday-only shift on
        // a Friday, or their Saturday shift only on a Saturday that isn't
        // off under that shift's own policy.
        const resolvedShift = this.resolveShiftForDate(assignedShifts, new Date(date)) || defaultShift;
        const rule = resolvedShift
          ? {
              standardCheckInTime: resolvedShift.startTime,
              graceMinutes: resolvedShift.graceMinutes,
              lateThresholdMinutes: resolvedShift.lateThresholdMinutes,
              halfDayCutoffTime: resolvedShift.halfDayCutoffTime || attendanceSettings?.halfDayCutoffTime,
            }
          : attendanceSettings;
        // No shift (assigned or default) covers this exact date - most
        // likely a policy-driven day off (e.g. an alternate Saturday) or a
        // day genuinely outside anyone's working days. Not an absence -
        // there was never an expectation of showing up.
        if (!resolvedShift && assignedShifts.length > 0) {
          status = 'weekend';
        } else {
          status = rule ? this.computeAttendanceStatus(checkInTime, rule) : 'present';
        }
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

  // Shared formatting for a single staff member's leave balance — used by
  // both the HR admin bulk view (getAllLeaveBalances) and the Teacher
  // self-service view (getMyLeaveBalance), so the two never drift apart.
  private formatLeaveBalance(s: any, bal: any, hasPolicy: boolean) {
    return {
      staffId: s._id, staffName: `${s.firstName} ${s.lastName}`, employeeId: s.employeeId,
      department: s.department || s.designationId?.name || '—',
      annual: { entitled: bal.annualEntitled ?? 0, used: bal.annualUsed ?? 0, remaining: (bal.annualEntitled ?? 0) - (bal.annualUsed ?? 0) },
      sick: { entitled: bal.sickEntitled ?? 0, used: bal.sickUsed ?? 0, remaining: (bal.sickEntitled ?? 0) - (bal.sickUsed ?? 0) },
      casual: { entitled: bal.casualEntitled ?? 0, used: bal.casualUsed ?? 0, remaining: (bal.casualEntitled ?? 0) - (bal.casualUsed ?? 0) },
      maternity: { entitled: bal.maternityEntitled ?? 0, used: bal.maternityUsed ?? 0, remaining: (bal.maternityEntitled ?? 0) - (bal.maternityUsed ?? 0) },
      paternity: { entitled: bal.paternityEntitled ?? 0, used: bal.paternityUsed ?? 0, remaining: (bal.paternityEntitled ?? 0) - (bal.paternityUsed ?? 0) },
      hajj: { entitled: bal.hajjEntitled ?? 0, used: bal.hajjUsed ?? 0, remaining: (bal.hajjEntitled ?? 0) - (bal.hajjUsed ?? 0) },
      hasPolicy,
    };
  }

  async getAllLeaveBalances(tenantId: string) {
    const tid = this.newTid(tenantId);
    const [staffList, balances] = await Promise.all([
      this.staffModel.find({ tenantId: tid, isActive: true }, { firstName: 1, lastName: 1, employeeId: 1, department: 1, designationId: 1 }).populate('designationId', 'name').lean(),
      this.leaveBalanceModel.find({ tenantId: tid }).lean(),
    ]);
    const byStaff = new Map((balances as any[]).map((b: any) => [String(b.staffId), b]));
    return (staffList as any[]).map((s: any) =>
      this.formatLeaveBalance(s, byStaff.get(String(s._id)) || {}, byStaff.has(String(s._id))),
    );
  }

  // ── Self-service (leave:self) ───────────────────────────────────────
  // Resolves the caller's OWN Staff record from req.user.userId — never
  // from a client-supplied staff/employee id — so a Teacher can only ever
  // read or write their own leave data via these methods.

  async getOwnStaffRecord(tenantId: string, userId: string): Promise<StaffDocument> {
    const staff = await this.staffModel.findOne({ tenantId: this.newTid(tenantId), userId: this.newTid(userId) });
    if (!staff) throw new NotFoundException('No staff record is linked to your account. Contact HR to have your login connected to your employee record.');
    return staff;
  }

  async getMyLeaveBalance(tenantId: string, userId: string) {
    const staff = await this.getOwnStaffRecord(tenantId, userId);
    const bal = await this.leaveBalanceModel.findOne({ tenantId: this.newTid(tenantId), staffId: staff._id }).lean();
    return this.formatLeaveBalance(staff, bal || {}, !!bal);
  }

  async getMyLeaveApplications(tenantId: string, userId: string) {
    const staff = await this.getOwnStaffRecord(tenantId, userId);
    return this.getLeaveApplications(tenantId, { staffId: String(staff._id) });
  }

  async createMyLeaveApplication(tenantId: string, institutionId: string, userId: string, data: any) {
    const staff = await this.getOwnStaffRecord(tenantId, userId);
    const safe = sanitizeSelfLeaveInput(data);
    // staffId/staffName/staffEmployeeId/department are always taken from the
    // server-resolved Staff record, never from client input — this is what
    // makes the endpoint "self only" rather than "any staff id the client sends".
    return this.createLeaveApplication(tenantId, institutionId, {
      ...safe,
      staffId: String(staff._id),
      staffName: `${staff.firstName} ${staff.lastName}`,
      staffEmployeeId: staff.employeeId,
      department: staff.department,
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

  async updatePayrollStatus(
    tenantId: string, id: string, status: string, userId: string, schoolSlug?: string,
    payment?: { paymentMethod?: string; bankAccountId?: string; referenceNumber?: string; paymentDate?: string },
  ) {
    if (!Object.keys(HrService.PAYROLL_TRANSITIONS).includes(status)) {
      throw new BadRequestException(`Invalid payroll status: ${status}`);
    }
    const run = await this.payrollRunModel.findOne({ _id: id, tenantId: this.newTid(tenantId) });
    if (!run) throw new NotFoundException('Payroll run not found');
    const fromStatus = run.status;
    const allowed = HrService.PAYROLL_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot move a payroll run from '${fromStatus}' to '${status}'.`);
    }
    if (status === 'paid') {
      if (!payment?.paymentMethod) throw new BadRequestException('paymentMethod is required to mark a payroll run as paid');
      if (payment.paymentMethod !== 'cash' && !payment.bankAccountId) {
        throw new BadRequestException('bankAccountId is required for a non-cash payment method');
      }
    }
    // Block the transition (and therefore all posting) outright if any
    // component actually used on this run's payslips has no GL mapping -
    // see PAY-03. Thrown before the status update below, so an incomplete
    // mapping never leaves the run half-approved or partially posted.
    if (status === 'approved') {
      await this.validatePayrollRunAccountMappings(tenantId, schoolSlug || '', id);
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
    if (status === 'paid') {
      update.paymentDate = payment?.paymentDate ? new Date(payment.paymentDate) : new Date();
    }
    const updated = await this.payrollRunModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $set: update },
      { new: true },
    ).lean();

    // GL posting is gated on the run actually reaching 'approved' here -
    // not at payslip creation time (see postPayslipToLedger) - so a run
    // still awaiting the school admin's review never touches Finance.
    if (status === 'approved') {
      const payslips = await this.payslipModel.find({ tenantId: this.newTid(tenantId), payrollRunId: this.newTid(id) }).lean();
      for (const payslip of payslips) {
        try {
          await this.postPayslipToLedger(schoolSlug, payslip);
        } catch { /* one payslip's posting failure must not block the rest - shows as a Trial Balance gap, same convention as safePostJournal */ }
      }
    }

    // Reverses whatever postPayslipToLedger already booked when an
    // approved run gets cancelled instead of paid - the other real gap
    // found in QA (see reversePayslipLedgerEntry). A run cancelled from
    // 'completed' never had anything posted in the first place, so there's
    // nothing to reverse there.
    if (status === 'cancelled' && fromStatus === 'approved') {
      const payslips = await this.payslipModel.find({ tenantId: this.newTid(tenantId), payrollRunId: this.newTid(id) }).lean();
      for (const payslip of payslips) {
        try {
          await this.reversePayslipLedgerEntry(schoolSlug, payslip);
        } catch { /* same isolation as above */ }
      }
    }

    // The actual payment action: settles Salaries Payable via a real bank
    // account or cash, following the exact pattern every other "settle a
    // payable" flow in this codebase uses (see FinanceService.
    // recordVendorPayment) - a dedicated PayrollPayment audit record, the
    // credit leg resolved by payment method (not hardcoded to Cash), and
    // bank account tagging/denormalization on the journal line. Only
    // netSalary + the non-tax deductions folded into 2100 per payslip is
    // cleared here - tax and PF stay untouched, owed to a different party
    // and settled by a separate remittance, not by paying the employee.
    if (status === 'paid') {
      const payslips = await this.payslipModel.find({ tenantId: this.newTid(tenantId), payrollRunId: this.newTid(id) }).lean();
      const totalPayable = payslips.reduce((sum, p: any) =>
        sum + (p.netSalary || 0) + (p.loanDeduction || 0) + (p.leaveDeduction || 0) + (p.otherDeductions || 0), 0);

      const paymentDate = update.paymentDate;
      const paymentMethod = payment!.paymentMethod!;
      let bankAccountName: string | undefined;
      if (payment?.bankAccountId) {
        const bankAcc = await this.bankAccountModel.findOne({ _id: payment.bankAccountId, schoolSlug }).lean();
        if (!bankAcc) throw new BadRequestException('Selected bank account was not found');
        bankAccountName = `${bankAcc.bankName} — ${bankAcc.accountTitle}`;
      }

      const paymentRecord = await this.payrollPaymentModel.create({
        tenantId: this.newTid(tenantId), payrollRunId: this.newTid(id), periodLabel: run.periodLabel,
        amount: totalPayable, paymentDate, paymentMethod,
        referenceNumber: payment?.referenceNumber,
        bankAccountId: payment?.bankAccountId, bankAccountName,
        paidBy: this.newTid(userId),
      });

      if (totalPayable > 0) {
        await this.safePostJournal(schoolSlug, {
          date: paymentDate, reference: run.periodLabel, narration: `Salary payment — ${run.periodLabel}`,
          sourceType: 'payroll_payment', sourceId: String(paymentRecord._id),
          lines: [
            { accountCode: '2100', debit: totalPayable },
            {
              accountCode: this.financeService.mapPaymentMethodToAccount(paymentMethod), credit: totalPayable,
              bankAccountId: payment?.bankAccountId, bankAccountName,
            },
          ],
        });
      }

      // Payslip.status/paidAt were stubbed fields nothing ever set - a
      // payslip stayed 'draft' forever even after its run was fully paid.
      await this.payslipModel.updateMany(
        { tenantId: this.newTid(tenantId), payrollRunId: this.newTid(id) },
        { $set: { status: 'paid', paidAt: paymentDate } },
      );
    }

    return updated;
  }

  async getPayrollPayments(tenantId: string, payrollRunId?: string) {
    const filter: any = { tenantId: this.newTid(tenantId) };
    if (payrollRunId) filter.payrollRunId = this.newTid(payrollRunId);
    return this.payrollPaymentModel.find(filter).sort({ createdAt: -1 }).lean();
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

    // Itemized component detail (see PAY-01/PAY-03) - the payroll grid
    // sends one line per configured SalaryComponent actually used on this
    // payslip (Basic, HRA, ... plus whichever dynamic components were
    // added), which is what lets postPayslipToLedger post each one to its
    // own configured GL account instead of one lump Salary Expense line.
    // A caller that doesn't send componentLines (an older client, or a
    // direct API call) still works exactly as before - GL posting falls
    // back to the legacy lump-sum behaviour for that payslip specifically.
    const componentLines = Array.isArray(data.componentLines)
      ? data.componentLines.map((l: any) => ({ code: l.code, name: l.name, type: l.type, amount: l.amount }))
      : [];
    if (reimbursement > 0) {
      componentLines.push({ code: 'REIMBURSEMENT', name: 'Expense Reimbursement', type: 'earning', amount: reimbursement });
    }

    const payslip = await this.payslipModel.create({
      ...data, periodLabel, totalDeductions, netSalary, otherAllowances, grossSalary, componentLines,
      tenantId: this.newTid(tenantId),
      institutionId: this.newTid(institutionId),
    });

    if (pendingClaims.length > 0) {
      await this.expenseClaimModel.updateMany(
        { _id: { $in: pendingClaims.map((c: any) => c._id) } },
        { $set: { settledInPayroll: true, settledPayslipId: payslip._id } },
      );
    }

    // GL posting is NOT done here anymore - see postPayslipToLedger below.
    // The real gap found in QA: a payroll run still sitting at 'completed'
    // (pending the school admin's review) already had its salary expense
    // and Salaries Payable booked into Finance the moment each payslip was
    // created during process-batch - a rejected/never-approved run's
    // numbers were indistinguishable from a real, approved one anywhere
    // in Finance. Posting is now deferred to the run's genuine 'approved'
    // transition (updatePayrollStatus), one run at a time, per payslip.

    return payslip;
  }

  /** Resolves each of the given SalaryComponent codes to its currently
   * configured GL accountCode. Used both to validate a whole payroll run
   * before it's allowed to be approved (see validatePayrollRunAccountMappings)
   * and, defensively, again at the moment each payslip is actually posted -
   * see PAY-03. Looked up fresh (not from whatever was cached on the
   * payslip at creation time) so a mapping fixed after payslips were
   * created but before the run is approved is picked up correctly. */
  private async resolveComponentAccountCodes(schoolSlug: string, codes: string[]): Promise<{ byCode: Record<string, string>; missing: string[] }> {
    const comps = await this.salaryComponentModel.find({ schoolSlug, code: { $in: codes } }).lean();
    const byCode: Record<string, string> = {};
    const missing: string[] = [];
    for (const code of codes) {
      const comp: any = comps.find((c: any) => c.code === code);
      if (comp?.accountCode) byCode[code] = comp.accountCode;
      else missing.push(comp?.name || code);
    }
    return { byCode, missing };
  }

  /** Blocks a payroll run from being approved (and therefore posted) if any
   * salary component actually used on its payslips has no Chart of
   * Accounts mapping configured - see PAY-03. Checked once, up front,
   * before the run's status changes or anything is posted, rather than
   * discovered payslip-by-payslip mid-approval. A run made up entirely of
   * legacy (pre-componentLines) payslips has nothing to itemize-validate
   * and is left exactly as before. */
  async validatePayrollRunAccountMappings(tenantId: string, schoolSlug: string, payrollRunId: string) {
    const payslips = await this.payslipModel.find({ tenantId: this.newTid(tenantId), payrollRunId: this.newTid(payrollRunId) }).lean();
    const codes = new Set<string>();
    for (const p of payslips) for (const l of (p as any).componentLines || []) if (l.code !== 'REIMBURSEMENT') codes.add(l.code);
    if (codes.size === 0) return;
    const { missing } = await this.resolveComponentAccountCodes(schoolSlug, [...codes]);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot approve payroll — the following salary component(s) have no Chart of Accounts mapping: ${[...new Set(missing)].join(', ')}. `
        + `Set an account for each in Payroll Settings → Salary Components before approving.`,
      );
    }
  }

  /** Posts one payslip's salary expense / Salaries Payable (and any
   * advance-linked claim settlement) to the GL. Called only when the
   * payslip's parent run is actually approved - never at creation time.
   * Idempotent via `postedToFinance`, so re-approving (or a retry after a
   * partial failure) never double-posts.
   *
   * Itemizes by each component's own mapped account when the payslip
   * carries componentLines (see PAY-01/PAY-03) - Basic, HRA, Transport,
   * Medical, Tax, PF, and any school-added custom component each post to
   * their own configured GL line instead of one lump Salary Expense debit.
   * A payslip created before componentLines existed (componentLines empty)
   * falls back to the exact original lump-sum behaviour, so historical
   * records already sitting at 'completed' when this change deploys still
   * post identically to how they always would have. */
  private async postPayslipToLedger(schoolSlug: string | undefined, payslip: any) {
    if (payslip.postedToFinance) return;

    const settledClaims = await this.expenseClaimModel.find({ settledPayslipId: payslip._id }).lean();
    const advanceLinkedClaims = settledClaims.filter((c: any) => c.advanceId);
    const nonAdvanceClaims = settledClaims.filter((c: any) => !c.advanceId);
    const reimbursement = nonAdvanceClaims.reduce((sum, c: any) => sum + (c.amount || 0), 0);
    const nonTaxDeductions = (payslip.loanDeduction || 0) + (payslip.leaveDeduction || 0) + (payslip.otherDeductions || 0);
    const staffId = String(payslip.staffId || '');
    const partner = { partnerType: 'staff', partnerId: staffId, partnerName: payslip.staffName, costCenterName: payslip.department };

    const componentLines: any[] = ((payslip.componentLines || []) as any[]).filter(l => l.code !== 'REIMBURSEMENT' && l.amount);
    let lines: any[];

    if (componentLines.length > 0) {
      const codes = [...new Set(componentLines.map((l: any) => l.code))];
      const { byCode: accountByCode, missing } = await this.resolveComponentAccountCodes(schoolSlug!, codes);
      if (missing.length > 0) {
        // Defense-in-depth only - validatePayrollRunAccountMappings should
        // already have blocked the run from reaching 'approved' at all.
        throw new BadRequestException(`Cannot post payslip for ${payslip.staffName} — missing account mapping for: ${missing.join(', ')}`);
      }
      const debitTotals = new Map<string, number>();
      const creditTotals = new Map<string, number>();
      for (const l of componentLines) {
        const acct = accountByCode[l.code];
        const bucket = l.type === 'earning' ? debitTotals : creditTotals;
        bucket.set(acct, (bucket.get(acct) || 0) + (l.amount || 0));
      }
      // Any earning amount not represented by a named component (the
      // legacy freeform "Other Allowances" manual entry) still needs a
      // home - it isn't itself a configured, mappable component, so it
      // rides on the generic Salaries & Wages expense line, same as it
      // always implicitly did before components were itemized at all.
      const earningComponentsTotal = componentLines.filter((l: any) => l.type === 'earning').reduce((s: number, l: any) => s + (l.amount || 0), 0);
      const residualOtherAllowances = Math.max(0, Math.round(((payslip.grossSalary || 0) - reimbursement - earningComponentsTotal) * 100) / 100);
      if (residualOtherAllowances > 0) debitTotals.set('5000', (debitTotals.get('5000') || 0) + residualOtherAllowances);

      lines = [];
      for (const [accountCode, debit] of debitTotals) lines.push({ accountCode, debit, ...partner });
      if (reimbursement > 0) lines.push({ accountCode: '5500', debit: reimbursement, ...partner });
      lines.push({ accountCode: '2100', credit: (payslip.netSalary || 0) + nonTaxDeductions, ...partner });
      for (const [accountCode, credit] of creditTotals) lines.push({ accountCode, credit, ...partner });
    } else {
      const baseSalaryExpense = (payslip.grossSalary || 0) - reimbursement;
      lines = [{ accountCode: '5000', debit: baseSalaryExpense, ...partner }];
      if (reimbursement > 0) lines.push({ accountCode: '5500', debit: reimbursement, ...partner });
      lines.push({ accountCode: '2100', credit: (payslip.netSalary || 0) + nonTaxDeductions, ...partner });
      if (payslip.incomeTax) lines.push({ accountCode: '2200', credit: payslip.incomeTax, ...partner });
      if (payslip.providentFund) lines.push({ accountCode: '2300', credit: payslip.providentFund, ...partner });
    }

    await this.safePostJournal(schoolSlug, {
      date: new Date(), reference: payslip.periodLabel, narration: `Payroll — ${payslip.staffName || ''} — ${payslip.periodLabel}`,
      sourceType: 'payroll', sourceId: String(payslip._id), lines,
    });

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

    await this.payslipModel.updateOne({ _id: payslip._id }, { $set: { postedToFinance: true } });
  }

  /** Unwinds a payslip's GL posting - the other real gap found in QA:
   * PAYROLL_TRANSITIONS allows an already-approved run to still be
   * cancelled, but nothing ever reversed what postPayslipToLedger had
   * already booked, leaving a cancelled run's numbers permanently sitting
   * in Finance. Posts the exact mirror image (debit/credit swapped) of
   * the original entry rather than deleting it, preserving the audit
   * trail - a reversing entry, not a correction. Mirrors
   * postPayslipToLedger's itemized-vs-legacy branching exactly, so the
   * reversal always matches whatever was actually originally posted. */
  private async reversePayslipLedgerEntry(schoolSlug: string | undefined, payslip: any) {
    if (!payslip.postedToFinance) return;

    const settledClaims = await this.expenseClaimModel.find({ settledPayslipId: payslip._id }).lean();
    const advanceLinkedClaims = settledClaims.filter((c: any) => c.advanceId);
    const nonAdvanceClaims = settledClaims.filter((c: any) => !c.advanceId);
    const reimbursement = nonAdvanceClaims.reduce((sum, c: any) => sum + (c.amount || 0), 0);
    const nonTaxDeductions = (payslip.loanDeduction || 0) + (payslip.leaveDeduction || 0) + (payslip.otherDeductions || 0);
    const staffId = String(payslip.staffId || '');
    const partner = { partnerType: 'staff', partnerId: staffId, partnerName: payslip.staffName, costCenterName: payslip.department };

    const componentLines: any[] = ((payslip.componentLines || []) as any[]).filter(l => l.code !== 'REIMBURSEMENT' && l.amount);
    let lines: any[];

    if (componentLines.length > 0) {
      const codes = [...new Set(componentLines.map((l: any) => l.code))];
      const { byCode: accountByCode } = await this.resolveComponentAccountCodes(schoolSlug!, codes);
      const debitTotals = new Map<string, number>(); // credit side of the original → debit here
      const creditTotals = new Map<string, number>(); // debit side of the original → credit here
      for (const l of componentLines) {
        const acct = accountByCode[l.code];
        if (!acct) continue; // shouldn't happen for anything that was actually posted, but never let a reversal itself throw
        const bucket = l.type === 'earning' ? creditTotals : debitTotals;
        bucket.set(acct, (bucket.get(acct) || 0) + (l.amount || 0));
      }
      const earningComponentsTotal = componentLines.filter((l: any) => l.type === 'earning').reduce((s: number, l: any) => s + (l.amount || 0), 0);
      const residualOtherAllowances = Math.max(0, Math.round(((payslip.grossSalary || 0) - reimbursement - earningComponentsTotal) * 100) / 100);
      if (residualOtherAllowances > 0) creditTotals.set('5000', (creditTotals.get('5000') || 0) + residualOtherAllowances);

      lines = [];
      for (const [accountCode, credit] of creditTotals) lines.push({ accountCode, credit, ...partner });
      if (reimbursement > 0) lines.push({ accountCode: '5500', credit: reimbursement, ...partner });
      lines.push({ accountCode: '2100', debit: (payslip.netSalary || 0) + nonTaxDeductions, ...partner });
      for (const [accountCode, debit] of debitTotals) lines.push({ accountCode, debit, ...partner });
    } else {
      const baseSalaryExpense = (payslip.grossSalary || 0) - reimbursement;
      lines = [{ accountCode: '5000', credit: baseSalaryExpense, ...partner }];
      if (reimbursement > 0) lines.push({ accountCode: '5500', credit: reimbursement, ...partner });
      lines.push({ accountCode: '2100', debit: (payslip.netSalary || 0) + nonTaxDeductions, ...partner });
      if (payslip.incomeTax) lines.push({ accountCode: '2200', debit: payslip.incomeTax, ...partner });
      if (payslip.providentFund) lines.push({ accountCode: '2300', debit: payslip.providentFund, ...partner });
    }

    await this.safePostJournal(schoolSlug, {
      date: new Date(), reference: payslip.periodLabel, narration: `Payroll cancelled — reversal — ${payslip.staffName || ''} — ${payslip.periodLabel}`,
      sourceType: 'payroll_reversal', sourceId: String(payslip._id), lines,
    });

    for (const claim of advanceLinkedClaims) {
      await this.safePostJournal(schoolSlug, {
        date: new Date(), reference: claim.claimNo, narration: `Advance settlement reversed — claim ${claim.claimNo} cancelled — ${claim.staffName}`,
        sourceType: 'expense_claim_reversal', sourceId: String(claim._id),
        lines: [
          { accountCode: '5500', credit: claim.amount, partnerType: 'staff', partnerId: String(claim.staffId), partnerName: claim.staffName },
          { accountCode: '1300', debit: claim.amount, partnerType: 'staff', partnerId: String(claim.staffId), partnerName: claim.staffName },
        ],
      });
    }

    await this.payslipModel.updateOne({ _id: payslip._id }, { $set: { postedToFinance: false } });
  }

  // ── Salary Components (the payroll "root system") ────────────────────
  // Each school defines its own components — this is what lets different
  // schools run genuinely different payroll structures instead of every
  // school being forced into one hardcoded Basic/HRA/Transport/Medical
  // shape baked into the app.
  // Default GL account mapping for the canonical components - see PAY-03.
  // Kept as a lookup so getSalaryComponents can also self-heal an
  // already-seeded school's components that predate this mapping (created
  // before accountCode existed on the schema), the same self-heal
  // convention as safePostJournal's COA auto-seed above: idempotent, only
  // ever fills in a currently-null value, never overwrites a school's own
  // configuration.
  private readonly DEFAULT_ACCOUNT_CODE_BY_COMPONENT_CODE: Record<string, string> = {
    BASIC: '5000', HRA: '5010', TRANSPORT: '5020', MEDICAL: '5030', TAX: '2200', PF: '2300',
  };

  private readonly DEFAULT_SALARY_COMPONENTS = [
    { name: 'Basic Salary', code: 'BASIC', type: 'earning', calculationType: 'manual', isTaxable: true, displayOrder: 1, accountCode: '5000' },
    { name: 'House Rent Allowance', code: 'HRA', type: 'earning', calculationType: 'percentage_of_basic', percentageValue: 40, isTaxable: true, displayOrder: 2, accountCode: '5010' },
    { name: 'Transport Allowance', code: 'TRANSPORT', type: 'earning', calculationType: 'fixed', defaultAmount: 1000, isTaxable: false, displayOrder: 3, accountCode: '5020' },
    { name: 'Medical Allowance', code: 'MEDICAL', type: 'earning', calculationType: 'fixed', defaultAmount: 500, isTaxable: false, displayOrder: 4, accountCode: '5030' },
    { name: 'Income Tax', code: 'TAX', type: 'deduction', calculationType: 'manual', isTaxable: false, displayOrder: 5, accountCode: '2200' },
    { name: 'Provident Fund', code: 'PF', type: 'deduction', calculationType: 'manual', isTaxable: false, displayOrder: 6, accountCode: '2300' },
  ];

  async getSalaryComponents(tenantId: string, schoolSlug: string) {
    const existing = await this.salaryComponentModel.find({ schoolSlug }).sort({ displayOrder: 1 }).lean();
    if (existing.length === 0) {
      // First time this school has opened Salary Components — seed
      // sensible, fully editable/deletable starting defaults rather than
      // showing a completely blank, intimidating screen. Nothing here is
      // locked in; every one of these can be renamed, reconfigured, or
      // removed.
      return this.salaryComponentModel.insertMany(
        this.DEFAULT_SALARY_COMPONENTS.map(c => ({ ...c, tenantId: this.newTid(tenantId), schoolSlug, isActive: true })),
      );
    }
    // Self-heal: a school that seeded its components before accountCode
    // existed has canonical components sitting with no GL mapping, which
    // would otherwise permanently block payroll approval (see PAY-03) for
    // a component the school never actually touched or renamed. Only fills
    // a currently-null accountCode on an untouched canonical code/name
    // pair - a school that renamed or reconfigured a component is left
    // alone.
    const toHeal = existing.filter((c: any) =>
      !c.accountCode && this.DEFAULT_ACCOUNT_CODE_BY_COMPONENT_CODE[c.code]
      && this.DEFAULT_SALARY_COMPONENTS.some(d => d.code === c.code && d.name === c.name));
    if (toHeal.length > 0) {
      await Promise.all(toHeal.map((c: any) =>
        this.salaryComponentModel.updateOne({ _id: c._id }, { $set: { accountCode: this.DEFAULT_ACCOUNT_CODE_BY_COMPONENT_CODE[c.code] } })));
      for (const c of toHeal) (existing.find((e: any) => e._id === c._id) as any).accountCode = this.DEFAULT_ACCOUNT_CODE_BY_COMPONENT_CODE[c.code];
    }
    return existing;
  }

  private async validateComponentGraphOrThrow(schoolSlug: string, changed: any) {
    const others = await this.salaryComponentModel.find({ schoolSlug, isActive: true, _id: { $ne: changed._id || null } }).lean();
    const errors = validateSalaryComponentGraph([...others, changed] as any);
    if (errors.length > 0) throw new BadRequestException(errors.join('; '));
  }

  async createSalaryComponent(tenantId: string, schoolSlug: string, dto: any) {
    const code = (dto.code || dto.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 30);
    const existing = await this.salaryComponentModel.findOne({ schoolSlug, code });
    if (existing) throw new BadRequestException(`A component with code "${code}" already exists`);
    await this.validateComponentGraphOrThrow(schoolSlug, { ...dto, code });
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
    const existing = await this.salaryComponentModel.findOne({ _id: id, schoolSlug }).lean();
    if (!existing) throw new NotFoundException('Salary component not found');
    await this.validateComponentGraphOrThrow(schoolSlug, { ...existing, ...dto, _id: id });
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

  // ── Salary Templates (addresses "everything is manual") ──────────────
  async getSalaryTemplates(schoolSlug: string) {
    return this.salaryTemplateModel.find({ schoolSlug, isActive: true }).populate('lines.componentId', 'name code type').lean();
  }

  async createSalaryTemplate(tenantId: string, schoolSlug: string, dto: any) {
    const existing = await this.salaryTemplateModel.findOne({ schoolSlug, name: dto.name });
    if (existing) throw new BadRequestException(`A template named "${dto.name}" already exists`);
    return this.salaryTemplateModel.create({ ...dto, tenantId: this.newTid(tenantId), schoolSlug });
  }

  async updateSalaryTemplate(id: string, schoolSlug: string, dto: any) {
    if (dto.name) {
      const clash = await this.salaryTemplateModel.findOne({ schoolSlug, name: dto.name, _id: { $ne: this.newTid(id) } }).lean();
      if (clash) throw new BadRequestException(`A template named "${dto.name}" already exists`);
    }
    const template = await this.salaryTemplateModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!template) throw new NotFoundException('Salary template not found');
    return template;
  }

  async deleteSalaryTemplate(id: string, schoolSlug: string) {
    const result = await this.salaryTemplateModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Salary template not found');
    return { message: 'Salary template deleted' };
  }

  // Sets a specific staff member's actual salary structure — the real
  // per-employee values (a teacher's Basic differs from an admin's Basic),
  // built from this school's own configured components rather than a
  // one-size-fits-all default.
  async setStaffSalaryStructure(staffId: string, tenantId: string, schoolSlug: string, lines: { componentId: string; amount: number }[]) {
    // Shared calculation engine (see salary-calc.util.ts, PAY-02, and
    // resolveSalaryStructureFromLines above) - handles fixed/manual/
    // percentage-of-basic/percentage-of-gross/percentage-of-other-components
    // uniformly, in a predictable dependency order, and throws on a
    // circular dependency rather than producing a wrong number.
    const { salaryStructure, grossSalary } = await this.resolveSalaryStructureFromLines(schoolSlug, lines);

    const staff = await this.staffModel.findOneAndUpdate(
      { _id: staffId, tenantId: this.newTid(tenantId) },
      { $set: { salaryStructure, salary: grossSalary } },
      { new: true },
    );
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  /** Shared letter-PDF builder for Offer Letters, Appointment Letters,
   * and Contracts - the three real employment documents that previously
   * either didn't exist at all (offer/appointment) or generated no
   * actual document at all (contract, data-only before this). Kept as
   * one shared method rather than three separate implementations, since
   * a real letterhead/font-safety bug fixed in one should never need
   * fixing three more times elsewhere. Uses the same Arabic-font
   * fallback already verified for payslips and student profiles - a
   * candidate or staff name containing Arabic script would otherwise
   * crash the whole letter. */
  private async buildLetterPdf(schoolName: string, opts: {
    title: string; refNo?: string; date: Date; recipientName: string;
    bodyParagraphs: string[]; fields: { label: string; value: string }[];
    closingLine?: string;
  }): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const arabicFontBytes = fs.readFileSync(
      require.resolve('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2'),
    );
    const arabicFont = await pdfDoc.embedFont(arabicFontBytes);
    const navy = rgb(0.11, 0.23, 0.37);
    const gray = rgb(0.42, 0.45, 0.5);
    const margin = 55;
    const pageWidth = 595;
    const textWidth = pageWidth - margin * 2;
    let y = 780;

    const drawText = (text: string, x: number, yPos: number, opt: { size?: number; f?: any; color?: any } = {}) => {
      const drawOpts = { x, y: yPos, size: opt.size ?? 10.5, font: opt.f ?? font, color: opt.color ?? rgb(0.15, 0.15, 0.18) };
      try { page.drawText(text ?? '', drawOpts); }
      catch { page.drawText(text ?? '', { ...drawOpts, font: arabicFont }); }
    };
    // Simple word-wrap - splits a paragraph across multiple lines so
    // real letter body text (which can run long) doesn't overflow the
    // page or overlap the next section.
    const wrapText = (text: string, maxWidth: number, size: number, f: any): string[] => {
      const words = (text || '').split(' ');
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const attempt = current ? `${current} ${word}` : word;
        const width = f.widthOfTextAtSize(attempt, size);
        if (width > maxWidth && current) { lines.push(current); current = word; }
        else { current = attempt; }
      }
      if (current) lines.push(current);
      return lines;
    };

    // Letterhead
    drawText(schoolName, margin, y, { size: 16, f: bold, color: navy });
    y -= 22;
    drawText(opts.title.toUpperCase(), margin, y, { size: 13, f: bold, color: navy });
    y -= 28;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.85, 0.87, 0.9) });
    y -= 20;

    if (opts.refNo) { drawText(`Ref: ${opts.refNo}`, margin, y, { size: 9.5, color: gray }); y -= 15; }
    drawText(`Date: ${opts.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin, y, { size: 9.5, color: gray });
    y -= 28;

    drawText(`Dear ${opts.recipientName},`, margin, y, { size: 11, f: bold });
    y -= 24;

    for (const para of opts.bodyParagraphs) {
      const lines = wrapText(para, textWidth, 10.5, font);
      for (const line of lines) { drawText(line, margin, y); y -= 16; }
      y -= 8;
    }

    y -= 6;
    for (const field of opts.fields) {
      drawText(`${field.label}:`, margin, y, { size: 10, f: bold });
      drawText(field.value, margin + 170, y, { size: 10 });
      y -= 18;
    }

    if (opts.closingLine) {
      y -= 16;
      const lines = wrapText(opts.closingLine, textWidth, 10.5, font);
      for (const line of lines) { drawText(line, margin, y); y -= 16; }
    }

    y -= 50;
    drawText('_______________________', margin, y, { size: 10 });
    y -= 16;
    drawText('Authorized Signatory', margin, y, { size: 9.5, color: gray });

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
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

  // ── Contract wording templates ──────────────────────────────────────
  // Every institution phrases its contracts differently - this is the
  // reusable {{variable}} body an admin picks from and fills in when
  // creating a new contract, distinct from a ReportTemplate (which only
  // controls the printed PDF's letterhead/branding, not its wording).
  async getContractTemplates(tenantId: string) {
    return this.contractTemplateModel.find({ tenantId: this.newTid(tenantId) }).sort({ name: 1 }).lean();
  }

  async createContractTemplate(tenantId: string, schoolSlug: string, data: any, userId: string) {
    if (!data?.name?.trim()) throw new BadRequestException('Template name is required.');
    if (!data?.body?.trim()) throw new BadRequestException('Template body is required.');
    return this.contractTemplateModel.create({
      ...data, schoolSlug,
      tenantId: this.newTid(tenantId),
      createdBy: this.newTid(userId),
    });
  }

  async updateContractTemplate(tenantId: string, id: string, data: any) {
    const updated = await this.contractTemplateModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) }, { $set: data }, { new: true },
    ).lean();
    if (!updated) throw new NotFoundException('Contract template not found');
    return updated;
  }

  async deleteContractTemplate(tenantId: string, id: string) {
    const result = await this.contractTemplateModel.deleteOne({ _id: id, tenantId: this.newTid(tenantId) });
    if (result.deletedCount === 0) throw new NotFoundException('Contract template not found');
    return { success: true };
  }

  async createContract(tenantId: string, institutionId: string, schoolSlug: string, data: any, userId: string) {
    const count = await this.contractModel.countDocuments({ tenantId: this.newTid(tenantId) });
    const contractNo = `CON-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const expiresAt = data.endDate ? new Date(data.endDate) : null;
    return this.contractModel.create({
      ...data, contractNo, expiresAt, schoolSlug,
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

  async generateContractPdf(id: string, tenantId: string, schoolSlug: string, userId?: string): Promise<Buffer> {
    const contract = await this.contractModel.findOne({ _id: id, tenantId: this.newTid(tenantId) }).lean();
    if (!contract) throw new NotFoundException('Contract not found');
    const school = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    const schoolName = (school as any)?.name || 'Eldermin School';
    const typeLabels: Record<string, string> = { permanent: 'Permanent', fixed_term: 'Fixed Term', probationary: 'Probationary', part_time: 'Part Time', visiting: 'Visiting', renewal: 'Renewal' };
    const termsText = contract.termsAndConditions || 'Your employment is subject to the standard policies and code of conduct of the institution, as may be amended from time to time.';

    // Prefer the school's own contract ReportTemplate (letterhead/branding,
    // and whichever one was selected when this contract was created) so
    // every institution's contracts can actually look like their own
    // letterhead instead of one fixed hardcoded layout. A custom
    // template's render must never be able to make a contract simply fail
    // to generate, though - same defensive fallback pattern already used
    // for fee receipts/report cards elsewhere in this codebase.
    try {
      return await this.pdfService.generateFromTemplate(schoolSlug, 'contract', {
        documentNumber: contract.contractNo,
        date: new Date().toLocaleDateString('en-GB'),
        recipientName: contract.staffName || 'Employee',
        contractTypeLabel: typeLabels[contract.type] || contract.type,
        designation: contract.designation || '—',
        department: contract.department || '—',
        startDateLabel: new Date(contract.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        endDateLabel: contract.endDate ? new Date(contract.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Open-ended',
        grossSalaryLabel: `${contract.currency} ${(contract.grossSalary || 0).toLocaleString()}/month`,
        noticePeriodLabel: `${contract.noticePeriodDays} days`,
        workingHoursLabel: `${contract.workingHoursPerWeek} hours/week`,
        termsAndConditions: termsText,
      }, userId || 'system', contract.reportTemplateId ? String(contract.reportTemplateId) : undefined);
    } catch {
      // fall through to the fixed pdf-lib layout below
    }

    const buffer = await this.buildLetterPdf(schoolName, {
      title: 'Employment Contract',
      refNo: contract.contractNo,
      date: new Date(),
      recipientName: contract.staffName || 'Employee',
      bodyParagraphs: [
        `This Employment Contract sets out the terms and conditions of your ${typeLabels[contract.type] || contract.type} employment with ${schoolName}, effective from the start date specified below.`,
        termsText,
      ],
      fields: [
        { label: 'Contract Type', value: typeLabels[contract.type] || contract.type },
        { label: 'Designation', value: contract.designation || '—' },
        { label: 'Department', value: contract.department || '—' },
        { label: 'Start Date', value: new Date(contract.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) },
        { label: 'End Date', value: contract.endDate ? new Date(contract.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Open-ended' },
        { label: 'Gross Salary', value: `${contract.currency} ${(contract.grossSalary || 0).toLocaleString()}/month` },
        { label: 'Notice Period', value: `${contract.noticePeriodDays} days` },
        { label: 'Working Hours', value: `${contract.workingHoursPerWeek} hours/week` },
      ],
      closingLine: 'Please sign and return a copy of this contract to acknowledge your acceptance of these terms.',
    });
    return buffer;
  }

  // ── OFFER LETTER WORDING TEMPLATES (HR-02) ────────────────────────────
  // Mirrors the Contract wording-template CRUD above exactly (same shape,
  // same {{variable}} convention) - multiple named, managed templates
  // instead of the single free-text HiringSettings.offerLetterTemplate
  // field, which is left untouched as a legacy fallback (see
  // generateOfferLetterPdf below) for schools that never adopt this.
  async getOfferLetterTemplates(tenantId: string) {
    return this.offerLetterTemplateModel.find({ tenantId: this.newTid(tenantId) }).sort({ name: 1 }).lean();
  }

  async createOfferLetterTemplate(tenantId: string, schoolSlug: string, data: any, userId: string) {
    if (!data?.name?.trim()) throw new BadRequestException('Template name is required.');
    if (!data?.body?.trim()) throw new BadRequestException('Template body is required.');
    return this.offerLetterTemplateModel.create({
      ...data, schoolSlug,
      tenantId: this.newTid(tenantId),
      createdBy: this.newTid(userId),
    });
  }

  async updateOfferLetterTemplate(tenantId: string, id: string, data: any) {
    const updated = await this.offerLetterTemplateModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) }, { $set: data }, { new: true },
    ).lean();
    if (!updated) throw new NotFoundException('Offer letter template not found');
    return updated;
  }

  async deleteOfferLetterTemplate(tenantId: string, id: string) {
    const result = await this.offerLetterTemplateModel.deleteOne({ _id: id, tenantId: this.newTid(tenantId) });
    if (result.deletedCount === 0) throw new NotFoundException('Offer letter template not found');
    return { success: true };
  }

  // ── OFFER LETTERS ────────────────────────────────────────────────────
  async getOfferLetters(schoolSlug: string, query: any = {}) {
    const filter: any = { schoolSlug };
    if (query.status) filter.status = query.status;
    return this.offerLetterModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createOfferLetter(tenantId: string, institutionId: string, schoolSlug: string, data: any, userId: string) {
    const count = await this.offerLetterModel.countDocuments({ schoolSlug });
    const offerNo = `OFR-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    return this.offerLetterModel.create({
      ...data, offerNo, schoolSlug,
      tenantId: this.newTid(tenantId), institutionId: this.newTid(institutionId), createdBy: this.newTid(userId),
    });
  }

  async updateOfferLetterStatus(id: string, schoolSlug: string, status: string, extra: any = {}) {
    const update: any = { status, ...extra };
    if (['accepted', 'declined'].includes(status)) update.respondedAt = new Date();
    const offer = await this.offerLetterModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: update }, { new: true });
    if (!offer) throw new NotFoundException('Offer letter not found');
    return offer;
  }

  // HR-02: an offer letter's wording now comes from (in priority order)
  // 1) the OfferLetterTemplate picked on this specific offer, 2) the
  // legacy single free-text HiringSettings.offerLetterTemplate (unchanged
  // field, still fully supported), 3) the original hardcoded paragraphs -
  // so an institution that never adopts template management sees no
  // behaviour change at all. Letterhead/branding is resolved the same way
  // StaffContract PDFs already do: the school's default (or offer-picked)
  // 'offer_letter' ReportTemplate via pdfService.generateFromTemplate,
  // falling back to the fixed pdf-lib layout if that ever fails.
  async generateOfferLetterPdf(id: string, schoolSlug: string, userId?: string): Promise<Buffer> {
    const offer = await this.offerLetterModel.findOne({ _id: id, schoolSlug }).lean();
    if (!offer) throw new NotFoundException('Offer letter not found');
    const school = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    const schoolName = (school as any)?.name || 'Eldermin School';

    let rawBody: string | null = null;
    if ((offer as any).offerLetterTemplateId) {
      const tpl = await this.offerLetterTemplateModel.findOne({ _id: (offer as any).offerLetterTemplateId, schoolSlug }).lean();
      if (tpl) rawBody = tpl.body;
    }
    if (!rawBody) {
      const hiring = await this.hiringSettingsModel.findOne({ schoolSlug }).lean();
      if (hiring?.offerLetterTemplate) rawBody = hiring.offerLetterTemplate;
    }

    const defaultParagraphs = [
      `We are pleased to offer you the position of ${offer.designation} at ${schoolName}. We were impressed by your background and believe you will be a valuable addition to our team.`,
      `This offer is valid until ${new Date(offer.offerValidUntil).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}. Please confirm your acceptance by this date.`,
      offer.additionalTerms || '',
    ].filter(Boolean);

    const letterBody = rawBody
      ? renderOfferLetterTemplate(rawBody, offer, schoolName)
      : defaultParagraphs.join('\n\n');

    try {
      return await this.pdfService.generateFromTemplate(schoolSlug, 'offer_letter', {
        documentNumber: offer.offerNo,
        date: new Date().toLocaleDateString('en-GB'),
        recipientName: offer.candidateName,
        designation: offer.designation,
        department: offer.department || '—',
        proposedSalaryLabel: `${offer.currency} ${(offer.proposedSalary || 0).toLocaleString()}/month`,
        joiningDateLabel: new Date(offer.proposedJoiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        letterBody,
      }, userId || 'system', (offer as any).reportTemplateId ? String((offer as any).reportTemplateId) : undefined);
    } catch {
      // fall through to the fixed pdf-lib layout below - a custom
      // template's render must never make an offer letter simply fail to
      // generate, same defensive pattern generateContractPdf already uses.
    }

    return this.buildLetterPdf(schoolName, {
      title: 'Offer of Employment',
      refNo: offer.offerNo,
      date: new Date(),
      recipientName: offer.candidateName,
      bodyParagraphs: rawBody ? letterBody.split(/\n\n+/).filter(Boolean) : defaultParagraphs,
      fields: [
        { label: 'Designation', value: offer.designation },
        { label: 'Department', value: offer.department || '—' },
        { label: 'Proposed Salary', value: `${offer.currency} ${(offer.proposedSalary || 0).toLocaleString()}/month` },
        { label: 'Proposed Joining Date', value: new Date(offer.proposedJoiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) },
        ...(offer.probationPeriodMonths ? [{ label: 'Probation Period', value: `${offer.probationPeriodMonths} months` }] : []),
        ...(offer.reportingTo ? [{ label: 'Reporting To', value: offer.reportingTo }] : []),
      ],
      closingLine: 'We look forward to welcoming you to our team. Congratulations!',
    });
  }

  // ── APPOINTMENT LETTERS ──────────────────────────────────────────────
  async getAppointmentLetters(schoolSlug: string, query: any = {}) {
    const filter: any = { schoolSlug };
    if (query.staffId) filter.staffId = this.newTid(query.staffId);
    if (query.status) filter.status = query.status;
    return this.appointmentLetterModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createAppointmentLetter(tenantId: string, institutionId: string, schoolSlug: string, data: any, userId: string) {
    const count = await this.appointmentLetterModel.countDocuments({ schoolSlug });
    const appointmentNo = `APT-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    return this.appointmentLetterModel.create({
      ...data, appointmentNo, schoolSlug,
      tenantId: this.newTid(tenantId), institutionId: this.newTid(institutionId), createdBy: this.newTid(userId),
    });
  }

  async updateAppointmentLetterStatus(id: string, schoolSlug: string, status: string) {
    const update: any = { status };
    if (status === 'issued') update.issuedAt = new Date();
    if (status === 'acknowledged') update.acknowledgedAt = new Date();
    const letter = await this.appointmentLetterModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: update }, { new: true });
    if (!letter) throw new NotFoundException('Appointment letter not found');
    return letter;
  }

  async generateAppointmentLetterPdf(id: string, schoolSlug: string): Promise<Buffer> {
    const letter = await this.appointmentLetterModel.findOne({ _id: id, schoolSlug }).lean();
    if (!letter) throw new NotFoundException('Appointment letter not found');
    const school = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    const schoolName = (school as any)?.name || 'Eldermin School';
    return this.buildLetterPdf(schoolName, {
      title: 'Appointment Letter',
      refNo: letter.appointmentNo,
      date: new Date(),
      recipientName: letter.staffName || 'Employee',
      bodyParagraphs: [
        `Further to your acceptance of our offer, we are pleased to confirm your appointment as ${letter.designation} at ${schoolName}, effective from your joining date specified below.`,
        letter.additionalTerms || 'Your appointment is subject to the standard policies and code of conduct of the institution, including satisfactory completion of the probation period noted below.',
      ],
      fields: [
        { label: 'Designation', value: letter.designation },
        { label: 'Department', value: letter.department || '—' },
        { label: 'Joining Date', value: new Date(letter.joiningDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) },
        { label: 'Probation Period', value: `${letter.probationPeriodMonths} months` },
        { label: 'Salary', value: `${letter.currency} ${(letter.salary || 0).toLocaleString()}/month` },
        ...(letter.workingHoursPerWeek ? [{ label: 'Working Hours', value: `${letter.workingHoursPerWeek} hours/week` }] : []),
        ...(letter.reportingTo ? [{ label: 'Reporting To', value: letter.reportingTo }] : []),
      ],
      closingLine: 'We welcome you to the team and look forward to a successful association.',
    });
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
    const inUse = await this.staffModel.countDocuments({ schoolSlug, $or: [{ shiftId: this.newTid(id) }, { shiftIds: this.newTid(id) }] } as any);
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
  private static readonly DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  private getSaturdayOccurrenceInMonth(date: Date): number {
    return Math.ceil(date.getDate() / 7);
  }

  private isLastSaturdayOfMonth(date: Date): boolean {
    const nextWeek = new Date(date);
    nextWeek.setDate(date.getDate() + 7);
    return nextWeek.getMonth() !== date.getMonth();
  }

  /** Whether a specific calendar Saturday actually counts as a working day
   * under a shift's policy. Directly verified against real dates, including
   * the tricky case of "last Saturday off" needing to correctly land on
   * either the 4th or 5th Saturday depending on how many the month has. */
  private isWorkingSaturday(date: Date, policy?: string, offOccurrence?: number): boolean {
    if (!policy || policy === 'all') return true;
    const occurrence = this.getSaturdayOccurrenceInMonth(date);
    if (policy === 'alternate_odd') return occurrence % 2 === 1;
    if (policy === 'alternate_even') return occurrence % 2 === 0;
    if (policy === 'all_except_nth') {
      if (offOccurrence === 5) return !this.isLastSaturdayOfMonth(date);
      return occurrence !== offOccurrence;
    }
    return true;
  }

  /** Given the shift(s) actually assigned to a staff member and a specific
   * date, finds which one applies - most schools need different timings on
   * different days (Mon-Thu one shift, Friday another, Saturday a third or
   * none), which a single shiftId could never express. Returns null if no
   * assigned shift covers this date (including a Saturday that's off under
   * whichever shift would otherwise cover it), meaning the day isn't a
   * working day for this person at all - not that they're absent. */
  private resolveShiftForDate(shifts: any[], date: Date): any | null {
    const dc = HrService.DAY_CODES[date.getDay()];
    for (const shift of shifts) {
      if (!(shift.applicableDays || []).includes(dc)) continue;
      if (dc === 'sat' && !this.isWorkingSaturday(date, shift.saturdayPolicy, shift.saturdayOffOccurrence)) continue;
      return shift;
    }
    return null;
  }

  /** Replaces a single shiftId assignment with a real set - validates the
   * assigned shifts don't ambiguously overlap on the same day (e.g. two
   * shifts both claiming Monday), since resolveShiftForDate would otherwise
   * silently pick whichever came first with no way for an admin to know
   * that happened. */
  async assignStaffShifts(staffId: string, tenantId: string, shiftIds: string[]) {
    if (shiftIds.length > 1) {
      const shifts = await this.shiftModel.find({ _id: { $in: shiftIds.map(id => this.newTid(id)) } }).select('name applicableDays').lean();
      const seenDays = new Map<string, string>(); // day -> shift name that already claimed it
      for (const shift of shifts) {
        for (const day of shift.applicableDays || []) {
          const clashName = seenDays.get(day);
          if (clashName) {
            throw new BadRequestException(`"${clashName}" and "${shift.name}" both cover ${day} - a staff member's assigned shifts can't overlap on the same day`);
          }
          seenDays.set(day, shift.name);
        }
      }
    }
    const staff = await this.staffModel.findOneAndUpdate(
      { _id: staffId, tenantId: this.newTid(tenantId) },
      { $set: { shiftIds: shiftIds.map(id => this.newTid(id)) } },
      { new: true },
    );
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

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
