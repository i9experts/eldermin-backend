// ============================================================
// HOME TASKS — Tarbiyah-at-home collaboration
// Eldermin ERP | NestJS
// ============================================================

import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HomeTask, HomeTaskDocument } from './schemas/home-task.schema';
import { AssignHomeTaskDto, CompleteHomeTaskDto, ReviewHomeTaskDto } from './dto/home-task.dto';
import { assertStudentAccess, ScopedUser } from '../auth/scope.util';
import { idMatch } from '../common/utils/id-match.util';
import { ParentAccessControlService } from '../parent-access-control/parent-access-control.service';
import { BehaviourAccessContext, denyOrLog, logBehaviourGuard } from '../behaviour/behaviour-access';
import { classIncludes, classScopeFilter, loadTeacherClasses } from '../behaviour/behaviour-teacher-scope';
import { sameGrade, sameSection } from '../common/utils/class-match.util';
import { TeacherClassRef } from '../staff-portal/teacher-identity.util';

@Injectable()
export class HomeTasksService {
  constructor(
    @InjectModel(HomeTask.name) private model: Model<HomeTaskDocument>,
    @InjectModel('Student') private studentModel: Model<any>,
    private readonly parentAccess: ParentAccessControlService,
    @Optional() @InjectModel('Staff') private staffModel?: Model<any>,
    @Optional() @InjectModel('TeacherProfile') private teacherProfileModel?: Model<any>,
  ) {}

  /**
   * B1: a TEACHER may assign / review / list home tasks only for the classes they teach (class-teacher sections +
   * assignments, from the DB). Under BEHAVIOUR_GUARD_MODE=enforce an out-of-class request is 403 (lists are narrowed);
   * in log mode (default) nothing changes and a `behaviour_guard` line is written. Other roles are never class-scoped.
   */
  private async teacherClasses(user: ScopedUser | undefined, access?: BehaviourAccessContext): Promise<TeacherClassRef[] | null> {
    if (!access?.isTeacher || !user || !this.staffModel || !this.teacherProfileModel) return null;
    try {
      return await loadTeacherClasses(this.staffModel, this.teacherProfileModel, user);
    } catch (err) {
      if (access.enforce) throw err;
      denyOrLog(access, user, 'teacher_identity_unresolved', 'No staff profile is linked to this account.');
      return [];
    }
  }

  // ── Teacher side ─────────────────────────────────────────────
  async assign(schoolSlug: string, dto: AssignHomeTaskDto, assignedBy: string, assignedByUserId: string, requestingUser?: ScopedUser, access?: BehaviourAccessContext) {
    const students = await this.studentModel.find({ _id: idMatch(dto.studentIds), schoolSlug })
      .select('firstName lastName currentGrade currentSection campusId').lean();
    const classes = await this.teacherClasses(requestingUser, access);
    if (classes && students.some((s: any) => !classIncludes(classes, s.currentGrade, s.currentSection))) {
      denyOrLog(access, requestingUser, 'teacher_student_outside_classes', 'Access denied. One or more students are not in your classes.');
    }
    const tasks = await this.model.insertMany(students.map((s: any) => ({
      studentId: s._id,
      studentName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
      grade: s.currentGrade, section: s.currentSection, campusId: s.campusId || null,
      title: dto.title, description: dto.description, traitKey: dto.traitKey || null,
      assignedDate: new Date(dto.assignedDate),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assignedBy, assignedByUserId: new Types.ObjectId(assignedByUserId),
      status: 'assigned', schoolSlug,
    })));
    return { assigned: tasks.length };
  }

  async getClassTasks(schoolSlug: string, grade: string, section: string | undefined, requestingUser?: ScopedUser, access?: BehaviourAccessContext) {
    const filter: any = { schoolSlug, grade };
    if (section) filter.section = section;
    const classes = await this.teacherClasses(requestingUser, access);
    if (classes) {
      // the requested class must be one of the teacher's (a whole-grade request needs any section of that grade)
      const asked = classes.some((c) => sameGrade(c.grade, grade) && (!section || !c.section || sameSection(c.section, section)));
      if (!asked) denyOrLog(access, requestingUser, 'teacher_class_not_assigned', 'Access denied. This is not one of your classes.');
      if (access?.enforce) filter.$and = [classScopeFilter(classes)];
    }
    const rows = await this.model.find(filter).sort({ assignedDate: -1 }).limit(200).lean();
    if (classes && access && !access.enforce) {
      const outside = (rows as any[]).filter((r) => !classIncludes(classes, r.grade, r.section)).length;
      if (outside > 0) {
        logBehaviourGuard({ mode: access.mode, decision: 'would_deny', reason: `teacher_scope_would_narrow:${outside}/${rows.length}`, role: access.role, method: access.method, route: access.route, user: requestingUser });
      }
    }
    return rows;
  }

  async review(schoolSlug: string, taskId: string, dto: ReviewHomeTaskDto, requestingUser?: ScopedUser, access?: BehaviourAccessContext) {
    const classes = await this.teacherClasses(requestingUser, access);
    if (classes) {
      const existing: any = await this.model.findOne({ _id: taskId, schoolSlug }).select('grade section').lean();
      if (existing && !classIncludes(classes, existing.grade, existing.section)) {
        denyOrLog(access, requestingUser, 'teacher_task_outside_classes', 'Access denied. This task is not in one of your classes.');
      }
    }
    const task = await this.model.findOneAndUpdate(
      { _id: taskId, schoolSlug },
      { $set: { reviewRating: dto.reviewRating, reviewNotes: dto.reviewNotes, reviewedAt: new Date() } },
      { new: true },
    );
    if (!task) throw new NotFoundException('Home task not found');
    return task;
  }

  // ── Parent side (called from ParentPortalController/Service) ───
  async getTasksForStudent(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const access = await this.parentAccess.checkFeature(schoolSlug, requestingUser, studentId, 'tarbiyah_at_home');
    if (access.suspended) return { suspended: true, feature: 'tarbiyah_at_home', reason: access.reason || null };
    return this.model.find({ studentId, schoolSlug }).sort({ assignedDate: -1 }).lean();
  }

  async completeTask(studentId: string, taskId: string, requestingUser: ScopedUser, schoolSlug: string, dto: CompleteHomeTaskDto) {
    assertStudentAccess(requestingUser, studentId);
    const access = await this.parentAccess.checkFeature(schoolSlug, requestingUser, studentId, 'tarbiyah_at_home');
    if (access.suspended) return { suspended: true, feature: 'tarbiyah_at_home', reason: access.reason || null };
    const task = await this.model.findOneAndUpdate(
      { _id: taskId, studentId, schoolSlug },
      { $set: { status: 'completed', completedAt: new Date(), parentNotes: dto.parentNotes } },
      { new: true },
    );
    if (!task) throw new NotFoundException('Home task not found');
    return task;
  }
}
