import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TeacherProfile, TeacherProfileDocument } from './schemas/teacher-profile.schema';
import { LessonPlan, LessonPlanDocument } from './schemas/lesson-plan.schema';
import { Timetable, TimetableDocument } from './schemas/timetable.schema';
import { SyllabusCoverage, SyllabusCoverageDocument } from './schemas/syllabus-coverage.schema';
import { Assignment, AssignmentDocument } from './schemas/assignment.schema';
import { BehaviourNote, BehaviourNoteDocument } from './schemas/behaviour-note.schema';

@Injectable()
export class TeachingService {
  constructor(
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    @InjectModel(LessonPlan.name) private lessonPlanModel: Model<LessonPlanDocument>,
    @InjectModel(Timetable.name) private timetableModel: Model<TimetableDocument>,
    @InjectModel(SyllabusCoverage.name) private syllabusModel: Model<SyllabusCoverageDocument>,
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

  async getTeacherProfiles(tenantId: string) {
    return this.teacherProfileModel
      .find({ tenantId: this.tid(tenantId) })
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

  async getLessonPlans(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.teacherId) filter.teacherId = new Types.ObjectId(query.teacherId);
    if (query.status) filter.status = query.status;
    if (query.subject) filter.subject = query.subject;
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    return this.lessonPlanModel.find(filter).sort({ planDate: -1 }).limit(100).lean();
  }

  async createLessonPlan(tenantId: string, institutionId: string, data: any) {
    const { objectives, teacherId, ...rest } = data;
    const payload: any = {
      ...rest,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
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

  async getTimetables(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    if (query.sectionName) filter.sectionName = query.sectionName;
    if (query.academicYearId) filter.academicYearId = new Types.ObjectId(query.academicYearId);
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
      return await this.timetableModel.create({
        ...data,
        academicYearId,
        campusId,
        tenantId: this.tid(tenantId),
        institutionId: new Types.ObjectId(institutionId),
        createdBy: new Types.ObjectId(userId),
      });
    } catch (err: any) {
      if (err.name === 'ValidationError') throw new BadRequestException(err.message);
      throw err;
    }
  }

  async updateTimetable(tenantId: string, id: string, data: any) {
    return this.timetableModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
  }

  async getTeacherTimetable(tenantId: string, staffId: string) {
    return this.timetableModel.find({
      tenantId: this.tid(tenantId),
      'periods.teacherId': new Types.ObjectId(staffId),
      status: 'active',
    }).lean();
  }

  // ── SYLLABUS ──────────────────────────────────────────────────────────────────

  async getSyllabusCoverage(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.teacherId) filter.teacherId = new Types.ObjectId(query.teacherId);
    if (query.subject) filter.subject = query.subject;
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    return this.syllabusModel.find(filter).lean();
  }

  async upsertSyllabusCoverage(tenantId: string, institutionId: string, data: any) {
    const { teacherId, subject, gradeLevel, academicYearId } = data;
    return this.syllabusModel.findOneAndUpdate(
      {
        tenantId: this.tid(tenantId),
        teacherId: new Types.ObjectId(teacherId),
        subject,
        gradeLevel,
        academicYearId: new Types.ObjectId(academicYearId),
      },
      {
        $set: {
          ...data,
          tenantId: this.tid(tenantId),
          institutionId: new Types.ObjectId(institutionId),
          lastUpdatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    ).lean();
  }

  async updateChapterCoverage(tenantId: string, id: string, chapterIndex: number, data: any) {
    const coverage = await this.syllabusModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!coverage) throw new NotFoundException('Coverage record not found');

    const field = `chapters.${chapterIndex}`;
    const update: any = { [`${field}.isCovered`]: data.isCovered };
    if (data.isCovered) update[`${field}.coveredDate`] = new Date();
    if (data.notes) update[`${field}.notes`] = data.notes;

    const updated = await this.syllabusModel.findByIdAndUpdate(
      id, { $set: update }, { new: true },
    ).lean();

    const covered = (updated as any).chapters.filter((c: any) => c.isCovered).length;
    const total = (updated as any).chapters.length;
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    const trackStatus = pct === 100 ? 'completed' : pct >= 60 ? 'on_track' : pct > 0 ? 'behind' : 'not_started';

    return this.syllabusModel.findByIdAndUpdate(
      id,
      { $set: { coveredTopics: covered, totalTopics: total, coveragePct: pct, trackStatus } },
      { new: true },
    ).lean();
  }

  // ── ASSIGNMENTS ───────────────────────────────────────────────────────────────

  async getAssignments(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.teacherId) filter.teacherId = new Types.ObjectId(query.teacherId);
    if (query.status) filter.status = query.status;
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    return this.assignmentModel.find(filter).sort({ dueDate: -1 }).lean();
  }

  async createAssignment(tenantId: string, institutionId: string, data: any) {
    const { teacherId, assessmentType, assessmentDate, dueDate, assignedDate, type, ...rest } = data;
    const payload: any = {
      ...rest,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
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

  async getBehaviourNotes(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (query.type) filter.type = query.type;
    if (query.gradeLevel) filter.gradeLevel = query.gradeLevel;
    return this.behaviourModel.find(filter).sort({ incidentDate: -1 }).limit(100).lean();
  }

  async createBehaviourNote(tenantId: string, institutionId: string, data: any) {
    try {
      return await this.behaviourModel.create({
        ...data,
        tenantId: this.tid(tenantId),
        institutionId: new Types.ObjectId(institutionId),
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
