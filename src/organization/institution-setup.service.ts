import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BoardMember, BoardMemberDocument,
  Committee, CommitteeDocument,
  Meeting, MeetingDocument,
  Workflow, WorkflowDocument,
} from './schemas/institution-setup.schema';

@Injectable()
export class InstitutionSetupService {
  constructor(
    @InjectModel(BoardMember.name) private boardMemberModel: Model<BoardMemberDocument>,
    @InjectModel(Committee.name) private committeeModel: Model<CommitteeDocument>,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(Workflow.name) private workflowModel: Model<WorkflowDocument>,
  ) {}

  // ── Board Members ─────────────────────────────────────────
  async getBoardMembers(schoolSlug: string) {
    return this.boardMemberModel.find({ schoolSlug }).sort({ createdAt: -1 });
  }

  async createBoardMember(tenantId: string, schoolSlug: string, dto: any) {
    const member = new this.boardMemberModel({ ...dto, tenantId, schoolSlug });
    return member.save();
  }

  async updateBoardMember(id: string, schoolSlug: string, dto: any) {
    const member = await this.boardMemberModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!member) throw new NotFoundException('Board member not found');
    return member;
  }

  async deleteBoardMember(id: string, schoolSlug: string) {
    const result = await this.boardMemberModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Board member not found');
    return { message: 'Board member deleted' };
  }

  // ── Committees ────────────────────────────────────────────
  async getCommittees(schoolSlug: string) {
    return this.committeeModel.find({ schoolSlug }).sort({ createdAt: -1 });
  }

  async createCommittee(tenantId: string, schoolSlug: string, dto: any) {
    const committee = new this.committeeModel({ ...dto, tenantId, schoolSlug });
    return committee.save();
  }

  async updateCommittee(id: string, schoolSlug: string, dto: any) {
    const committee = await this.committeeModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!committee) throw new NotFoundException('Committee not found');
    return committee;
  }

  async deleteCommittee(id: string, schoolSlug: string) {
    const result = await this.committeeModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Committee not found');
    return { message: 'Committee deleted' };
  }

  // ── Meetings ──────────────────────────────────────────────
  async getMeetings(schoolSlug: string, type?: string) {
    const filter: any = { schoolSlug };
    if (type) filter.type = type;
    return this.meetingModel.find(filter).sort({ scheduledAt: -1 });
  }

  async createMeeting(tenantId: string, schoolSlug: string, dto: any) {
    const meeting = new this.meetingModel({ ...dto, tenantId, schoolSlug });
    return meeting.save();
  }

  async updateMeeting(id: string, schoolSlug: string, dto: any) {
    const meeting = await this.meetingModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  async deleteMeeting(id: string, schoolSlug: string) {
    const result = await this.meetingModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Meeting not found');
    return { message: 'Meeting deleted' };
  }

  // ── Workflows ─────────────────────────────────────────────
  async getWorkflows(schoolSlug: string) {
    return this.workflowModel.find({ schoolSlug }).sort({ createdAt: -1 });
  }

  async createWorkflow(tenantId: string, schoolSlug: string, dto: any) {
    const workflow = new this.workflowModel({ ...dto, tenantId, schoolSlug });
    return workflow.save();
  }

  async updateWorkflow(id: string, schoolSlug: string, dto: any) {
    const workflow = await this.workflowModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  async deleteWorkflow(id: string, schoolSlug: string) {
    const result = await this.workflowModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!result) throw new NotFoundException('Workflow not found');
    return { message: 'Workflow deleted' };
  }
}
