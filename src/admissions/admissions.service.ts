// ============================================================
// ADMISSIONS SERVICE — Full Business Logic
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Lead, LeadDocument } from './schemas/lead.schema';
import { Applicant, ApplicantDocument } from './schemas/applicant.schema';
import {
  EntranceTest, EntranceTestDocument,
  Interview, InterviewDocument,
  Enrollment, EnrollmentDocument,
  Retention, RetentionDocument,
} from './schemas/evaluation-enrollment-retention.schema';

import { StudentsService } from '../students/students.service';

import {
  CreateLeadDto, UpdateLeadDto, LeadQueryDto, ConvertLeadDto,
  CreateApplicantDto, UpdateApplicantDto, ApplicantQueryDto, UpdateDocumentDto,
  CreateEntranceTestDto, SubmitTestResultDto,
  CreateInterviewDto, SubmitInterviewResultDto,
  CreateEnrollmentDto, UpdateEnrollmentDto,
  CreateRetentionDto, UpdateRetentionDto,
} from './dto/admissions.dto';

// ── Helper ────────────────────────────────────────────────────
const buildPagination = (page = 1, limit = 20) => ({
  skip: (page - 1) * limit,
  limit,
});

@Injectable()
export class AdmissionsService {

  constructor(
    @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
    @InjectModel(Applicant.name) private applicantModel: Model<ApplicantDocument>,
    @InjectModel(EntranceTest.name) private testModel: Model<EntranceTestDocument>,
    @InjectModel(Interview.name) private interviewModel: Model<InterviewDocument>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<EnrollmentDocument>,
    @InjectModel(Retention.name) private retentionModel: Model<RetentionDocument>,
    private studentsService: StudentsService,
  ) {}

  // ============================================================
  // DASHBOARD
  // ============================================================
  async getDashboardStats(schoolSlug: string, academicYear?: string) {
    const baseFilter: any = { schoolSlug };
    if (academicYear) baseFilter.academicYear = academicYear;

    const [
      totalLeads, leadsThisMonth,
      totalApplications, underReview, shortlisted, accepted, rejected, enrolled,
      testsScheduled, testsCompleted, interviewsCompleted,
      atRiskRetention,
    ] = await Promise.all([
      this.leadModel.countDocuments(baseFilter),
      this.leadModel.countDocuments({
        ...baseFilter,
        createdAt: { $gte: new Date(new Date().setDate(1)) },
      }),
      this.applicantModel.countDocuments(baseFilter),
      this.applicantModel.countDocuments({ ...baseFilter, status: 'under_review' }),
      this.applicantModel.countDocuments({ ...baseFilter, status: 'shortlisted' }),
      this.applicantModel.countDocuments({ ...baseFilter, status: 'accepted' }),
      this.applicantModel.countDocuments({ ...baseFilter, status: 'rejected' }),
      this.enrollmentModel.countDocuments({ ...baseFilter, status: 'enrolled' }),
      this.testModel.countDocuments({ ...baseFilter, status: 'scheduled' }),
      this.testModel.countDocuments({ ...baseFilter, status: 'completed' }),
      this.interviewModel.countDocuments({ ...baseFilter, status: 'completed' }),
      this.retentionModel.countDocuments({ ...baseFilter, status: 'at_risk' }),
    ]);

    // Lead source breakdown
    const sourceBreakdown = await this.leadModel.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Monthly trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyLeads = await this.leadModel.aggregate([
      { $match: { ...baseFilter, createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthlyEnrolled = await this.enrollmentModel.aggregate([
      { $match: { ...baseFilter, createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Grade demand
    const gradeDemand = await this.applicantModel.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$gradeApplied', applications: { $sum: 1 } } },
      { $sort: { applications: -1 } },
      { $limit: 8 },
    ]);

    // Recent activity (last 10 actions across all collections)
    const recentApplicants = await this.applicantModel
      .find(baseFilter)
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('firstName lastName status stage updatedAt applicationNumber');

    const conversionRate = totalLeads > 0
      ? parseFloat(((enrolled / totalLeads) * 100).toFixed(1))
      : 0;

    const leadToApplicationRate = totalLeads > 0
      ? parseFloat(((totalApplications / totalLeads) * 100).toFixed(1))
      : 0;

    const applicationToEnrollmentRate = accepted > 0
      ? parseFloat(((enrolled / accepted) * 100).toFixed(1))
      : 0;

    return {
      stats: {
        totalLeads, leadsThisMonth,
        totalApplications, underReview, shortlisted,
        accepted, rejected, enrolled,
        testsScheduled, testsCompleted, interviewsCompleted,
        atRiskRetention,
        conversionRate,
        leadToApplicationRate,
        applicationToEnrollmentRate,
      },
      funnel: [
        { stage: 'Leads', count: totalLeads },
        { stage: 'Applications', count: totalApplications },
        { stage: 'Under Review', count: underReview },
        { stage: 'Shortlisted', count: shortlisted },
        { stage: 'Accepted', count: accepted },
        { stage: 'Enrolled', count: enrolled },
      ],
      sourceBreakdown: sourceBreakdown.map(s => ({ source: s._id, count: s.count })),
      monthlyTrend: monthlyLeads.map(m => ({
        month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
        leads: m.count,
        enrolled: monthlyEnrolled.find(
          e => e._id.year === m._id.year && e._id.month === m._id.month
        )?.count || 0,
      })),
      gradeDemand: gradeDemand.map(g => ({ grade: g._id, applications: g.applications })),
      recentActivity: recentApplicants,
    };
  }

  // ============================================================
  // LEADS
  // ============================================================
  async createLead(dto: CreateLeadDto) {
    const lead = new this.leadModel(dto);
    return lead.save();
  }

  async getLeads(schoolSlug: string, query: LeadQueryDto) {
    const { page, limit, search, sortBy, sortOrder, status, source, priority, assignedTo, gradeInterested } = query;
    const { skip } = buildPagination(page, limit);

    const filter: any = { schoolSlug, isActive: true };
    if (status) filter.status = status;
    if (source) filter.source = source;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (gradeInterested) filter.gradeInterested = gradeInterested;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    if (query.followUpDateFrom || query.followUpDateTo) {
      filter.followUpDate = {};
      if (query.followUpDateFrom) filter.followUpDate.$gte = new Date(query.followUpDateFrom);
      if (query.followUpDateTo) filter.followUpDate.$lte = new Date(query.followUpDateTo);
    }

    const sortObj: any = {};
    sortObj[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.leadModel.find(filter).sort(sortObj).skip(skip).limit(limit!),
      this.leadModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit!) },
    };
  }

  async getLeadById(id: string, schoolSlug: string) {
    const lead = await this.leadModel.findOne({ _id: id, schoolSlug });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async updateLead(id: string, schoolSlug: string, dto: UpdateLeadDto) {
    const lead = await this.leadModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: dto },
      { new: true },
    );
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async deleteLead(id: string, schoolSlug: string) {
    const lead = await this.leadModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { isActive: false } },
      { new: true },
    );
    if (!lead) throw new NotFoundException('Lead not found');
    return { message: 'Lead deleted successfully' };
  }

  async convertLead(id: string, schoolSlug: string, dto: ConvertLeadDto) {
    const lead = await this.leadModel.findOne({ _id: id, schoolSlug });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status === 'converted') {
      throw new ConflictException('Lead already converted');
    }

    // Create applicant from lead
    const applicant = new this.applicantModel({
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      guardianPhone: lead.phone,
      gradeApplied: dto.gradeApplied,
      academicYear: dto.academicYear,
      campusId: dto.campusId,
      assignedTo: dto.assignedTo || lead.assignedTo,
      notes: dto.notes,
      leadId: lead._id,
      status: 'submitted',
      stage: 'application',
      submittedAt: new Date(),
      schoolSlug,
    });
    await applicant.save();

    // Mark lead as converted
    lead.status = 'converted';
    lead.convertedToApplicantId = applicant._id as Types.ObjectId;
    lead.lastContactedAt = new Date();
    await lead.save();

    return { lead, applicant };
  }

  async getLeadStats(schoolSlug: string) {
    const stats = await this.leadModel.aggregate([
      { $match: { schoolSlug, isActive: true } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {});
  }

  // ============================================================
  // APPLICANTS
  // ============================================================
  async createApplicant(dto: CreateApplicantDto) {
    const applicant = new this.applicantModel({
      ...dto,
      status: 'submitted',
      stage: 'application',
      submittedAt: new Date(),
    });
    return applicant.save();
  }

  async getApplicants(schoolSlug: string, query: ApplicantQueryDto) {
    const { page, limit, search, sortBy, sortOrder, status, stage, gradeApplied, assignedTo, campusId, academicYear } = query;
    const { skip } = buildPagination(page, limit);

    const filter: any = { schoolSlug, isActive: true };
    if (status) filter.status = status;
    if (stage) filter.stage = stage;
    if (gradeApplied) filter.gradeApplied = gradeApplied;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (campusId) filter.campusId = campusId;
    if (academicYear) filter.academicYear = academicYear;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { applicationNumber: { $regex: search, $options: 'i' } },
        { guardianEmail: { $regex: search, $options: 'i' } },
        { fatherName: { $regex: search, $options: 'i' } },
      ];
    }

    const sortObj: any = {};
    sortObj[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.applicantModel.find(filter).sort(sortObj).skip(skip).limit(limit!),
      this.applicantModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit!) },
    };
  }

  async getApplicantById(id: string, schoolSlug: string) {
    const applicant = await this.applicantModel.findOne({ _id: id, schoolSlug });
    if (!applicant) throw new NotFoundException('Applicant not found');
    return applicant;
  }

  async updateApplicant(id: string, schoolSlug: string, dto: UpdateApplicantDto) {
    const applicant = await this.applicantModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: dto },
      { new: true },
    );
    if (!applicant) throw new NotFoundException('Applicant not found');
    return applicant;
  }

  async updateDocumentStatus(id: string, schoolSlug: string, dto: UpdateDocumentDto) {
    const applicant = await this.applicantModel.findOne({ _id: id, schoolSlug });
    if (!applicant) throw new NotFoundException('Applicant not found');

    const doc = applicant.documents.find(
      d => (d as any)._id.toString() === dto.documentId,
    );
    if (!doc) throw new NotFoundException('Document not found');

    doc.status = dto.status as any;
    if (dto.remarks) doc.remarks = dto.remarks;

    await applicant.save();
    return applicant;
  }

  // ============================================================
  // ENTRANCE TESTS
  // ============================================================
  async createEntranceTest(dto: CreateEntranceTestDto) {
    // Validate applicant exists
    const applicant = await this.applicantModel.findById(dto.applicantId);
    if (!applicant) throw new NotFoundException('Applicant not found');

    const test = new this.testModel({
      ...dto,
      status: 'scheduled',
      scheduledDate: new Date(dto.scheduledDate),
    });
    return test.save();
  }

  async getEntranceTests(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, applicantId } = query;
    const { skip } = buildPagination(page, limit);

    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (applicantId) filter.applicantId = new Types.ObjectId(applicantId);

    const [data, total] = await Promise.all([
      this.testModel.find(filter).sort({ scheduledDate: 1 }).skip(skip).limit(limit),
      this.testModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async submitTestResult(id: string, schoolSlug: string, dto: SubmitTestResultDto) {
    const test = await this.testModel.findOne({ _id: id, schoolSlug });
    if (!test) throw new NotFoundException('Test not found');

    const percentage = (dto.obtainedScore / test.maxScore) * 100;
    const result = percentage >= 70 ? 'pass' : percentage >= 50 ? 'borderline' : 'fail';

    const updated = await this.testModel.findByIdAndUpdate(
      id,
      {
        $set: {
          obtainedScore: dto.obtainedScore,
          percentage: parseFloat(percentage.toFixed(1)),
          result,
          status: 'completed',
          remarks: dto.remarks,
          subjectScores: dto.subjectScores || [],
        },
      },
      { new: true },
    );

    // Update applicant stage to interview if passed
    if (result === 'pass' || result === 'borderline') {
      await this.applicantModel.findByIdAndUpdate(test.applicantId, {
        $set: { stage: 'interview' },
      });
    }

    return updated;
  }

  // ============================================================
  // INTERVIEWS
  // ============================================================
  async createInterview(dto: CreateInterviewDto) {
    const applicant = await this.applicantModel.findById(dto.applicantId);
    if (!applicant) throw new NotFoundException('Applicant not found');

    const interview = new this.interviewModel({
      ...dto,
      status: 'scheduled',
      scheduledDate: new Date(dto.scheduledDate),
    });
    return interview.save();
  }

  async getInterviews(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, applicantId } = query;
    const { skip } = buildPagination(page, limit);

    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (applicantId) filter.applicantId = new Types.ObjectId(applicantId);

    const [data, total] = await Promise.all([
      this.interviewModel.find(filter).sort({ scheduledDate: 1 }).skip(skip).limit(limit),
      this.interviewModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async submitInterviewResult(id: string, schoolSlug: string, dto: SubmitInterviewResultDto) {
    const interview = await this.interviewModel.findOne({ _id: id, schoolSlug });
    if (!interview) throw new NotFoundException('Interview not found');

    const updated = await this.interviewModel.findByIdAndUpdate(
      id,
      {
        $set: {
          scores: dto.scores,
          decision: dto.decision,
          remarks: dto.remarks,
          status: 'completed',
          completedAt: new Date(),
        },
      },
      { new: true },
    );

    // Auto-update applicant status based on decision
    if (dto.decision === 'recommended') {
      await this.applicantModel.findByIdAndUpdate(interview.applicantId, {
        $set: { stage: 'decision', status: 'accepted', decisionDate: new Date() },
      });
    } else if (dto.decision === 'not_recommended') {
      await this.applicantModel.findByIdAndUpdate(interview.applicantId, {
        $set: { stage: 'decision', status: 'rejected', decisionDate: new Date() },
      });
    }

    return updated;
  }

  // ============================================================
  // ENROLLMENT
  // ============================================================
  async createEnrollment(dto: CreateEnrollmentDto) {
    const applicant = await this.applicantModel.findById(dto.applicantId);
    if (!applicant) throw new NotFoundException('Applicant not found');
    if (applicant.status !== 'accepted') {
      throw new BadRequestException('Only accepted applicants can be enrolled');
    }

    const existing = await this.enrollmentModel.findOne({ applicantId: dto.applicantId });
    if (existing) throw new ConflictException('Enrollment already exists for this applicant');

    const enrollment = new this.enrollmentModel({
      ...dto,
      status: 'pending_fee',
    });
    await enrollment.save();

    // Update applicant stage
    await this.applicantModel.findByIdAndUpdate(dto.applicantId, {
      $set: { stage: 'enrollment' },
    });

    return enrollment;
  }

  async getEnrollments(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, gradeEnrolled, academicYear } = query;
    const { skip } = buildPagination(page, limit);

    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (gradeEnrolled) filter.gradeEnrolled = gradeEnrolled;
    if (academicYear) filter.academicYear = academicYear;

    const [data, total] = await Promise.all([
      this.enrollmentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.enrollmentModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async updateEnrollment(id: string, schoolSlug: string, dto: UpdateEnrollmentDto) {
    const enrollment = await this.enrollmentModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: dto },
      { new: true },
    );
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    // If all checklist done → mark enrolled
    if (
      enrollment.admissionFeePaid &&
      enrollment.documentsComplete &&
      enrollment.classAssigned
    ) {
      enrollment.status = 'enrolled';
      enrollment.enrolledAt = new Date();
      await enrollment.save();

      const applicant = await this.applicantModel.findById(enrollment.applicantId);

      // Update applicant
      await this.applicantModel.findByIdAndUpdate(enrollment.applicantId, {
        $set: { status: 'accepted' },
      });

      await this.studentsService.createFromEnrollment({
        applicantId: enrollment.applicantId.toString(),
        studentName: enrollment.studentName,
        firstName: applicant?.firstName || '',
        lastName: applicant?.lastName || '',
        grade: enrollment.gradeEnrolled,
        section: enrollment.section,
        campusId: enrollment.campusId,
        admissionNumber: enrollment.applicationNumber,
        admissionDate: enrollment.enrolledAt,
        schoolSlug: enrollment.schoolSlug,
        academicYear: enrollment.academicYear,
        enrollmentId: (enrollment._id as Types.ObjectId).toString(),
      });
    }

    return enrollment;
  }

  // ============================================================
  // RETENTION
  // ============================================================
  async createRetention(dto: CreateRetentionDto) {
    const retention = new this.retentionModel(dto);
    return retention.save();
  }

  async getRetentionRecords(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, academicYear } = query;
    const { skip } = buildPagination(page, limit);

    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (academicYear) filter.academicYear = academicYear;

    const [data, total] = await Promise.all([
      this.retentionModel.find(filter).sort({ nextFollowUpDate: 1 }).skip(skip).limit(limit),
      this.retentionModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async updateRetention(id: string, schoolSlug: string, dto: UpdateRetentionDto) {
    const retention = await this.retentionModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { ...dto, lastInteractionDate: new Date() } },
      { new: true },
    );
    if (!retention) throw new NotFoundException('Retention record not found');
    return retention;
  }

  // ============================================================
  // REPORTS
  // ============================================================
  async getAdmissionReport(schoolSlug: string, academicYear: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const filter: any = { schoolSlug, academicYear };
    if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;

    const [
      leadsBySource, leadsByStatus,
      applicationsByStatus, applicationsByGrade,
      enrollmentsByGrade,
    ] = await Promise.all([
      this.leadModel.aggregate([
        { $match: filter },
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.leadModel.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.applicantModel.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.applicantModel.aggregate([
        { $match: filter },
        { $group: { _id: '$gradeApplied', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.enrollmentModel.aggregate([
        { $match: filter },
        { $group: { _id: '$gradeEnrolled', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      leadsBySource,
      leadsByStatus,
      applicationsByStatus,
      applicationsByGrade,
      enrollmentsByGrade,
    };
  }
}
