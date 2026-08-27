import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ExamSession, ExamSessionDocument } from './schemas/exam-session.schema';

@Injectable()
export class ExamService {
  constructor(
    @InjectModel(ExamSession.name) private examModel: Model<ExamSessionDocument>,
  ) {}

  private tid(t: string) { return t; }

  async getExams(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.academicYearId) filter.academicYearId = new Types.ObjectId(query.academicYearId);
    if (query.from || query.to) {
      filter.date = {};
      if (query.from) filter.date.$gte = new Date(query.from);
      if (query.to) filter.date.$lte = new Date(query.to);
    }
    return this.examModel.find(filter).sort({ date: 1, startTime: 1 }).lean();
  }

  private timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart < bEnd && bStart < aEnd;
  }
  private sameDate(a: Date, b: Date): boolean {
    return new Date(a).toDateString() === new Date(b).toDateString();
  }

  // Reuses the same overlap-based clash shape as checkConflicts/
  // checkDutyConflicts in TeachingService (real date+clock-time overlap,
  // not a periodNo match) - here the three things that can't double-book
  // are the room, an invigilator, and a class/section sitting two exams
  // at once.
  async checkExamConflicts(tenantId: string, excludeId: string | null, exam: any) {
    const tid = this.tid(tenantId);
    const others = await this.examModel.find({
      tenantId: tid,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).lean();

    const conflicts: { type: 'room' | 'invigilator' | 'group'; message: string }[] = [];
    for (const other of others) {
      if (!this.sameDate(exam.date, other.date)) continue;
      if (!this.timesOverlap(exam.startTime, exam.endTime, other.startTime, other.endTime)) continue;

      if (exam.roomNo && other.roomNo && String(exam.roomNo).toLowerCase() === String(other.roomNo).toLowerCase()) {
        conflicts.push({ type: 'room', message: `${exam.roomNo} is already booked for ${other.subject} (${other.examName}) at this time` });
      }
      for (const inv of exam.invigilators || []) {
        if ((other.invigilators || []).some((o: any) => String(o.staffId) === String(inv.staffId))) {
          conflicts.push({ type: 'invigilator', message: `${inv.staffName} is already invigilating ${other.subject} (${other.examName}) at this time` });
        }
      }
      for (const g of exam.groups || []) {
        if ((other.groups || []).some((o: any) => o.gradeLevel === g.gradeLevel && o.sectionName === g.sectionName)) {
          conflicts.push({ type: 'group', message: `${g.gradeLevel} ${g.sectionName} already has ${other.subject} (${other.examName}) at this time` });
        }
      }
    }
    return conflicts;
  }

  async createExam(tenantId: string, institutionId: string, data: any, userId: string) {
    const conflicts = await this.checkExamConflicts(tenantId, null, data);
    const exam = await this.examModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
      createdBy: new Types.ObjectId(userId),
    });
    return { ...exam.toObject(), conflicts };
  }

  async updateExam(tenantId: string, id: string, data: any) {
    const existing = await this.examModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!existing) throw new NotFoundException('Exam session not found');
    const conflicts = await this.checkExamConflicts(tenantId, id, { ...existing, ...data });
    const updated = await this.examModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
    return { ...updated, conflicts };
  }

  async deleteExam(tenantId: string, id: string) {
    await this.examModel.deleteOne({ _id: id, tenantId: this.tid(tenantId) });
    return { deleted: true };
  }
}
