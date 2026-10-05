import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
import { Assignment, AssignmentDocument } from '../modules/teaching/schemas/assignment.schema';
import { Timetable, TimetableDocument } from '../modules/teaching/schemas/timetable.schema';
import { PortalUser } from './staff-portal.service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_RANGE_DAYS = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read-only teaching views for the Teacher app (additive; no existing
 * endpoint is touched). Identity is always the Staff record linked to the JWT
 * user (Staff.userId), read from the DB; nothing identity-related is taken
 * from query/body.
 */
@Injectable()
export class StaffTeachingService {
  constructor(
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Timetable.name) private timetableModel: Model<TimetableDocument>,
  ) {}

  private slugOf(user: PortalUser): string {
    if (!user.schoolSlug) throw new ForbiddenException('No school context on this account.');
    return user.schoolSlug;
  }

  private async requireStaff(user: PortalUser): Promise<StaffDocument> {
    const staff = await this.staffModel.findOne({ userId: new Types.ObjectId(user.userId), isActive: { $ne: false } });
    if (!staff) throw new ForbiddenException('No staff profile is linked to this account.');
    return staff;
  }

  // ── GET /staff-portal/homework/pending-grading ──────────────

  /**
   * Ungraded submissions across MY assignments, in ONE aggregation (no N+1).
   *
   * Field/enum citations:
   *  - Assignment.teacherId is a Staff._id (assignment.schema.ts:9, ref 'Staff');
   *    tenant scope Assignment.tenantId (:7). Assignment.status enum
   *    draft|assigned|submitted|graded|overdue (:23) - 'draft' excluded.
   *    There is no deleted/archived flag on Assignment, so none is filtered.
   *  - AssignmentSubmission.status enum pending|submitted|late|graded|missed
   *    (assignment-submission.schema.ts:25); "ungraded" = submitted | late.
   *    Rows link via assignmentId (:17), time via submittedAt (:30).
   *  - collection names: 'assignmentSubmissions' (submission schema :12).
   *
   * Sort: oldest ungraded submission first (oldestSubmittedAt asc, null last),
   * ties by dueDate asc then title. `total` is the sum of ungraded over ALL my
   * assignments, independent of `limit`.
   */
  async pendingGrading(user: PortalUser, q: any = {}) {
    this.slugOf(user);
    const staff = await this.requireStaff(user);
    const limit = this.parseLimit(q?.limit);

    const rows: any[] = await this.assignmentModel.aggregate([
      { $match: { tenantId: staff.tenantId, teacherId: staff._id, status: { $ne: 'draft' } } },
      {
        $lookup: {
          from: 'assignmentSubmissions',
          let: { aid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$assignmentId', '$$aid'] }, tenantId: staff.tenantId } },
            {
              $group: {
                _id: null,
                totalSubmissions: { $sum: 1 },
                ungraded: { $sum: { $cond: [{ $in: ['$status', ['submitted', 'late']] }, 1, 0] } },
                oldestSubmittedAt: { $min: { $cond: [{ $in: ['$status', ['submitted', 'late']] }, '$submittedAt', null] } },
              },
            },
          ],
          as: 'agg',
        },
      },
      {
        $project: {
          title: 1, subject: 1, gradeLevel: 1, sectionName: 1, dueDate: 1,
          totalSubmissions: { $ifNull: [{ $arrayElemAt: ['$agg.totalSubmissions', 0] }, 0] },
          submittedCount: { $ifNull: [{ $arrayElemAt: ['$agg.ungraded', 0] }, 0] },
          oldestSubmittedAt: { $arrayElemAt: ['$agg.oldestSubmittedAt', 0] },
        },
      },
    ]);

    const pending = rows.filter((r) => (r.submittedCount || 0) > 0);
    const total = pending.reduce((n, r) => n + r.submittedCount, 0);
    const ms = (d: any) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
    pending.sort((a, b) =>
      ms(a.oldestSubmittedAt) - ms(b.oldestSubmittedAt)
      || ms(a.dueDate) - ms(b.dueDate)
      || String(a.title).localeCompare(String(b.title)));

    const iso = (d: any) => (d ? new Date(d).toISOString() : null);
    return {
      total,
      items: pending.slice(0, limit).map((r) => ({
        assignmentId: String(r._id),
        title: r.title,
        subject: r.subject,
        gradeLevel: r.gradeLevel,
        sectionName: r.sectionName ?? null,
        dueDate: iso(r.dueDate),
        submittedCount: r.submittedCount,
        totalSubmissions: r.totalSubmissions,
        oldestSubmittedAt: iso(r.oldestSubmittedAt),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // ── GET /staff-portal/timetable ─────────────────────────────

  /**
   * The caller's OWN timetable slots for a date or a (max 14 day) range.
   *
   * Query: `date=YYYY-MM-DD` OR `from=YYYY-MM-DD&to=YYYY-MM-DD`. There is no
   * implicit "today": the server TZ is unknown (U3), the client sends the date.
   * Dates are calendar dates; dayOfWeek is computed in UTC from the string so it
   * is timezone-independent (0=Sunday, as Timetable.periods[].day, timetable.schema.ts:19).
   *
   * Source rows (timetable.schema.ts): active timetables only (:72) of the
   * caller's tenant (:7), restricted to the caller's campus when the Staff has
   * one (campusId :11; rows with campusId null stay visible - teaching
   * timetables are often unscoped - rows of OTHER campuses are not). A period
   * is mine when periods[].teacherId == Staff._id (:24), OR - for split periods,
   * whose own teacherId is left blank (:52-56) - when any
   * periods[].splitGroups[].teacherId == Staff._id (:57-66). Elective-group legs
   * (electiveGroupId :50) are ordinary periods with a top-level teacherId in
   * each class's timetable, so they are matched by the first rule. Rows with a
   * blank/absent teacherId never match.
   *
   * A/B WEEK (U1) - NOT computed. Timetable.weekCycleEnabled/cycleAnchor
   * (:75-80) are described only by a schema comment; no backend or web code
   * writes or reads cycleAnchor, so there is no verified rule for which letter
   * a date falls in. Rather than guess, every day returns weekCycle: null and
   * EVERY matching slot is returned, each carrying its own period weekCycle tag
   * ('both' | 'A' | 'B', missing -> 'both', :43). The client must not assume
   * 'A'/'B' slots all run on the same day.
   *
   * Duplicate active timetables for one class (U6): slots are deduplicated only
   * when fully identical (timetableId, day, periodNo, weekCycle, split group
   * label); different documents are never merged, and timetableId is included
   * on every slot. Times are trimmed, otherwise passed through as stored (U7).
   */
  async timetable(user: PortalUser, q: any = {}) {
    this.slugOf(user);
    const { from, to } = this.parseRange(q);
    const staff = await this.requireStaff(user);

    const filter: any = {
      tenantId: staff.tenantId,
      status: 'active',
      $or: [{ 'periods.teacherId': staff._id }, { 'periods.splitGroups.teacherId': staff._id }],
    };
    const campusId = (staff as any).campusId;
    if (campusId) filter.campusId = { $in: [campusId, null] };
    const timetables: any[] = await this.timetableModel.find(filter).lean();

    const me = String(staff._id);
    const mine = (id: any) => !!id && String(id) === me;
    const str = (v: any) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

    const byDay = new Map<number, any[]>();
    const seen = new Set<string>();
    for (const tt of timetables) {
      for (const p of tt.periods || []) {
        if (typeof p?.day !== 'number') continue;
        let splitGroup: { name: string; subject: string; roomNo: string } | null = null;
        let roomNo = str(p.roomNo);
        if (!mine(p.teacherId)) {
          const g = (p.splitGroups || []).find((x: any) => mine(x?.teacherId));
          if (!g) continue;
          splitGroup = { name: str(g.label), subject: str(p.subject), roomNo: str(g.roomNo) };
          roomNo = splitGroup.roomNo;
        }
        const weekCycle = p.weekCycle === 'A' || p.weekCycle === 'B' ? p.weekCycle : 'both';
        const key = [String(tt._id), p.day, p.periodNo, weekCycle, splitGroup?.name ?? ''].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const slot = {
          timetableId: String(tt._id),
          gradeLevel: tt.gradeLevel,
          sectionName: tt.sectionName,
          periodNo: p.periodNo,
          startTime: str(p.startTime),
          endTime: str(p.endTime),
          subject: str(p.subject),
          roomNo,
          type: p.type || 'regular',
          weekCycle,
          splitGroup,
        };
        if (!byDay.has(p.day)) byDay.set(p.day, []);
        byDay.get(p.day)!.push(slot);
      }
    }
    for (const slots of byDay.values()) {
      slots.sort((a, b) =>
        a.startTime.localeCompare(b.startTime)
        || (a.periodNo ?? 0) - (b.periodNo ?? 0)
        || a.timetableId.localeCompare(b.timetableId));
    }

    const days: any[] = [];
    const end = this.utcMs(to);
    for (let t = this.utcMs(from); t <= end; t += 86400000) {
      const d = new Date(t);
      const dow = d.getUTCDay();
      days.push({
        date: d.toISOString().slice(0, 10),
        dayOfWeek: dow,
        weekCycle: null as 'A' | 'B' | null, // U1: not determinable from code
        slots: byDay.get(dow) || [],
      });
    }
    return { from, to, days };
  }

  private utcMs(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  private validDate(v: any): string {
    if (typeof v !== 'string' || !DATE_RE.test(v)) throw new BadRequestException('Dates must be formatted YYYY-MM-DD.');
    const ms = this.utcMs(v);
    if (new Date(ms).toISOString().slice(0, 10) !== v) throw new BadRequestException('Invalid calendar date.');
    return v;
  }

  private parseRange(q: any): { from: string; to: string } {
    if (q?.date !== undefined) {
      if (q.from !== undefined || q.to !== undefined) throw new BadRequestException('Use either date, or from and to.');
      const d = this.validDate(q.date);
      return { from: d, to: d };
    }
    if (q?.from === undefined || q?.to === undefined) throw new BadRequestException('Provide date=YYYY-MM-DD, or from and to.');
    const from = this.validDate(q.from);
    const to = this.validDate(q.to);
    const span = (this.utcMs(to) - this.utcMs(from)) / 86400000;
    if (span < 0) throw new BadRequestException('"to" must not be before "from".');
    if (span + 1 > MAX_RANGE_DAYS) throw new BadRequestException(`Range may span at most ${MAX_RANGE_DAYS} days.`);
    return { from, to };
  }

  private parseLimit(v: any): number {
    const n = parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
  }
}
