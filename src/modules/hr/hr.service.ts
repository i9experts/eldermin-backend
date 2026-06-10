import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
import { PerformanceReview, PerformanceReviewDocument } from './schemas/performance-review.schema';
import { Training, TrainingDocument } from './schemas/training.schema';
import { StaffContract, StaffContractDocument } from './schemas/staff-contract.schema';
import { ExitRecord, ExitRecordDocument } from './schemas/exit-record.schema';
import { LeavePolicy, LeavePolicyDocument } from './schemas/leave-policy.schema';

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
    @InjectModel(PerformanceReview.name) private performanceModel: Model<PerformanceReviewDocument>,
    @InjectModel(Training.name) private trainingModel: Model<TrainingDocument>,
    @InjectModel(StaffContract.name) private contractModel: Model<StaffContractDocument>,
    @InjectModel(ExitRecord.name) private exitRecordModel: Model<ExitRecordDocument>,
    @InjectModel(LeavePolicy.name) private leavePolicyModel: Model<LeavePolicyDocument>,
  ) {}

  private newTid(t: string) { return new Types.ObjectId(t); }

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
    return this.staffModel.create({ ...data, tenantId: this.newTid(tenantId) });
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
    return this.leaveApplicationModel.find(filter).sort({ createdAt: -1 }).lean();
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
    return this.staffAttendanceModel.find(filter).sort({ date: -1 }).lean();
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

  async updateLeaveStatus(tenantId: string, id: string, status: string, approverId: string, note: string) {
    return this.leaveApplicationModel.findOneAndUpdate(
      { _id: id, tenantId: this.newTid(tenantId) },
      { $set: { status, approvedBy: this.newTid(approverId), approvedAt: new Date(), approverNote: note } },
      { new: true },
    ).lean();
  }

  async getLeaveBalance(tenantId: string, staffId: string) {
    return this.leaveBalanceModel.findOne({ tenantId: this.newTid(tenantId), staffId: this.newTid(staffId) }).lean();
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
    };
    await this.leaveBalanceModel.updateOne(
      { tenantId: this.newTid(tenantId), staffId: this.newTid(staffId) },
      { $set: balanceData, $setOnInsert: { academicYearId: new Types.ObjectId() } },
      { upsert: true },
    );
    return { success: true };
  }

  async bulkAssignLeavePolicy(tenantId: string, policyId: string, _academicYearId: string) {
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
    };
    const ops = (staffList as any[]).map((s: any) => ({
      updateOne: {
        filter: { tenantId: this.newTid(tenantId), staffId: s._id },
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
      { code: 'STD-TEACHER',  name: 'Standard Teacher Policy',    applicableTo: 'permanent', isDefault: true,  annualDays: 21, sickDays: 10, casualDays: 10, maternityDays: 90, paternityDays: 10, emergencyDays: 3, studyDays: 5, unpaidDays: 30 },
      { code: 'STD-ADMIN',    name: 'Admin & Support Policy',     applicableTo: 'all',       isDefault: false, annualDays: 18, sickDays: 10, casualDays: 7,  maternityDays: 90, paternityDays: 10, emergencyDays: 3, studyDays: 0, unpaidDays: 30 },
      { code: 'STD-CONTRACT', name: 'Contract Staff Policy',      applicableTo: 'contract',  isDefault: false, annualDays: 14, sickDays: 7,  casualDays: 5,  maternityDays: 90, paternityDays: 5,  emergencyDays: 2, studyDays: 0, unpaidDays: 20 },
      { code: 'STD-PARTTIME', name: 'Part-Time & Visiting Policy', applicableTo: 'part_time', isDefault: false, annualDays: 7,  sickDays: 5,  casualDays: 3,  maternityDays: 0,  paternityDays: 0,  emergencyDays: 1, studyDays: 0, unpaidDays: 0  },
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
