import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TeacherProfile, TeacherProfileDocument } from './schemas/teacher-profile.schema';
import { LessonPlan, LessonPlanDocument } from './schemas/lesson-plan.schema';
import { Timetable, TimetableDocument } from './schemas/timetable.schema';
import { Room, RoomDocument } from './schemas/room.schema';
import { PeriodTemplate, PeriodTemplateDocument } from './schemas/period-template.schema';
import { Assignment, AssignmentDocument } from './schemas/assignment.schema';
import { BehaviourNote, BehaviourNoteDocument } from './schemas/behaviour-note.schema';
import { ElectiveGroup, ElectiveGroupDocument } from './schemas/elective-group.schema';
import { DutyRoster, DutyRosterDocument } from './schemas/duty-roster.schema';
import { resolveCampusScope, resolveDepartmentScope, ScopedUser } from '../../auth/scope.util';
import { PdfService } from '../../pdf/pdf.service';

@Injectable()
export class TeachingService {
  constructor(
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    @InjectModel(LessonPlan.name) private lessonPlanModel: Model<LessonPlanDocument>,
    @InjectModel(Timetable.name) private timetableModel: Model<TimetableDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(PeriodTemplate.name) private periodTemplateModel: Model<PeriodTemplateDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(BehaviourNote.name) private behaviourModel: Model<BehaviourNoteDocument>,
    @InjectModel(ElectiveGroup.name) private electiveGroupModel: Model<ElectiveGroupDocument>,
    @InjectModel(DutyRoster.name) private dutyRosterModel: Model<DutyRosterDocument>,
    private readonly pdfService: PdfService,
  ) {}

  private tid(t: string) { return t; }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────────

  async getDashboardStats(tenantId: string, requestingUser?: ScopedUser) {
    const tid = this.tid(tenantId);
    const scopeFilter: any = {};
    if (requestingUser) {
      const effectiveCampusId = resolveCampusScope(requestingUser, undefined);
      const effectiveDepartment = resolveDepartmentScope(requestingUser, undefined);
      if (effectiveCampusId) scopeFilter.campusId = effectiveCampusId;
      if (effectiveDepartment) scopeFilter.department = effectiveDepartment;
    }
    const [
      totalTeachers, activeTeachers, totalLessonPlans,
      pendingPlans, totalAssignments, overdueAssignments,
      behaviourNotes, positiveNotes,
    ] = await Promise.all([
      this.teacherProfileModel.countDocuments({ tenantId: tid, ...scopeFilter }),
      this.teacherProfileModel.countDocuments({ tenantId: tid, status: 'active', ...scopeFilter }),
      // LessonPlan/Assignment/BehaviourNote don't have a department field
      // (that's an HR concept, not a class-based one), so a department-
      // scoped Teacher's dashboard counts are campus-scoped here, same as
      // any other campus-scoped role - only the Teacher Directory counts
      // above narrow further to their own department.
      this.lessonPlanModel.countDocuments({ tenantId: tid, ...(scopeFilter.campusId ? { campusId: scopeFilter.campusId } : {}) }),
      this.lessonPlanModel.countDocuments({ tenantId: tid, status: 'submitted', ...(scopeFilter.campusId ? { campusId: scopeFilter.campusId } : {}) }),
      this.assignmentModel.countDocuments({ tenantId: tid, ...(scopeFilter.campusId ? { campusId: scopeFilter.campusId } : {}) }),
      this.assignmentModel.countDocuments({ tenantId: tid, status: 'overdue', ...(scopeFilter.campusId ? { campusId: scopeFilter.campusId } : {}) }),
      this.behaviourModel.countDocuments({ tenantId: tid, ...(scopeFilter.campusId ? { campusId: scopeFilter.campusId } : {}) }),
      this.behaviourModel.countDocuments({ tenantId: tid, type: 'positive', ...(scopeFilter.campusId ? { campusId: scopeFilter.campusId } : {}) }),
    ]);
    return {
      totalTeachers, activeTeachers, totalLessonPlans,
      pendingPlans, totalAssignments, overdueAssignments,
      behaviourNotes, positiveNotes,
    };
  }

  // ── TEACHER PROFILES ──────────────────────────────────────────────────────────

  async getTeacherProfiles(tenantId: string, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (requestingUser) {
      const effectiveCampusId = resolveCampusScope(requestingUser, undefined);
      const effectiveDepartment = resolveDepartmentScope(requestingUser, undefined);
      if (effectiveCampusId) filter.campusId = effectiveCampusId;
      if (effectiveDepartment) filter.department = effectiveDepartment;
    }
    return this.teacherProfileModel
      .find(filter)
      .sort({ lastName: 1 })
      .lean();
  }

  async getTeacherProfileByStaffId(tenantId: string, staffId: string) {
    return this.teacherProfileModel.findOne({
      tenantId: this.tid(tenantId),
      staffId: new Types.ObjectId(staffId),
    }).lean();
  }

  async createTeacherProfile(tenantId: string, institutionId: string, data: any) {
    return this.teacherProfileModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
      campusId: data.campusId ? new Types.ObjectId(data.campusId) : null,
    });
  }

  async updateTeacherProfile(tenantId: string, id: string, data: any) {
    return this.teacherProfileModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }

  async deleteTeacherProfile(tenantId: string, id: string) {
    const result = await this.teacherProfileModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
    if (result.deletedCount === 0) throw new NotFoundException('Teacher profile not found');
    return { deleted: true };
  }

  async syncTeacherProfilesFromHR(tenantId: string, institutionId: string) {
    const existing = await this.teacherProfileModel.countDocuments({ tenantId: this.tid(tenantId) });
    return { message: 'Sync initiated', existing };
  }

  // ── LESSON PLANS ──────────────────────────────────────────────────────────────

  async getLessonPlans(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.teacherId) filter.teacherId = new Types.ObjectId(query.teacherId);
    if (query.status) filter.status = query.status;
    if (query.subject) filter.subject = query.subject;
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    if (requestingUser) {
      const effectiveCampusId = resolveCampusScope(requestingUser, undefined);
      if (effectiveCampusId) filter.campusId = effectiveCampusId;
    }
    return this.lessonPlanModel.find(filter).sort({ planDate: -1 }).limit(100).lean();
  }

  async createLessonPlan(tenantId: string, institutionId: string, data: any, requestingUser?: ScopedUser) {
    const { objectives, teacherId, ...rest } = data;
    const payload: any = {
      ...rest,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
      // Stamp the creating teacher's own campus, so this lesson plan is
      // correctly scoped for anyone viewing the list later - not left
      // to whatever the client happened to send (or didn't).
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
    };
    if (objectives) payload.learningObjectives = objectives;
    if (teacherId) {
      try { payload.teacherId = new Types.ObjectId(teacherId); } catch { /* ignore invalid id */ }
    }
    try {
      return await this.lessonPlanModel.create(payload);
    } catch (err: any) {
      if (err.name === 'ValidationError') throw new BadRequestException(err.message);
      throw err;
    }
  }

  async updateLessonPlan(tenantId: string, id: string, data: any) {
    return this.lessonPlanModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }

  async approveLessonPlan(tenantId: string, id: string, userId: string, notes: string) {
    return this.lessonPlanModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: { status: 'approved', approvedBy: new Types.ObjectId(userId), approvedAt: new Date(), approverNotes: notes } },
      { new: true },
    ).lean();
  }

  async rejectLessonPlan(tenantId: string, id: string, reason: string) {
    return this.lessonPlanModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: { status: 'rejected', rejectionReason: reason } },
      { new: true },
    ).lean();
  }

  // ── TIMETABLE ─────────────────────────────────────────────────────────────────

  async getTimetables(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    if (query.sectionName) filter.sectionName = query.sectionName;
    if (query.academicYearId) filter.academicYearId = new Types.ObjectId(query.academicYearId);
    if (requestingUser) {
      const effectiveCampusId = resolveCampusScope(requestingUser, query.campusId);
      if (effectiveCampusId) filter.campusId = effectiveCampusId;
    }
    return this.timetableModel.find(filter).lean();
  }

  async createTimetable(tenantId: string, institutionId: string, data: any, userId: string) {
    let academicYearId: Types.ObjectId | null = null;
    if (data.academicYearId) {
      try { academicYearId = new Types.ObjectId(data.academicYearId); } catch { academicYearId = null; }
    }

    let campusId: Types.ObjectId | null = null;
    if (data.campusId) {
      try { campusId = new Types.ObjectId(data.campusId); } catch { campusId = null; }
    }

    // `force` (or the raw data body itself, if a caller doesn't strip it
    // before persisting) is a request-only flag, never a schema field.
    const { force, ...rest } = data;

    try {
      const conflicts = await this.checkConflicts(tenantId, null, rest.periods || []);
      // Advisory-only would let a double-booking save silently; enforce it
      // unless the caller has explicitly confirmed with force:true. Callers
      // that don't send `force` at all keep exactly today's behavior when
      // there happen to be no conflicts (2xx, conflicts: []).
      if (conflicts.length > 0 && force !== true) {
        throw new ConflictException({ message: 'Timetable conflicts detected', conflicts });
      }
      const timetable = await this.timetableModel.create({
        ...rest,
        academicYearId,
        campusId,
        tenantId: this.tid(tenantId),
        institutionId: new Types.ObjectId(institutionId),
        createdBy: new Types.ObjectId(userId),
      });
      return { ...timetable.toObject(), conflicts };
    } catch (err: any) {
      if (err instanceof ConflictException) throw err;
      if (err.name === 'ValidationError') throw new BadRequestException(err.message);
      throw err;
    }
  }

  async updateTimetable(tenantId: string, id: string, data: any) {
    const { force, ...rest } = data;
    const conflicts = rest.periods ? await this.checkConflicts(tenantId, id, rest.periods) : [];
    if (conflicts.length > 0 && force !== true) {
      throw new ConflictException({ message: 'Timetable conflicts detected', conflicts });
    }
    const updated = await this.timetableModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: rest },
      { new: true },
    ).lean();
    return { ...updated, conflicts };
  }

  async generateTimetablePdf(tenantId: string, schoolSlug: string, id: string, userId: string, templateId?: string, weekFilter?: 'A' | 'B') {
    const timetable = await this.timetableModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!timetable) throw new NotFoundException('Timetable not found');
    // Reconstruct this class's own period times from its stored periods
    // (schools can set a custom start time/break placement per class via
    // the wizard) rather than assuming a fixed default schedule.
    const periodsPerDay = timetable.periodsPerDay || 8;
    const periodTimes = Array.from({ length: periodsPerDay }, (_, i) => {
      const pNo = i + 1;
      const p = (timetable.periods || []).find((x: any) => x.periodNo === pNo && x.startTime);
      return { periodNo: pNo, startTime: p?.startTime || '', endTime: p?.endTime || '' };
    });
    return this.pdfService.generateTimetablePdf(schoolSlug, timetable, periodTimes, userId, templateId, weekFilter);
  }

  async getTeacherTimetable(tenantId: string, staffId: string) {
    return this.timetableModel.find({
      tenantId: this.tid(tenantId),
      'periods.teacherId': new Types.ObjectId(staffId),
      status: 'active',
    }).lean();
  }

  // Real conflict detection compares actual clock times, not periodNo -
  // periodNo alone is only meaningful within a single period template, so
  // two classes on different templates (e.g. Primary vs Secondary wing
  // with different daily schedules) could share a periodNo while never
  // actually overlapping in time, or vice versa. Comparing startTime/
  // endTime directly is correct regardless of which template either
  // timetable uses.
  private timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart < bEnd && bStart < aEnd;
  }

  // Two slots on the same day/time only actually clash if some week runs
  // both of them. 'both' runs every week; 'A' and 'B' each run on their
  // own alternating week, so an 'A'-only slot and a 'B'-only slot never
  // occupy the same real lesson even though they share a day/time.
  private weekCyclesClash(a: string = 'both', b: string = 'both'): boolean {
    if (a === 'both' || b === 'both') return true;
    return a === b;
  }

  // A period is normally one teacher/room booking, but a split lesson
  // (splitGroups.length >= 2) is several concurrent sub-bookings sharing
  // one day/time slot - each sub-group needs its own conflict check
  // against the rest of the school. A plain period yields exactly one slot.
  private *expandBookableSlots(p: any): Generator<{ teacherId: any; teacherName: string; roomNo: string }> {
    if (Array.isArray(p.splitGroups) && p.splitGroups.length >= 2) {
      for (const g of p.splitGroups) yield { teacherId: g.teacherId, teacherName: g.teacherName, roomNo: g.roomNo };
    } else {
      yield { teacherId: p.teacherId, teacherName: p.teacherName, roomNo: p.roomNo };
    }
  }

  async checkConflicts(tenantId: string, excludeTimetableId: string | null, periods: any[]) {
    const tid = this.tid(tenantId);
    const others = await this.timetableModel.find({
      tenantId: tid,
      status: { $ne: 'archived' },
      ...(excludeTimetableId ? { _id: { $ne: excludeTimetableId } } : {}),
    }).lean();

    const conflicts: { day: number; periodNo: number; type: 'teacher' | 'room' | 'duty'; message: string }[] = [];

    for (const p of periods) {
      for (const slot of this.expandBookableSlots(p)) {
        if (!slot.teacherId && !slot.roomNo) continue;

        for (const other of others as any[]) {
          for (const op of other.periods || []) {
            if (op.day !== p.day) continue;
            if (!this.timesOverlap(p.startTime, p.endTime, op.startTime, op.endTime)) continue;
            if (!this.weekCyclesClash(p.weekCycle, op.weekCycle)) continue;
            // Periods sharing an electiveGroupId are the same cross-class
            // booking by design (e.g. the same teacher/room drawing
            // students from 3 sections at once) - not a real clash.
            if (p.electiveGroupId && op.electiveGroupId && String(p.electiveGroupId) === String(op.electiveGroupId)) continue;

            for (const opSlot of this.expandBookableSlots(op)) {
              if (slot.teacherId && opSlot.teacherId && String(slot.teacherId) === String(opSlot.teacherId)) {
                conflicts.push({
                  day: p.day, periodNo: p.periodNo, type: 'teacher',
                  message: `${slot.teacherName || 'Teacher'} is already booked for ${other.gradeLevel} ${other.sectionName} at this time`,
                });
              }
              if (slot.roomNo && opSlot.roomNo && slot.roomNo.toLowerCase() === opSlot.roomNo.toLowerCase()) {
                conflicts.push({
                  day: p.day, periodNo: p.periodNo, type: 'room',
                  message: `${slot.roomNo} is already booked for ${other.gradeLevel} ${other.sectionName} at this time`,
                });
              }
            }
          }
        }

        if (slot.teacherId) {
          const duties = await this.dutyRosterModel.find({ tenantId: tid, teacherId: slot.teacherId, day: p.day }).lean();
          for (const d of duties) {
            if (!this.timesOverlap(p.startTime, p.endTime, d.startTime, d.endTime)) continue;
            if (!this.weekCyclesClash(p.weekCycle, d.weekCycle)) continue;
            conflicts.push({
              day: p.day, periodNo: p.periodNo, type: 'duty',
              message: `${slot.teacherName || 'Teacher'} is on ${d.title} duty at this time`,
            });
          }
        }
      }
    }
    return conflicts;
  }

  // ── ELECTIVE / CROSS-CLASS GROUPS ───────────────────────────────────────────

  async getElectiveGroups(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.academicYearId) filter.academicYearId = new Types.ObjectId(query.academicYearId);
    return this.electiveGroupModel.find(filter).lean();
  }

  // Builds the Period this group projects into each member timetable.
  // Kept a plain regular period type so the existing grid/PDF/drag-and-drop
  // code doesn't need to special-case electives at all - only the
  // electiveGroupId + electiveGroupName on the period distinguish it.
  private electiveGroupPeriod(group: any) {
    return {
      day: group.day,
      periodNo: group.periodNo,
      startTime: group.startTime,
      endTime: group.endTime,
      subject: group.subject,
      teacherId: group.teacherId || null,
      teacherName: group.teacherName || '',
      roomNo: group.roomNo || '',
      type: group.type || 'regular',
      locked: false,
      blockId: null,
      weekCycle: group.weekCycle || 'both',
      electiveGroupId: group._id,
      electiveGroupName: group.name,
      splitGroups: [],
    };
  }

  // Removes any existing period for this slot/group from every timetable
  // that's no longer (or not yet) a member, then upserts the group's period
  // into each current member's periods array, replacing whatever was in
  // that exact day/periodNo slot for that class.
  private async syncElectiveGroupPeriods(group: any, previousMemberIds: string[] = []) {
    const currentIds = group.members.map((m: any) => String(m.timetableId));
    const removedIds = previousMemberIds.filter((id) => !currentIds.includes(id));

    for (const id of removedIds) {
      await this.timetableModel.updateOne(
        { _id: id },
        { $pull: { periods: { electiveGroupId: group._id } } },
      );
    }

    const period = this.electiveGroupPeriod(group);
    for (const id of currentIds) {
      await this.timetableModel.updateOne(
        { _id: id },
        { $pull: { periods: { day: group.day, periodNo: group.periodNo } } },
      );
      await this.timetableModel.updateOne(
        { _id: id },
        { $push: { periods: period } },
      );
    }
  }

  async createElectiveGroup(tenantId: string, institutionId: string, data: any, userId: string) {
    const conflicts = await this.checkConflicts(tenantId, null, [this.electiveGroupPeriod({ ...data, _id: new Types.ObjectId() })]);
    const group = await this.electiveGroupModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
      createdBy: new Types.ObjectId(userId),
    });
    await this.syncElectiveGroupPeriods(group.toObject());
    return { ...group.toObject(), conflicts };
  }

  async updateElectiveGroup(tenantId: string, id: string, data: any) {
    const existing = await this.electiveGroupModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!existing) throw new NotFoundException('Elective group not found');
    const previousMemberIds = existing.members.map((m: any) => String(m.timetableId));

    const conflicts = await this.checkConflicts(tenantId, null, [this.electiveGroupPeriod({ ...existing, ...data, _id: existing._id })]);
    const updated = await this.electiveGroupModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
    await this.syncElectiveGroupPeriods(updated, previousMemberIds);
    return { ...updated, conflicts };
  }

  async deleteElectiveGroup(tenantId: string, id: string) {
    const group = await this.electiveGroupModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!group) throw new NotFoundException('Elective group not found');
    for (const m of group.members) {
      await this.timetableModel.updateOne(
        { _id: m.timetableId },
        { $pull: { periods: { electiveGroupId: group._id } } },
      );
    }
    await this.electiveGroupModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
    return { deleted: true };
  }

  // ── DUTY ROSTER ──────────────────────────────────────────────────────────────

  async getDutyRoster(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.academicYearId) filter.academicYearId = new Types.ObjectId(query.academicYearId);
    if (query.teacherId) filter.teacherId = new Types.ObjectId(query.teacherId);
    return this.dutyRosterModel.find(filter).sort({ day: 1, startTime: 1 }).lean();
  }

  // Duties run through the same conflict engine as lessons: a teacher
  // already teaching (or on another duty) at this day/time can't also be
  // put on duty here.
  private async checkDutyConflicts(tenantId: string, excludeDutyId: string | null, duty: any) {
    const tid = this.tid(tenantId);
    const conflicts: { type: 'teacher' | 'duty'; message: string }[] = [];

    const timetables = await this.timetableModel.find({ tenantId: tid, status: { $ne: 'archived' } }).lean();
    for (const tt of timetables) {
      for (const p of tt.periods || []) {
        if (p.day !== duty.day) continue;
        if (!this.timesOverlap(duty.startTime, duty.endTime, p.startTime, p.endTime)) continue;
        if (!this.weekCyclesClash(duty.weekCycle, p.weekCycle)) continue;
        for (const slot of this.expandBookableSlots(p)) {
          if (slot.teacherId && String(slot.teacherId) === String(duty.teacherId)) {
            conflicts.push({ type: 'teacher', message: `${duty.teacherName} is scheduled to teach ${tt.gradeLevel} ${tt.sectionName} at this time` });
          }
        }
      }
    }

    const others = await this.dutyRosterModel.find({
      tenantId: tid,
      teacherId: duty.teacherId,
      day: duty.day,
      ...(excludeDutyId ? { _id: { $ne: excludeDutyId } } : {}),
    }).lean();
    for (const d of others) {
      if (!this.timesOverlap(duty.startTime, duty.endTime, d.startTime, d.endTime)) continue;
      if (!this.weekCyclesClash(duty.weekCycle, d.weekCycle)) continue;
      conflicts.push({ type: 'duty', message: `${duty.teacherName} is already on ${d.title} duty at this time` });
    }

    return conflicts;
  }

  async createDutyRoster(tenantId: string, institutionId: string, data: any, userId: string) {
    const conflicts = await this.checkDutyConflicts(tenantId, null, data);
    const duty = await this.dutyRosterModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
      createdBy: new Types.ObjectId(userId),
    });
    return { ...duty.toObject(), conflicts };
  }

  async updateDutyRoster(tenantId: string, id: string, data: any) {
    const existing = await this.dutyRosterModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!existing) throw new NotFoundException('Duty not found');
    const conflicts = await this.checkDutyConflicts(tenantId, id, { ...existing, ...data });
    const updated = await this.dutyRosterModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
    return { ...updated, conflicts };
  }

  async deleteDutyRoster(tenantId: string, id: string) {
    await this.dutyRosterModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
    return { deleted: true };
  }

  // ── Rooms ──────────────────────────────────────────────────────────────────
  async getRooms(tenantId: string, campusId?: string, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId), isActive: true };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = new Types.ObjectId(effectiveCampusId);
    return this.roomModel.find(filter).sort({ name: 1 }).lean();
  }

  async createRoom(tenantId: string, institutionId: string, data: any) {
    return this.roomModel.create({
      ...data,
      campusId: data.campusId ? new Types.ObjectId(data.campusId) : undefined,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
    });
  }

  async updateRoom(tenantId: string, id: string, data: any) {
    const room = await this.roomModel.findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: data }, { new: true }).lean();
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  async deleteRoom(tenantId: string, id: string) {
    const room = await this.roomModel.findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: { isActive: false } });
    if (!room) throw new NotFoundException('Room not found');
    return { message: 'Room deactivated' };
  }

  // ── Period Templates ─────────────────────────────────────────────────────
  async getPeriodTemplates(tenantId: string, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId), isActive: true };
    if (requestingUser) {
      const effectiveCampusId = resolveCampusScope(requestingUser, undefined);
      if (effectiveCampusId) filter.campusId = effectiveCampusId;
    }
    return this.periodTemplateModel.find(filter).lean();
  }

  async createPeriodTemplate(tenantId: string, institutionId: string, data: any) {
    if (data.isDefault) {
      await this.periodTemplateModel.updateMany({ tenantId: this.tid(tenantId) }, { $set: { isDefault: false } });
    }
    return this.periodTemplateModel.create({
      ...data,
      campusId: data.campusId ? new Types.ObjectId(data.campusId) : undefined,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
    });
  }

  async updatePeriodTemplate(tenantId: string, id: string, data: any) {
    if (data.isDefault) {
      await this.periodTemplateModel.updateMany({ tenantId: this.tid(tenantId) }, { $set: { isDefault: false } });
    }
    const tmpl = await this.periodTemplateModel.findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: data }, { new: true }).lean();
    if (!tmpl) throw new NotFoundException('Period template not found');
    return tmpl;
  }

  async deletePeriodTemplate(tenantId: string, id: string) {
    const tmpl = await this.periodTemplateModel.findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: { isActive: false } });
    if (!tmpl) throw new NotFoundException('Period template not found');
    return { message: 'Period template deactivated' };
  }

  // Sensible generic default - a coordinator should customize this to
  // match their real school day, but it gives a genuinely usable starting
  // point instead of an empty state: 8 periods, one mid-morning break, and
  // a shorter Friday-aware structure is left for the coordinator to add as
  // a second template if their school needs one (e.g. Jumma early
  // dismissal) rather than assuming every school needs it.
  async seedDefaultPeriodTemplate(tenantId: string, institutionId: string) {
    const existing = await this.periodTemplateModel.findOne({ tenantId: this.tid(tenantId) });
    if (existing) return existing;

    const periods = [
      { periodNo: 1, label: 'Period 1', startTime: '08:00', endTime: '08:40', type: 'regular' },
      { periodNo: 2, label: 'Period 2', startTime: '08:40', endTime: '09:20', type: 'regular' },
      { periodNo: 3, label: 'Period 3', startTime: '09:20', endTime: '10:00', type: 'regular' },
      { periodNo: 4, label: 'Break', startTime: '10:00', endTime: '10:20', type: 'break' },
      { periodNo: 5, label: 'Period 4', startTime: '10:20', endTime: '11:00', type: 'regular' },
      { periodNo: 6, label: 'Period 5', startTime: '11:00', endTime: '11:40', type: 'regular' },
      { periodNo: 7, label: 'Period 6', startTime: '11:40', endTime: '12:20', type: 'regular' },
      { periodNo: 8, label: 'Lunch', startTime: '12:20', endTime: '13:00', type: 'lunch' },
      { periodNo: 9, label: 'Period 7', startTime: '13:00', endTime: '13:40', type: 'regular' },
      { periodNo: 10, label: 'Period 8', startTime: '13:40', endTime: '14:20', type: 'regular' },
    ];
    return this.periodTemplateModel.create({
      name: 'Standard Day',
      workingDays: [1, 2, 3, 4, 5],
      periods,
      isDefault: true,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
    });
  }

  // Syllabus tracking has moved entirely to the new unified SyllabusModule
  // (src/syllabus/) - this used to be a parallel, tracking-only collection
  // completely disconnected from the design-side data in the old Academics
  // Syllabus collection. The frontend now calls /syllabus directly.

  // ── ASSIGNMENTS ───────────────────────────────────────────────────────────────

  async getAssignments(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.teacherId) filter.teacherId = new Types.ObjectId(query.teacherId);
    if (query.status) filter.status = query.status;
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    if (requestingUser) {
      const effectiveCampusId = resolveCampusScope(requestingUser, undefined);
      if (effectiveCampusId) filter.campusId = effectiveCampusId;
    }
    return this.assignmentModel.find(filter).sort({ dueDate: -1 }).lean();
  }

  async createAssignment(tenantId: string, institutionId: string, data: any, requestingUser?: ScopedUser) {
    const { teacherId, assessmentType, assessmentDate, dueDate, assignedDate, type, ...rest } = data;
    const payload: any = {
      ...rest,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
      campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
      // map assessmentType → type; fall back to provided type or 'homework'
      type: assessmentType || type || 'homework',
      // map assessmentDate → both assignedDate and dueDate if not separately provided
      assignedDate: assignedDate || assessmentDate || null,
      dueDate: dueDate || assessmentDate || null,
    };
    if (teacherId) {
      try { payload.teacherId = new Types.ObjectId(teacherId); } catch { /* ignore */ }
    }
    try {
      return await this.assignmentModel.create(payload);
    } catch (err: any) {
      if (err.name === 'ValidationError') throw new BadRequestException(err.message);
      throw err;
    }
  }

  async updateAssignment(tenantId: string, id: string, data: any) {
    return this.assignmentModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }

  // ── BEHAVIOUR NOTES ───────────────────────────────────────────────────────────

  async getBehaviourNotes(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (query.type) filter.type = query.type;
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    if (requestingUser) {
      const effectiveCampusId = resolveCampusScope(requestingUser, undefined);
      if (effectiveCampusId) filter.campusId = effectiveCampusId;
    }
    return this.behaviourModel.find(filter).sort({ incidentDate: -1 }).limit(100).lean();
  }

  async createBehaviourNote(tenantId: string, institutionId: string, data: any, requestingUser?: ScopedUser) {
    try {
      return await this.behaviourModel.create({
        ...data,
        tenantId: this.tid(tenantId),
        institutionId: new Types.ObjectId(institutionId),
        campusId: requestingUser?.campusId ? new Types.ObjectId(requestingUser.campusId) : (data.campusId ? new Types.ObjectId(data.campusId) : null),
      });
    } catch (err: any) {
      if (err.name === 'ValidationError') throw new BadRequestException(err.message);
      throw err;
    }
  }

  async updateBehaviourNote(tenantId: string, id: string, data: any) {
    return this.behaviourModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }
}
