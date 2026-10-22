// ============================================================
// HOME TASKS — Tarbiyah-at-home collaboration
// Eldermin ERP | NestJS
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HomeTask, HomeTaskDocument } from './schemas/home-task.schema';
import { AssignHomeTaskDto, CompleteHomeTaskDto, ReviewHomeTaskDto } from './dto/home-task.dto';
import { assertStudentAccess, ScopedUser } from '../auth/scope.util';
import { idMatch } from '../common/utils/id-match.util';
import { ParentAccessControlService } from '../parent-access-control/parent-access-control.service';

@Injectable()
export class HomeTasksService {
  constructor(
    @InjectModel(HomeTask.name) private model: Model<HomeTaskDocument>,
    @InjectModel('Student') private studentModel: Model<any>,
    private readonly parentAccess: ParentAccessControlService,
  ) {}

  // ── Teacher side ─────────────────────────────────────────────
  async assign(schoolSlug: string, dto: AssignHomeTaskDto, assignedBy: string, assignedByUserId: string) {
    const students = await this.studentModel.find({ _id: idMatch(dto.studentIds), schoolSlug })
      .select('firstName lastName currentGrade currentSection campusId').lean();
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

  async getClassTasks(schoolSlug: string, grade: string, section: string | undefined) {
    const filter: any = { schoolSlug, grade };
    if (section) filter.section = section;
    return this.model.find(filter).sort({ assignedDate: -1 }).limit(200).lean();
  }

  async review(schoolSlug: string, taskId: string, dto: ReviewHomeTaskDto) {
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
