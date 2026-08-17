import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Substitution, SubstitutionDocument } from './schemas/substitution.schema';
import { Timetable, TimetableDocument } from './schemas/timetable.schema';
import { TeacherProfile, TeacherProfileDocument } from './schemas/teacher-profile.schema';
import { Staff, StaffDocument } from '../hr/schemas/staff.schema';
import { EmailService } from '../../email/email.service';
import { resolveCampusScope, ScopedUser } from '../../auth/scope.util';

@Injectable()
export class SubstitutionService {
  private logger = new Logger('SubstitutionService');

  constructor(
    @InjectModel(Substitution.name) private substitutionModel: Model<SubstitutionDocument>,
    @InjectModel(Timetable.name) private timetableModel: Model<TimetableDocument>,
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    private emailService: EmailService,
  ) {}

  private tid(t: string) { return t; }

  /**
   * Generates one open Substitution per period the given teacher was
   * scheduled to teach on the given date - this is the "teacher marked
   * absent -> what needs covering" step. Idempotent: re-running for the
   * same teacher+date won't duplicate fixtures already generated (the
   * schema's unique index on tenantId+date+timetableId+periodNo enforces
   * this at the database level too, as a second line of defense).
   */
  async generateFixturesForAbsence(
    tenantId: string, institutionId: string, teacherId: string, date: string,
    reason: 'absence' | 'leave' | 'training' | 'other', leaveApplicationId?: string,
  ) {
    const tid = this.tid(tenantId);
    const day = new Date(date).getDay();

    const timetables = await this.timetableModel.find({
      tenantId: tid, status: 'active', 'periods.teacherId': new Types.ObjectId(teacherId), 'periods.day': day,
    });

    const staff = await this.staffModel.findById(teacherId).lean();
    const originalTeacherName = staff ? `${(staff as any).firstName || ''} ${(staff as any).lastName || ''}`.trim() : 'Unknown';
    const campusId = (staff as any)?.campusId || null;

    const created: SubstitutionDocument[] = [];
    const alreadyExisted: string[] = [];

    for (const tt of timetables) {
      const matchingPeriods = tt.periods.filter((p: any) => p.day === day && String(p.teacherId) === String(teacherId) && p.type === 'regular');
      for (const p of matchingPeriods) {
        try {
          const fixture = await this.substitutionModel.create({
            tenantId: tid, institutionId, campusId,
            date: new Date(date), dayOfWeek: day,
            timetableId: tt._id, periodNo: p.periodNo,
            startTime: p.startTime, endTime: p.endTime,
            gradeLevel: tt.gradeLevel, sectionName: tt.sectionName,
            subject: p.subject, roomNo: p.roomNo,
            originalTeacherId: teacherId, originalTeacherName,
            reason, leaveApplicationId: leaveApplicationId || null,
            status: 'open',
          });
          created.push(fixture);
        } catch (err: any) {
          // Duplicate key = this exact fixture was already generated
          // (e.g. someone re-ran this for the same absence) - not an
          // error, just a no-op.
          if (err.code === 11000) alreadyExisted.push(`${tt.gradeLevel} ${tt.sectionName} P${p.periodNo}`);
          else throw err;
        }
      }
    }

    return {
      teacherName: originalTeacherName,
      date,
      fixturesCreated: created.length,
      fixturesAlreadyExisted: alreadyExisted.length,
      fixtures: created,
    };
  }

  /**
   * Ranks available teachers for a specific open fixture, by real
   * availability (no conflicting period at the same day+slot in ANY
   * timetable) first, then by workload (how far below their own max
   * they currently are) and subject match - matching EDAP's own
   * "Monitor Teacher Workload" + "Real-time Resource Availability".
   */
  async suggestSubstitutes(fixtureId: string, tenantId: string) {
    const tid = this.tid(tenantId);
    const fixture = await this.substitutionModel.findOne({ _id: fixtureId, tenantId: tid });
    if (!fixture) throw new NotFoundException('Fixture not found');

    const [profiles, busyTeacherIds] = await Promise.all([
      this.teacherProfileModel.find({ tenantId: tid, status: 'active' }).lean(),
      this.getBusyTeacherIds(tid, fixture.dayOfWeek, fixture.periodNo, fixture.date),
    ]);

    const candidates = (profiles as any[])
      .filter((p) => String(p.staffId) !== String(fixture.originalTeacherId))
      .filter((p) => !busyTeacherIds.has(String(p.staffId)))
      .map((p) => {
        const subjectMatch = (p.subjectsCanTeach || []).includes(fixture.subject);
        const gradeMatch = (p.gradeLevelsCanTeach || []).includes(fixture.gradeLevel);
        const workloadHeadroom = (p.maxPeriodsPerWeek || 30) - (p.currentPeriodsPerWeek || 0);
        // Higher score = better candidate: subject match matters most,
        // then having real headroom in their week, then grade match.
        const score = (subjectMatch ? 100 : 0) + (gradeMatch ? 20 : 0) + Math.max(0, workloadHeadroom);
        return {
          staffId: p.staffId, teacherName: `${p.firstName} ${p.lastName}`.trim(),
          department: p.department, subjectsCanTeach: p.subjectsCanTeach,
          currentPeriodsPerWeek: p.currentPeriodsPerWeek, maxPeriodsPerWeek: p.maxPeriodsPerWeek,
          subjectMatch, gradeMatch, score,
        };
      })
      .sort((a, b) => b.score - a.score);

    return { fixture, candidates };
  }

  /** Every teacher who already has a period at this exact day+periodNo, across any timetable - genuinely unavailable regardless of workload. */
  private async getBusyTeacherIds(tenantId: string, dayOfWeek: number, periodNo: number, date: Date): Promise<Set<string>> {
    const [timetablesWithConflict, alreadyAssignedElsewhere] = await Promise.all([
      this.timetableModel.find({
        tenantId, status: 'active',
        periods: { $elemMatch: { day: dayOfWeek, periodNo, type: 'regular' } },
      }).lean(),
      // Also exclude anyone already assigned as a substitute for a
      // different fixture at this exact same day+period - can't cover
      // two classes at once.
      this.substitutionModel.find({
        tenantId, date, periodNo, status: { $in: ['assigned', 'completed'] },
        substituteTeacherId: { $ne: null },
      }).lean(),
    ]);

    const busy = new Set<string>();
    for (const tt of timetablesWithConflict as any[]) {
      for (const p of tt.periods) {
        if (p.day === dayOfWeek && p.periodNo === periodNo && p.teacherId) busy.add(String(p.teacherId));
      }
    }
    for (const sub of alreadyAssignedElsewhere as any[]) {
      if (sub.substituteTeacherId) busy.add(String(sub.substituteTeacherId));
    }
    return busy;
  }

  async assignSubstitute(fixtureId: string, tenantId: string, substituteTeacherId: string, assignedBy: string) {
    const tid = this.tid(tenantId);
    const fixture = await this.substitutionModel.findOne({ _id: fixtureId, tenantId: tid });
    if (!fixture) throw new NotFoundException('Fixture not found');
    if (fixture.status !== 'open') throw new BadRequestException(`This fixture is already ${fixture.status}`);

    // Re-check availability at assignment time, not just at suggestion
    // time - another fixture may have taken this teacher in the
    // meantime.
    const busy = await this.getBusyTeacherIds(tid, fixture.dayOfWeek, fixture.periodNo, fixture.date);
    if (busy.has(String(substituteTeacherId))) {
      throw new BadRequestException('This teacher is no longer available for this period - they were assigned elsewhere in the meantime.');
    }

    const staff = await this.staffModel.findById(substituteTeacherId).lean();
    if (!staff) throw new NotFoundException('Substitute teacher not found');
    const substituteTeacherName = `${(staff as any).firstName || ''} ${(staff as any).lastName || ''}`.trim();

    fixture.substituteTeacherId = new Types.ObjectId(substituteTeacherId);
    fixture.substituteTeacherName = substituteTeacherName;
    fixture.status = 'assigned';
    fixture.assignedBy = assignedBy;
    fixture.assignedAt = new Date();
    await fixture.save();

    // Real-time notify - actually sends via the school's configured
    // email service if the substitute has one on file; honestly
    // reports when it can't, rather than pretending.
    if ((staff as any).email) {
      const result = await this.emailService.sendEmail({
        to: (staff as any).email,
        subject: `You've been assigned to cover ${fixture.gradeLevel} ${fixture.sectionName} — Period ${fixture.periodNo}`,
        html: `<p>Hi ${substituteTeacherName},</p><p>You've been assigned to substitute for <strong>${fixture.originalTeacherName}</strong> on <strong>${new Date(fixture.date).toDateString()}</strong>, Period ${fixture.periodNo} (${fixture.startTime}–${fixture.endTime}), subject: ${fixture.subject || 'N/A'}, room: ${fixture.roomNo || 'N/A'}.</p>`,
      });
      fixture.notifiedAt = new Date();
      fixture.notificationStatus = result.sent ? 'sent' : 'failed';
    } else {
      fixture.notificationStatus = 'no email on file for this teacher';
    }
    await fixture.save();

    return fixture;
  }

  async cancelFixture(fixtureId: string, tenantId: string) {
    const fixture = await this.substitutionModel.findOneAndUpdate(
      { _id: fixtureId, tenantId: this.tid(tenantId) },
      { $set: { status: 'cancelled' } }, { new: true },
    );
    if (!fixture) throw new NotFoundException('Fixture not found');
    return fixture;
  }

  async completeFixture(fixtureId: string, tenantId: string) {
    const fixture = await this.substitutionModel.findOneAndUpdate(
      { _id: fixtureId, tenantId: this.tid(tenantId), status: 'assigned' },
      { $set: { status: 'completed' } }, { new: true },
    );
    if (!fixture) throw new NotFoundException('Fixture not found or not in an assigned state');
    return fixture;
  }

  async getFixtures(tenantId: string, query: any, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.status) filter.status = query.status;
    if (query.date) filter.date = new Date(query.date);
    if (query.from || query.to) {
      filter.date = {};
      if (query.from) filter.date.$gte = new Date(query.from);
      if (query.to) filter.date.$lte = new Date(query.to);
    }
    if (query.teacherId) filter.$or = [{ originalTeacherId: query.teacherId }, { substituteTeacherId: query.teacherId }];
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, query.campusId) : query.campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    return this.substitutionModel.find(filter).sort({ date: -1, periodNo: 1 }).limit(200).lean();
  }

  /** "Lesson Shortfall" - fixtures that never got a substitute. Real accountability metric, not a vanity dashboard number. */
  async getLessonShortfall(tenantId: string, query: any) {
    const filter: any = { tenantId: this.tid(tenantId), status: 'open' };
    if (query.from || query.to) {
      filter.date = {};
      if (query.from) filter.date.$gte = new Date(query.from);
      if (query.to) filter.date.$lte = new Date(query.to);
    }
    const openFixtures = await this.substitutionModel.find(filter).sort({ date: -1 }).lean();
    return { count: openFixtures.length, fixtures: openFixtures };
  }

  /** "Teacher-wise Fixture" / "Performance Matrix" - who covers most, and whose classes need covering most. */
  async getTeacherWiseReport(tenantId: string, query: any) {
    const tid = this.tid(tenantId);
    const dateFilter: any = {};
    if (query.from) dateFilter.$gte = new Date(query.from);
    if (query.to) dateFilter.$lte = new Date(query.to);
    const filter: any = { tenantId: tid };
    if (Object.keys(dateFilter).length) filter.date = dateFilter;

    const [substitutedFor, coveredBy] = await Promise.all([
      this.substitutionModel.aggregate([
        { $match: filter },
        { $group: { _id: '$originalTeacherId', teacherName: { $first: '$originalTeacherName' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.substitutionModel.aggregate([
        { $match: { ...filter, substituteTeacherId: { $ne: null } } },
        { $group: { _id: '$substituteTeacherId', teacherName: { $first: '$substituteTeacherName' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      mostAbsencesNeedingCoverage: substitutedFor,
      mostSubstitutionsGiven: coveredBy,
    };
  }
}
