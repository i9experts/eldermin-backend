// ============================================================
// GOVERNANCE ROLLUP SERVICE — Eldermin ERP | NestJS + MongoDB
//
// Per-campus governance/compliance breakdown for a multi-campus school -
// the real, additive value on top of ComplianceService.getDashboard's
// single school-wide score. Read-only over Campus/SafeguardingCase/
// DataSubjectRequest (already schoolSlug- and campusId-scoped) plus the
// Attendance Compliance overlay's per-campus rates.
//
// Accreditation readiness is NOT campus-scoped in the data model (see
// Accreditation schema - schoolSlug only), so it's surfaced once,
// school-wide, on every campus row rather than fabricated per campus.
// ============================================================

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campus, CampusDocument } from '../organization/schemas/organization.schema';
import {
  SafeguardingCase, SafeguardingCaseDocument,
  DataSubjectRequest, DataSubjectRequestDocument,
  Accreditation, AccreditationDocument,
} from './schemas/compliance.schema';
import { isDsarOverdue } from './data-privacy.util';
import { AttendanceComplianceService } from './attendance-compliance.service';

export interface ActionItem {
  campusName: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

@Injectable()
export class GovernanceRollupService {
  constructor(
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(SafeguardingCase.name) private safeguardingModel: Model<SafeguardingCaseDocument>,
    @InjectModel(DataSubjectRequest.name) private dsarModel: Model<DataSubjectRequestDocument>,
    @InjectModel(Accreditation.name) private accreditationModel: Model<AccreditationDocument>,
    private attendanceComplianceService: AttendanceComplianceService,
  ) {}

  async getGovernanceRollup(schoolSlug: string) {
    const campuses = await this.campusModel.find({ schoolSlug, isActive: true }).sort({ name: 1 }).lean();

    // A school with zero campuses recorded yet still gets a genuinely
    // useful single "school-wide" row rather than an error/empty page.
    const campusRows = campuses.length > 0 ? campuses : [{ _id: null, name: 'School-wide (no campuses recorded)' }];

    const [safeguardingByCampus, dsarRequests, accreditations, attendance] = await Promise.all([
      this.safeguardingCountsByCampus(schoolSlug),
      this.dsarModel.find({ schoolSlug }).select('campusId dueDate status').lean(),
      this.accreditationModel.find({ schoolSlug }).select('name readinessPercentage requirements status').lean(),
      this.attendanceComplianceService.getAttendanceComplianceData(schoolSlug),
    ]);

    // Accreditation isn't campus-scoped - roll it up once, school-wide,
    // as the single mandatory-gap number, reused on every campus row.
    const mandatoryGaps = accreditations.reduce((sum, a: any) => {
      const reqs = a.requirements || [];
      return sum + reqs.filter((r: any) => r.isMandatory && r.status !== 'completed' && r.status !== 'not_applicable').length;
    }, 0);
    const avgReadiness = accreditations.length > 0
      ? Math.round(accreditations.reduce((s: number, a: any) => s + (a.readinessPercentage || 0), 0) / accreditations.length)
      : null;

    const staffCampusMap = new Map((attendance.staff.campusBreakdown || []).map((c: any) => [c.campusId, c]));
    const studentCampusMap = new Map((attendance.students.campusBreakdown || []).map((c: any) => [c.campusId, c]));

    const now = new Date();
    const actionItems: ActionItem[] = [];

    const rows = campusRows.map((c: any) => {
      const campusId = c._id ? String(c._id) : null;
      const campusName = c.name;

      const sg = safeguardingByCampus.get(campusId || 'unassigned') || { open: 0, critical: 0 };
      const overdueDsar = dsarRequests.filter((d: any) => {
        const cId = d.campusId ? String(d.campusId) : null;
        return cId === campusId && isDsarOverdue(new Date(d.dueDate), d.status, now);
      }).length;
      const staffAtt = staffCampusMap.get(campusId) as any;
      const studentAtt = studentCampusMap.get(campusId) as any;

      let score = 100;
      score -= sg.open * 5;
      score -= sg.critical * 15;
      score -= overdueDsar * 10;
      score -= (staffAtt?.belowThresholdCount || 0) * 3;
      score -= (studentAtt?.belowThresholdCount || 0) * 1;
      if (mandatoryGaps > 0) score -= Math.min(20, mandatoryGaps * 2);
      score = Math.max(0, Math.min(100, score));

      if (sg.critical > 0) {
        actionItems.push({ campusName, severity: 'critical', message: `${sg.critical} critical safeguarding case${sg.critical === 1 ? '' : 's'} at ${campusName}` });
      } else if (sg.open > 0) {
        actionItems.push({ campusName, severity: 'warning', message: `${sg.open} open safeguarding case${sg.open === 1 ? '' : 's'} at ${campusName}` });
      }
      if (overdueDsar > 0) {
        actionItems.push({ campusName, severity: 'critical', message: `${overdueDsar} overdue data subject request${overdueDsar === 1 ? '' : 's'} at ${campusName}` });
      }
      if ((staffAtt?.belowThresholdCount || 0) > 0) {
        actionItems.push({ campusName, severity: 'warning', message: `${staffAtt.belowThresholdCount} staff member${staffAtt.belowThresholdCount === 1 ? '' : 's'} below the attendance threshold at ${campusName}` });
      }
      if ((studentAtt?.belowThresholdCount || 0) > 0) {
        actionItems.push({ campusName, severity: 'info', message: `${studentAtt.belowThresholdCount} student${studentAtt.belowThresholdCount === 1 ? '' : 's'} below the attendance threshold at ${campusName}` });
      }

      return {
        campusId, campusName,
        score,
        safeguarding: sg,
        overdueDsarCount: overdueDsar,
        staffAttendance: { ratePercent: staffAtt?.ratePercent ?? null, belowThresholdCount: staffAtt?.belowThresholdCount || 0 },
        studentAttendance: { ratePercent: studentAtt?.ratePercent ?? null, belowThresholdCount: studentAtt?.belowThresholdCount || 0 },
      };
    });

    if (mandatoryGaps > 0) {
      actionItems.unshift({ campusName: 'School-wide', severity: 'warning', message: `${mandatoryGaps} mandatory accreditation requirement${mandatoryGaps === 1 ? '' : 's'} still incomplete school-wide` });
    }

    return {
      accreditation: { averageReadinessPercent: avgReadiness, mandatoryGapsCount: mandatoryGaps, count: accreditations.length },
      campuses: rows,
      actionItems,
    };
  }

  private async safeguardingCountsByCampus(schoolSlug: string): Promise<Map<string, { open: number; critical: number }>> {
    const rows = await this.safeguardingModel.aggregate([
      { $match: { schoolSlug } },
      {
        $group: {
          _id: '$campusId',
          open: { $sum: { $cond: [{ $in: ['$status', ['open', 'under_investigation']] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $and: [{ $eq: ['$severity', 'critical'] }, { $not: [{ $in: ['$status', ['resolved', 'closed']] }] }] }, 1, 0] } },
        },
      },
    ]);
    const map = new Map<string, { open: number; critical: number }>();
    for (const r of rows) {
      map.set(r._id ? String(r._id) : 'unassigned', { open: r.open, critical: r.critical });
    }
    return map;
  }
}
