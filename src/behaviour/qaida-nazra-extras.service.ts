// ============================================================
// QAIDA/NAZRA EXTRAS SERVICE — settings, invigilator assessments,
// home recitation log
// Eldermin ERP | NestJS
// ============================================================

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  QaidaNazraSettings, QaidaNazraSettingsDocument, DEFAULT_INVIGILATOR_KPIS,
  InvigilatorAssessment, InvigilatorAssessmentDocument,
  HomeRecitationLog, HomeRecitationLogDocument,
} from './schemas/qaida-nazra-extras.schema';
import { RecordInvigilatorAssessmentsDto, RecordHomeRecitationLogDto, UpdateQaidaNazraSettingsDto } from './dto/qaida-nazra-extras.dto';
import { assertValidObjectId } from '../common/utils/object-id.util';
import { Student, StudentDocument } from '../students/schemas/student.schema';

@Injectable()
export class QaidaNazraExtrasService {
  constructor(
    @InjectModel(QaidaNazraSettings.name) private settingsModel: Model<QaidaNazraSettingsDocument>,
    @InjectModel(InvigilatorAssessment.name) private invigilatorModel: Model<InvigilatorAssessmentDocument>,
    @InjectModel(HomeRecitationLog.name) private homeLogModel: Model<HomeRecitationLogDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
  ) {}

  // ── Settings ─────────────────────────────────────────────────
  // Same "return a sensible default without creating a doc" convention as
  // BehaviourService.getCharacterSettings - a school sees working defaults
  // (standard Juzz order, the 5 named KPIs) until they explicitly customize.
  async getSettings(schoolSlug: string) {
    const existing = await this.settingsModel.findOne({ schoolSlug }).lean();
    if (existing) return existing;
    return {
      schoolSlug,
      nazraReverseOrder: false,
      invigilatorKpis: DEFAULT_INVIGILATOR_KPIS,
      invigilatorRatingScale: { min: 1, max: 5, labels: [] },
    };
  }

  async updateSettings(schoolSlug: string, dto: UpdateQaidaNazraSettingsDto) {
    return this.settingsModel.findOneAndUpdate(
      { schoolSlug },
      { $set: dto },
      { upsert: true, new: true },
    );
  }

  // ── Invigilator assessments ─────────────────────────────────
  // One visit to a class/group is one call: visit-level fields (date,
  // invigilator) are shared across every student entry in the batch,
  // rather than forcing N separate round trips for the same visit.
  async recordAssessments(schoolSlug: string, academicYear: string, dto: RecordInvigilatorAssessmentsDto, recordedBy: string, recordedById?: string) {
    const settings = await this.getSettings(schoolSlug);
    const validKeys = new Set((settings.invigilatorKpis || []).map((k: any) => k.key));
    const { min, max } = settings.invigilatorRatingScale || { min: 1, max: 5 };
    const visitDate = dto.visitDate ? new Date(dto.visitDate) : new Date();

    if (dto.invigilatorType === 'internal' && !dto.invigilatorStaffId) {
      throw new BadRequestException('invigilatorStaffId is required for an internal invigilator');
    }
    if (!dto.entries?.length) throw new BadRequestException('At least one student entry is required');

    // Denormalize name/grade/section/campusId from the roster, the same
    // convention every other record in this module follows - looked up in
    // bulk here (rather than requiring the frontend to pass it per entry)
    // since a batch visit is, in practice, one whole class/section.
    const studentIds = dto.entries.map((e) => e.studentId);
    const students = await this.studentModel.find({ _id: { $in: studentIds }, schoolSlug })
      .select('_id firstName middleName lastName currentGrade currentSection campusId').lean();
    const studentById = new Map(students.map((s: any) => [String(s._id), s]));

    const docs = dto.entries.map((entry) => {
      const student: any = studentById.get(entry.studentId);
      if (!student) throw new BadRequestException(`Student ${entry.studentId} not found at this school`);
      for (const s of entry.scores) {
        if (!validKeys.has(s.key)) throw new BadRequestException(`Unknown KPI key: ${s.key}`);
        if (s.score < min || s.score > max) {
          throw new BadRequestException(`Score for ${s.key} must be between ${min} and ${max}`);
        }
      }
      const overallScore = entry.scores.length
        ? Math.round((entry.scores.reduce((sum, s) => sum + s.score, 0) / entry.scores.length) * 100) / 100
        : undefined;
      return {
        studentId: new Types.ObjectId(entry.studentId),
        studentName: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' '),
        grade: student.currentGrade,
        section: student.currentSection,
        campusId: student.campusId || null,
        program: dto.program,
        takhtiOrParaNumber: entry.takhtiOrParaNumber,
        visitDate,
        invigilatorType: dto.invigilatorType,
        invigilatorStaffId: dto.invigilatorStaffId ? new Types.ObjectId(dto.invigilatorStaffId) : undefined,
        invigilatorName: dto.invigilatorName,
        invigilatorOrganization: dto.invigilatorOrganization,
        scores: entry.scores,
        overallScore,
        overallRemarks: entry.overallRemarks,
        recordedBy,
        recordedById: recordedById ? new Types.ObjectId(recordedById) : undefined,
        schoolSlug,
        academicYear,
      };
    });

    return this.invigilatorModel.insertMany(docs);
  }

  async getAssessmentsForStudent(studentId: string, schoolSlug: string, program?: string) {
    assertValidObjectId(studentId, 'student');
    const filter: any = { studentId: new Types.ObjectId(studentId), schoolSlug };
    if (program) filter.program = program;
    return this.invigilatorModel.find(filter).sort({ visitDate: -1 }).lean();
  }

  // ── Home recitation log (parent-reported, reference only) ───
  async logHomeEntry(studentId: string, schoolSlug: string, dto: RecordHomeRecitationLogDto, guardianId: string, guardianName: string) {
    assertValidObjectId(studentId, 'student');
    return this.homeLogModel.create({
      studentId: new Types.ObjectId(studentId),
      program: dto.program,
      date: dto.date ? new Date(dto.date) : new Date(),
      takhtiNumber: dto.takhtiNumber,
      paraNumber: dto.paraNumber,
      pageFrom: dto.pageFrom,
      pageTo: dto.pageTo,
      tutorName: dto.tutorName,
      notes: dto.notes,
      loggedByGuardianId: new Types.ObjectId(guardianId),
      loggedByGuardianName: guardianName,
      schoolSlug,
    });
  }

  async getHomeLog(studentId: string, schoolSlug: string, program?: string) {
    assertValidObjectId(studentId, 'student');
    const filter: any = { studentId: new Types.ObjectId(studentId), schoolSlug };
    if (program) filter.program = program;
    return this.homeLogModel.find(filter).sort({ date: -1 }).limit(100).lean();
  }

  async deleteHomeEntry(entryId: string, schoolSlug: string, guardianId: string) {
    assertValidObjectId(entryId, 'entry');
    // A guardian may only delete their own logged entry (never the
    // school's official progress, and never another guardian's entry even
    // for the same student).
    const entry = await this.homeLogModel.findOne({ _id: entryId, schoolSlug });
    if (!entry) throw new NotFoundException('Home log entry not found');
    if (String(entry.loggedByGuardianId) !== String(guardianId)) {
      throw new BadRequestException('You can only remove an entry you logged yourself');
    }
    await entry.deleteOne();
    return { message: 'Entry removed' };
  }
}
