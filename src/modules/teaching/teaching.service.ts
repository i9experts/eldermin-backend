import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TeacherProfile, TeacherProfileDocument } from './schemas/teacher-profile.schema';
import { LessonPlan, LessonPlanDocument } from './schemas/lesson-plan.schema';
import { Timetable, TimetableDocument } from './schemas/timetable.schema';
import { Room, RoomDocument } from './schemas/room.schema';
import { PeriodTemplate, PeriodTemplateDocument } from './schemas/period-template.schema';
import { Assignment, AssignmentDocument } from './schemas/assignment.schema';
import { BehaviourNote, BehaviourNoteDocument } from './schemas/behaviour-note.schema';
import { resolveCampusScope, resolveDepartmentScope, ScopedUser } from '../../auth/scope.util';

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
  ) {}

  private tid(t: string) { return t; }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────────

  async getDashboardStats(tenantId: string) {
    const tid = this.tid(tenantId);
    const [
      totalTeachers, activeTeachers, totalLessonPlans,
      pendingPlans, totalAssignments, overdueAssignments,
      behaviourNotes, positiveNotes,
    ] = await Promise.all([
      this.teacherProfileModel.countDocuments({ tenantId: tid }),
      this.teacherProfileModel.countDocuments({ tenantId: tid, status: 'active' }),
      this.lessonPlanModel.countDocuments({ tenantId: tid }),
      this.lessonPlanModel.countDocuments({ tenantId: tid, status: 'submitted' }),
      this.assignmentModel.countDocuments({ tenantId: tid }),
      this.assignmentModel.countDocuments({ tenantId: tid, status: 'overdue' }),
      this.behaviourModel.countDocuments({ tenantId: tid }),
      this.behaviourModel.countDocuments({ tenantId: tid, type: 'positive' }),
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

    try {
      const conflicts = await this.checkConflicts(tenantId, null, data.periods || []);
      const timetable = await this.timetableModel.create({
        ...data,
        academicYearId,
        campusId,
        tenantId: this.tid(tenantId),
        institutionId: new Types.ObjectId(institutionId),
        createdBy: new Types.ObjectId(userId),
      });
      return { ...timetable.toObject(), conflicts };
    } catch (err: any) {
      if (err.name === 'ValidationError') throw new BadRequestException(err.message);
      throw err;
    }
  }

  async updateTimetable(tenantId: string, id: string, data: any) {
    const conflicts = data.periods ? await this.checkConflicts(tenantId, id, data.periods) : [];
    const updated = await this.timetableModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
    return { ...updated, conflicts };
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

  async checkConflicts(tenantId: string, excludeTimetableId: string | null, periods: any[]) {
    const tid = this.tid(tenantId);
    const others = await this.timetableModel.find({
      tenantId: tid,
      status: { $ne: 'archived' },
      ...(excludeTimetableId ? { _id: { $ne: excludeTimetableId } } : {}),
    }).lean();

    const conflicts: { day: number; periodNo: number; type: 'teacher' | 'room'; message: string }[] = [];

    for (const p of periods) {
      if (!p.teacherId && !p.roomNo) continue;
      for (const other of others as any[]) {
        for (const op of other.periods || []) {
          if (op.day !== p.day) continue;
          if (!this.timesOverlap(p.startTime, p.endTime, op.startTime, op.endTime)) continue;

          if (p.teacherId && op.teacherId && String(p.teacherId) === String(op.teacherId)) {
            conflicts.push({
              day: p.day, periodNo: p.periodNo, type: 'teacher',
              message: `${p.teacherName || 'Teacher'} is already booked for ${other.gradeLevel} ${other.sectionName} at this time`,
            });
          }
          if (p.roomNo && op.roomNo && p.roomNo.toLowerCase() === op.roomNo.toLowerCase()) {
            conflicts.push({
              day: p.day, periodNo: p.periodNo, type: 'room',
              message: `${p.roomNo} is already booked for ${other.gradeLevel} ${other.sectionName} at this time`,
            });
          }
        }
      }
    }
    return conflicts;
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
