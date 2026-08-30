// ============================================================
// ATTENDANCE COMPLIANCE SERVICE — Eldermin ERP | NestJS + MongoDB
//
// A read-only compliance OVERLAY over the real day-to-day attendance
// records (StudentAttendance/StaffAttendance) - never a second
// attendance-marking system. Surfaces who is falling below a
// statutory/institutional attendance-rate threshold, school-wide and
// per-campus.
//
// Tenancy wrinkle: StudentAttendance/StaffAttendance are keyed on
// tenantId (ref Tenant), not schoolSlug like the rest of Compliance -
// schoolSlug must be resolved to the real Tenant._id first, exactly
// like AuthService.getTenantContext / OnboardingService do
// (tenantModel.findOne({ slug: schoolSlug })).
// ============================================================

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant, TenantDocument } from '../modules/organization/schemas/tenant.schema';
import { Student, StudentDocument } from '../modules/students/schemas/student.schema';
import { StudentAttendance, StudentAttendanceDocument } from '../modules/students/schemas/student-attendance.schema';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { StaffAttendance, StaffAttendanceDocument } from '../modules/hr/schemas/staff-attendance.schema';
import { Campus, CampusDocument } from '../organization/schemas/organization.schema';
import {
  AttendanceComplianceSettings, AttendanceComplianceSettingsDocument,
} from './schemas/compliance.schema';
import {
  DEFAULT_MIN_STUDENT_ATTENDANCE_PERCENT, DEFAULT_MIN_STAFF_ATTENDANCE_PERCENT,
  defaultWindow, studentDayWeight, staffDayWeight, computeAttendanceRate,
  isBelowThreshold, STUDENT_NON_SCHOOL_DAY_STATUSES, STAFF_NON_WORK_DAY_STATUSES,
} from './attendance-compliance.util';

interface PersonRateRow {
  id: string;
  name: string;
  campusId: string | null;
  ratePercent: number;
  absences: number;
  daysCounted: number;
}

@Injectable()
export class AttendanceComplianceService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(StudentAttendance.name) private studentAttendanceModel: Model<StudentAttendanceDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(StaffAttendance.name) private staffAttendanceModel: Model<StaffAttendanceDocument>,
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(AttendanceComplianceSettings.name) private settingsModel: Model<AttendanceComplianceSettingsDocument>,
  ) {}

  async getSettings(schoolSlug: string) {
    const existing = await this.settingsModel.findOne({ schoolSlug }).lean();
    if (existing) return existing;
    return {
      schoolSlug,
      minStudentAttendancePercent: DEFAULT_MIN_STUDENT_ATTENDANCE_PERCENT,
      minStaffAttendancePercent: DEFAULT_MIN_STAFF_ATTENDANCE_PERCENT,
    };
  }

  async updateSettings(schoolSlug: string, data: { minStudentAttendancePercent?: number; minStaffAttendancePercent?: number }) {
    return this.settingsModel.findOneAndUpdate(
      { schoolSlug },
      { $set: { schoolSlug, ...data } },
      { upsert: true, new: true },
    );
  }

  private async resolveTenantId(schoolSlug: string): Promise<Types.ObjectId | null> {
    const tenant = await this.tenantModel.findOne({ slug: schoolSlug }).lean();
    return tenant ? (tenant._id as Types.ObjectId) : null;
  }

  private async campusNameMap(schoolSlug: string): Promise<Map<string, string>> {
    const campuses = await this.campusModel.find({ schoolSlug }).select('name').lean();
    const map = new Map<string, string>();
    for (const c of campuses) map.set(String(c._id), c.name);
    return map;
  }

  /**
   * Full attendance-compliance picture for a school over a date window:
   * school-wide + per-campus rates for students and staff, plus the
   * real below-threshold lists (name, rate, absences) an admin needs to
   * act on. Returns a genuinely empty-but-valid shape (not an error)
   * for a school with no resolvable Tenant yet.
   */
  async getAttendanceComplianceData(schoolSlug: string, query: { from?: string; to?: string } = {}) {
    const win = defaultWindow();
    const from = query.from ? new Date(query.from) : win.from;
    const to = query.to ? new Date(query.to) : win.to;
    const settings = await this.getSettings(schoolSlug);

    const tenantId = await this.resolveTenantId(schoolSlug);
    if (!tenantId) {
      return {
        window: { from, to },
        settings,
        hasTenant: false,
        students: emptySideResult(),
        staff: emptySideResult(),
      };
    }

    const campusNames = await this.campusNameMap(schoolSlug);

    const [studentRows, staffRows] = await Promise.all([
      this.computeStudentRates(tenantId, from, to),
      this.computeStaffRates(tenantId, from, to),
    ]);

    return {
      window: { from, to },
      settings,
      hasTenant: true,
      students: summarizeSide(studentRows, settings.minStudentAttendancePercent, campusNames),
      staff: summarizeSide(staffRows, settings.minStaffAttendancePercent, campusNames),
    };
  }

  private async computeStudentRates(tenantId: Types.ObjectId, from: Date, to: Date): Promise<PersonRateRow[]> {
    const grouped = await this.studentAttendanceModel.aggregate([
      { $match: { tenantId, date: { $gte: from, $lte: to } } },
      { $group: { _id: '$studentId', statuses: { $push: '$status' } } },
    ]);
    if (grouped.length === 0) return [];

    const studentIds = grouped.map((g) => g._id);
    const students = await this.studentModel
      .find({ _id: { $in: studentIds } })
      .select('personal.firstName personal.lastName admissionNo campusId')
      .lean();
    const byId = new Map(students.map((s: any) => [String(s._id), s]));

    const rows: PersonRateRow[] = [];
    for (const g of grouped) {
      const rate = computeAttendanceRate(g.statuses, studentDayWeight, STUDENT_NON_SCHOOL_DAY_STATUSES);
      if (rate === null) continue;
      const student: any = byId.get(String(g._id));
      const countable = g.statuses.filter((s: string) => !STUDENT_NON_SCHOOL_DAY_STATUSES.has(s));
      const absences = countable.filter((s: string) => studentDayWeight(s) === 0).length;
      rows.push({
        id: String(g._id),
        name: student ? `${student.personal?.firstName || ''} ${student.personal?.lastName || ''}`.trim() || student.admissionNo : String(g._id),
        campusId: student?.campusId ? String(student.campusId) : null,
        ratePercent: rate,
        absences,
        daysCounted: countable.length,
      });
    }
    return rows;
  }

  private async computeStaffRates(tenantId: Types.ObjectId, from: Date, to: Date): Promise<PersonRateRow[]> {
    const grouped = await this.staffAttendanceModel.aggregate([
      { $match: { tenantId, date: { $gte: from, $lte: to } } },
      { $group: { _id: '$staffId', statuses: { $push: '$status' } } },
    ]);
    if (grouped.length === 0) return [];

    const staffIds = grouped.map((g) => g._id);
    const staffDocs = await this.staffModel
      .find({ _id: { $in: staffIds } })
      .select('firstName lastName employeeId campusId')
      .lean();
    const byId = new Map(staffDocs.map((s: any) => [String(s._id), s]));

    const rows: PersonRateRow[] = [];
    for (const g of grouped) {
      const rate = computeAttendanceRate(g.statuses, staffDayWeight, STAFF_NON_WORK_DAY_STATUSES);
      if (rate === null) continue;
      const staff: any = byId.get(String(g._id));
      const countable = g.statuses.filter((s: string) => !STAFF_NON_WORK_DAY_STATUSES.has(s));
      const absences = countable.filter((s: string) => staffDayWeight(s) === 0).length;
      rows.push({
        id: String(g._id),
        name: staff ? `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || staff.employeeId : String(g._id),
        campusId: staff?.campusId ? String(staff.campusId) : null,
        ratePercent: rate,
        absences,
        daysCounted: countable.length,
      });
    }
    return rows;
  }
}

function emptySideResult() {
  return {
    overallRatePercent: null as number | null,
    totalWithData: 0,
    belowThresholdCount: 0,
    belowThreshold: [] as any[],
    campusBreakdown: [] as any[],
  };
}

function summarizeSide(rows: PersonRateRow[], thresholdPercent: number, campusNames: Map<string, string>) {
  if (rows.length === 0) return emptySideResult();

  const totalDays = rows.reduce((sum, r) => sum + r.daysCounted, 0);
  const weightedPresentDays = rows.reduce((sum, r) => sum + (r.ratePercent / 100) * r.daysCounted, 0);
  const overallRatePercent = totalDays > 0 ? Math.round((weightedPresentDays / totalDays) * 1000) / 10 : null;

  const belowThreshold = rows
    .filter((r) => isBelowThreshold(r.ratePercent, thresholdPercent))
    .map((r) => ({
      id: r.id, name: r.name,
      campusId: r.campusId, campusName: r.campusId ? (campusNames.get(r.campusId) || 'Unknown Campus') : 'Unassigned',
      ratePercent: r.ratePercent, absences: r.absences, daysCounted: r.daysCounted,
    }))
    .sort((a, b) => a.ratePercent - b.ratePercent);

  const campusGroups = new Map<string, PersonRateRow[]>();
  for (const r of rows) {
    const key = r.campusId || 'unassigned';
    if (!campusGroups.has(key)) campusGroups.set(key, []);
    campusGroups.get(key)!.push(r);
  }
  const campusBreakdown = Array.from(campusGroups.entries()).map(([campusId, group]) => {
    const days = group.reduce((sum, r) => sum + r.daysCounted, 0);
    const present = group.reduce((sum, r) => sum + (r.ratePercent / 100) * r.daysCounted, 0);
    return {
      campusId: campusId === 'unassigned' ? null : campusId,
      campusName: campusId === 'unassigned' ? 'Unassigned' : (campusNames.get(campusId) || 'Unknown Campus'),
      ratePercent: days > 0 ? Math.round((present / days) * 1000) / 10 : null,
      totalWithData: group.length,
      belowThresholdCount: group.filter((r) => isBelowThreshold(r.ratePercent, thresholdPercent)).length,
    };
  }).sort((a, b) => (a.campusName || '').localeCompare(b.campusName || ''));

  return {
    overallRatePercent,
    totalWithData: rows.length,
    belowThresholdCount: belowThreshold.length,
    belowThreshold,
    campusBreakdown,
  };
}
