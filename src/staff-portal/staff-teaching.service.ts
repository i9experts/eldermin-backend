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

  private parseLimit(v: any): number {
    const n = parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
  }
}
