import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BoardMember, BoardMemberDocument,
  Committee, CommitteeDocument,
  Meeting, MeetingDocument,
  Workflow, WorkflowDocument,
} from './schemas/institution-setup.schema';
import { School, SchoolDocument } from './schemas/organization.schema';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../email/whatsapp.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class InstitutionSetupService {
  constructor(
    @InjectModel(BoardMember.name) private boardMemberModel: Model<BoardMemberDocument>,
    @InjectModel(Committee.name) private committeeModel: Model<CommitteeDocument>,
    @InjectModel(Meeting.name) private meetingModel: Model<MeetingDocument>,
    @InjectModel(Workflow.name) private workflowModel: Model<WorkflowDocument>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    private emailService: EmailService,
    private whatsAppService: WhatsAppService,
    private uploadService: UploadService,
  ) {}

  // ── Board Members ─────────────────────────────────────────
  async getBoardMembers(schoolSlug: string) {
    return this.boardMemberModel.find({ schoolSlug }).sort({ createdAt: -1 });
  }

  // Board composition analytics — the metrics an organization actually
  // following international governance codes (OECD Principles, UK
  // Corporate Governance Code, BoardSource nonprofit standards) would
  // track and disclose: director-independence ratio, diversity, average
  // tenure, upcoming term expirations, and skills-matrix coverage.
  async getBoardComposition(schoolSlug: string) {
    const members = await this.boardMemberModel.find({ schoolSlug, status: 'active' }).lean();
    const total = members.length;

    const byDirectorType = { independent: 0, non_executive: 0, executive: 0 };
    const byGender: Record<string, number> = {};
    const skillsCoverage: Record<string, number> = {};
    let totalTenureDays = 0;
    let membersWithTenure = 0;
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const expiringTerms: { name: string; termEndDate: Date }[] = [];
    let conflictDeclaredCount = 0;
    let codeOfConductSignedCount = 0;

    for (const m of members as any[]) {
      if (m.directorType) byDirectorType[m.directorType as keyof typeof byDirectorType]++;
      const g = m.gender || 'not_specified';
      byGender[g] = (byGender[g] || 0) + 1;
      for (const skill of m.expertiseAreas || []) skillsCoverage[skill] = (skillsCoverage[skill] || 0) + 1;
      if (m.appointedDate) {
        totalTenureDays += (now.getTime() - new Date(m.appointedDate).getTime()) / (1000 * 60 * 60 * 24);
        membersWithTenure++;
      }
      if (m.termEndDate && new Date(m.termEndDate) <= in90Days && new Date(m.termEndDate) >= now) {
        expiringTerms.push({ name: `${m.firstName} ${m.lastName}`, termEndDate: m.termEndDate });
      }
      if (m.conflictOfInterestDeclared) conflictDeclaredCount++;
      if (m.codeOfConductSigned) codeOfConductSignedCount++;
    }

    return {
      totalMembers: total,
      independenceRatio: total > 0 ? Math.round((byDirectorType.independent / total) * 100) : 0,
      byDirectorType,
      byGender,
      genderDiversityRatio: total > 0 ? Math.round(((byGender['female'] || 0) / total) * 100) : 0,
      averageTenureYears: membersWithTenure > 0 ? Math.round((totalTenureDays / membersWithTenure / 365) * 10) / 10 : 0,
      skillsCoverage,
      expiringTerms: expiringTerms.sort((a, b) => a.termEndDate.getTime() - b.termEndDate.getTime()),
      governanceCompliance: {
        conflictOfInterestDeclaredPct: total > 0 ? Math.round((conflictDeclaredCount / total) * 100) : 0,
        codeOfConductSignedPct: total > 0 ? Math.round((codeOfConductSignedCount / total) * 100) : 0,
      },
    };
  }

  async createBoardMember(tenantId: string, schoolSlug: string, dto: any) {
    const member = new this.boardMemberModel({ ...dto, tenantId, schoolSlug });
    return member.save();
  }

  async uploadBoardMemberPhoto(id: string, schoolSlug: string, file: Express.Multer.File) {
    const { url } = await this.uploadService.uploadFile(file, 'board-member-avatars', schoolSlug);
    const member = await this.boardMemberModel
      .findOneAndUpdate({ _id: id, schoolSlug }, { $set: { profilePhotoUrl: url } }, { new: true })
      .lean();
    if (!member) throw new NotFoundException('Board member not found');
    return { profilePhotoUrl: url };
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

  async notifyMeetingMembers(meetingId: string, schoolSlug: string) {
    const meeting = await this.meetingModel.findOne({ _id: meetingId, schoolSlug }).lean();
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!meeting.committeeId) {
      return { emailsSent: 0, emailsFailed: 0, whatsapp: { sent: 0, reason: 'This meeting is not linked to a committee, so there are no members to notify.' } };
    }
    const committee = await this.committeeModel.findOne({ _id: meeting.committeeId, schoolSlug }).lean();
    if (!committee) throw new NotFoundException('Committee not found for this meeting');
    const school = await this.schoolModel.findOne({ slug: schoolSlug }).lean();
    const schoolName = (school as any)?.name || schoolSlug;

    const members = committee.members || [];
    let emailsSent = 0;
    let emailsFailed = 0;
    const failures: string[] = [];

    for (const m of members) {
      if (!m.email) continue;
      const ok = await this.emailService.sendCommitteeMeetingNotice(
        m.email, m.name, committee.name, meeting.title,
        meeting.scheduledAt.toString(), meeting.venue, meeting.agenda, schoolName,
        {
          durationMinutes: meeting.durationMinutes,
          mode: meeting.mode,
          meetingLink: meeting.meetingLink,
          chairperson: meeting.chairperson,
          minuteTaker: meeting.minuteTaker,
          agendaItems: meeting.agendaItems,
        },
      );
      if (ok) emailsSent++; else { emailsFailed++; failures.push(m.name); }
    }

    // WhatsApp: attempted honestly for every member with a number on file,
    // but nothing actually sends until a real WABA account is connected —
    // see whatsapp.service.ts for what that requires.
    const membersWithWhatsapp = members.filter(m => m.whatsapp || m.phone);
    let whatsappResult: { sent: boolean; reason?: string } = { sent: false, reason: 'No committee members have a WhatsApp number on file.' };
    if (membersWithWhatsapp.length > 0) {
      whatsappResult = await this.whatsAppService.sendTemplateMessage(
        membersWithWhatsapp[0].whatsapp || membersWithWhatsapp[0].phone || '',
        'meeting_notice',
        { committee: committee.name, meeting: meeting.title },
      );
    }

    return {
      totalMembers: members.length,
      membersWithEmail: members.filter(m => m.email).length,
      emailsSent, emailsFailed, emailFailures: failures,
      whatsapp: { attempted: membersWithWhatsapp.length, sent: whatsappResult.sent ? membersWithWhatsapp.length : 0, reason: whatsappResult.reason },
    };
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
