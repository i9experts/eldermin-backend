import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Institution, InstitutionDocument } from './schemas/institution.schema';
import { Campus, CampusDocument } from './schemas/campus.schema';
import { AcademicYear, AcademicYearDocument } from './schemas/academic-year.schema';
import { Department, DepartmentDocument } from './schemas/department.schema';
import { Committee, CommitteeDocument } from './schemas/committee.schema';
import { BoardMember, BoardMemberDocument } from './schemas/board-member.schema';
import { Policy, PolicyDocument } from './schemas/policy.schema';
import { Meeting, MeetingDocument } from './schemas/meeting.schema';
import { ApprovalRequest, ApprovalRequestDocument } from './schemas/approval-request.schema';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Institution.name) private institutionModel: Model<InstitutionDocument>,
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(AcademicYear.name) private academicYearModel: Model<AcademicYearDocument>,
    @InjectModel(Department.name) private departmentModel: Model<DepartmentDocument>,
    @InjectModel(Committee.name) private committeeModel: Model<CommitteeDocument>,
    @InjectModel(BoardMember.name) private boardMemberModel: Model<BoardMemberDocument>,
    @InjectModel(Policy.name) private policyModel: Model<PolicyDocument>,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(ApprovalRequest.name) private approvalModel: Model<ApprovalRequestDocument>,
  ) {}

  async getInstitution(tenantId: string) {
    const institution = await this.institutionModel.findOne({ tenantId: new Types.ObjectId(tenantId) }).lean();
    if (!institution) {
      return this.institutionModel.create({
        tenantId: new Types.ObjectId(tenantId),
        name: 'Eldermin Demo School',
        type: 'school',
        language: 'en',
        currency: 'USD',
        timezone: 'UTC',
      });
    }
    return institution;
  }

  async updateInstitution(tenantId: string, data: any) {
    return this.institutionModel.findOneAndUpdate(
      { tenantId: new Types.ObjectId(tenantId) },
      { $set: data },
      { new: true, upsert: true },
    ).lean();
  }

  async getCampuses(tenantId: string) {
    return this.campusModel.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).lean();
  }

  async createCampus(tenantId: string, data: any) {
    const institution = await this.getInstitution(tenantId);
    return this.campusModel.create({
      ...data,
      tenantId: new Types.ObjectId(tenantId),
      institutionId: institution._id,
    });
  }

  async updateCampus(tenantId: string, campusId: string, data: any) {
    const campus = await this.campusModel.findOneAndUpdate(
      { _id: campusId, tenantId: new Types.ObjectId(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
    if (!campus) throw new NotFoundException('Campus not found');
    return campus;
  }

  async deleteCampus(tenantId: string, campusId: string) {
    await this.campusModel.findOneAndUpdate(
      { _id: campusId, tenantId: new Types.ObjectId(tenantId) },
      { $set: { isActive: false } },
    );
    return { message: 'Campus deactivated' };
  }

  async getAcademicYears(tenantId: string) {
    return this.academicYearModel.find({ tenantId: new Types.ObjectId(tenantId) }).sort({ startDate: -1 }).lean();
  }

  async createAcademicYear(tenantId: string, data: any) {
    const institution = await this.getInstitution(tenantId);
    if (data.isCurrent) {
      await this.academicYearModel.updateMany(
        { tenantId: new Types.ObjectId(tenantId) },
        { $set: { isCurrent: false } },
      );
    }
    return this.academicYearModel.create({
      ...data,
      tenantId: new Types.ObjectId(tenantId),
      institutionId: institution._id,
    });
  }

  async getCurrentYear(tenantId: string) {
    return this.academicYearModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      isCurrent: true,
    }).lean();
  }

  async getDepartments(tenantId: string) {
    return this.departmentModel.find({
      tenantId: new Types.ObjectId(tenantId),
      isActive: true,
    }).lean();
  }

  async createDepartment(tenantId: string, data: any) {
    const institution = await this.getInstitution(tenantId);
    return this.departmentModel.create({
      ...data,
      tenantId: new Types.ObjectId(tenantId),
      institutionId: institution._id,
    });
  }

  async updateDepartment(tenantId: string, id: string, data: any) {
    const dept = await this.departmentModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async deleteDepartment(tenantId: string, id: string) {
    await this.departmentModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: { isActive: false } },
    );
    return { message: 'Department deactivated' };
  }

  async getCommittees(tenantId: string) {
    return this.committeeModel.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).lean();
  }

  async createCommittee(tenantId: string, data: any) {
    const institution = await this.getInstitution(tenantId);
    return this.committeeModel.create({ ...data, tenantId: new Types.ObjectId(tenantId), institutionId: institution._id });
  }

  async updateCommittee(tenantId: string, id: string, data: any) {
    return this.committeeModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }

  async deleteCommittee(tenantId: string, id: string) {
    await this.committeeModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: { isActive: false } },
    );
    return { message: 'Committee deactivated' };
  }

  async getBoardMembers(tenantId: string) {
    return this.boardMemberModel.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).lean();
  }

  async createBoardMember(tenantId: string, data: any) {
    const institution = await this.getInstitution(tenantId);
    return this.boardMemberModel.create({ ...data, tenantId: new Types.ObjectId(tenantId), institutionId: institution._id });
  }

  async updateBoardMember(tenantId: string, id: string, data: any) {
    return this.boardMemberModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }

  async deleteBoardMember(tenantId: string, id: string) {
    await this.boardMemberModel.findOneAndUpdate(
      { _id: id, tenantId: new Types.ObjectId(tenantId) },
      { $set: { isActive: false } },
    );
    return { message: 'Board member removed' };
  }

  // ── Policies ──────────────────────────────────────────────────────────
  async getPolicies(tenantId: string) {
    return this.policyModel.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).sort({ createdAt: -1 }).lean();
  }
  async createPolicy(tenantId: string, data: any) {
    const institution = await this.getInstitution(tenantId);
    return this.policyModel.create({ ...data, tenantId: new Types.ObjectId(tenantId), institutionId: institution._id });
  }
  async updatePolicy(tenantId: string, id: string, data: any) {
    return this.policyModel.findOneAndUpdate({ _id: id, tenantId: new Types.ObjectId(tenantId) }, { $set: data }, { new: true }).lean();
  }
  async deletePolicy(tenantId: string, id: string) {
    await this.policyModel.findOneAndUpdate({ _id: id, tenantId: new Types.ObjectId(tenantId) }, { $set: { isActive: false } });
    return { message: 'Policy archived' };
  }

  // ── Meetings ──────────────────────────────────────────────────────────
  async getMeetings(tenantId: string) {
    return this.meetingModel.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).sort({ scheduledAt: -1 }).lean();
  }
  async createMeeting(tenantId: string, data: any) {
    const institution = await this.getInstitution(tenantId);
    return this.meetingModel.create({ ...data, tenantId: new Types.ObjectId(tenantId), institutionId: institution._id });
  }
  async updateMeeting(tenantId: string, id: string, data: any) {
    return this.meetingModel.findOneAndUpdate({ _id: id, tenantId: new Types.ObjectId(tenantId) }, { $set: data }, { new: true }).lean();
  }
  async deleteMeeting(tenantId: string, id: string) {
    await this.meetingModel.findOneAndUpdate({ _id: id, tenantId: new Types.ObjectId(tenantId) }, { $set: { isActive: false } });
    return { message: 'Meeting cancelled' };
  }

  // ── Approvals ─────────────────────────────────────────────────────────
  async getApprovals(tenantId: string) {
    return this.approvalModel.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).sort({ createdAt: -1 }).lean();
  }
  async createApproval(tenantId: string, data: any) {
    const institution = await this.getInstitution(tenantId);
    return this.approvalModel.create({ ...data, tenantId: new Types.ObjectId(tenantId), institutionId: institution._id });
  }
  async updateApproval(tenantId: string, id: string, data: any) {
    return this.approvalModel.findOneAndUpdate({ _id: id, tenantId: new Types.ObjectId(tenantId) }, { $set: data }, { new: true }).lean();
  }
  async deleteApproval(tenantId: string, id: string) {
    await this.approvalModel.findOneAndUpdate({ _id: id, tenantId: new Types.ObjectId(tenantId) }, { $set: { isActive: false } });
    return { message: 'Approval request removed' };
  }
}
