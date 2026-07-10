// ============================================================
// FAMILIES SERVICE
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Family, FamilyDocument } from './schemas/family.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';

@Injectable()
export class FamiliesService {
  constructor(
    @InjectModel(Family.name) private familyModel: Model<FamilyDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
  ) {}

  private async generateFamilyCode(schoolSlug: string): Promise<string> {
    const count = await this.familyModel.countDocuments({ schoolSlug });
    let n = count + 1;
    // Retry loop in case of race condition / gaps from manual deletion
    for (let attempts = 0; attempts < 20; attempts++) {
      const code = `FAM-${String(n).padStart(4, '0')}`;
      const exists = await this.familyModel.findOne({ schoolSlug, familyCode: code });
      if (!exists) return code;
      n++;
    }
    throw new BadRequestException('Could not generate a unique family code');
  }

  async createFamily(schoolSlug: string, dto: any) {
    const familyCode = await this.generateFamilyCode(schoolSlug);
    const family = new this.familyModel({
      ...dto, familyCode, schoolSlug, source: 'manual', verified: true,
    });
    return family.save();
  }

  async getFamilies(schoolSlug: string, search?: string, verifiedOnly?: boolean) {
    const filter: any = { schoolSlug };
    if (verifiedOnly !== undefined) filter.verified = verifiedOnly;
    if (search) {
      filter.$or = [
        { familyCode: { $regex: search, $options: 'i' } },
        { primaryGuardianName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }
    return this.familyModel.find(filter).sort({ familyCode: 1 }).lean();
  }

  async getFamilyById(id: string, schoolSlug: string) {
    const family = await this.familyModel.findOne({ _id: id, schoolSlug }).lean();
    if (!family) throw new NotFoundException('Family not found');
    const students = await this.studentModel
      .find({ familyId: new Types.ObjectId(id), schoolSlug })
      .select('firstName lastName studentId currentGrade currentSection status')
      .lean();
    return { ...family, students };
  }

  async updateFamily(id: string, schoolSlug: string, dto: any) {
    const family = await this.familyModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: dto },
      { new: true },
    );
    if (!family) throw new NotFoundException('Family not found');
    return family;
  }

  async linkStudent(familyId: string, schoolSlug: string, studentId: string) {
    const family = await this.familyModel.findOne({ _id: familyId, schoolSlug });
    if (!family) throw new NotFoundException('Family not found');
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug });
    if (!student) throw new NotFoundException('Student not found');

    // Remove from any previous family first
    if (student.familyId && String(student.familyId) !== familyId) {
      await this.familyModel.updateOne(
        { _id: student.familyId },
        { $pull: { studentIds: student._id } },
      );
    }

    await this.studentModel.findByIdAndUpdate(studentId, {
      $set: { familyId: family._id, familyCode: family.familyCode },
    });
    await this.familyModel.updateOne(
      { _id: familyId },
      { $addToSet: { studentIds: new Types.ObjectId(studentId) } },
    );
    return this.getFamilyById(familyId, schoolSlug);
  }

  async unlinkStudent(familyId: string, schoolSlug: string, studentId: string) {
    const family = await this.familyModel.findOne({ _id: familyId, schoolSlug });
    if (!family) throw new NotFoundException('Family not found');

    await this.studentModel.findByIdAndUpdate(studentId, {
      $unset: { familyId: '', familyCode: '' },
    });
    await this.familyModel.updateOne(
      { _id: familyId },
      { $pull: { studentIds: new Types.ObjectId(studentId) } },
    );
    return this.getFamilyById(familyId, schoolSlug);
  }

  async verifyFamily(id: string, schoolSlug: string) {
    const family = await this.familyModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { verified: true } },
      { new: true },
    );
    if (!family) throw new NotFoundException('Family not found');
    return family;
  }

  async deleteFamily(id: string, schoolSlug: string) {
    const family = await this.familyModel.findOne({ _id: id, schoolSlug });
    if (!family) throw new NotFoundException('Family not found');
    await this.studentModel.updateMany(
      { familyId: family._id },
      { $unset: { familyId: '', familyCode: '' } },
    );
    await this.familyModel.deleteOne({ _id: id });
    return { deleted: true };
  }

  // ============================================================
  // RETROFIT MIGRATION
  // Two-pass detection for existing students with no family link:
  //  Pass 1 (higher confidence): group by guardian phone number
  //  Pass 2 (lower confidence, demo/testing use): group by matching last name
  // Both passes create UNVERIFIED families — admin must review and confirm.
  // ============================================================
  async retrofitFamilies(schoolSlug: string) {
    const unlinkedStudents = await this.studentModel.find({
      schoolSlug,
      $or: [{ familyId: { $exists: false } }, { familyId: null }],
    });

    let phoneGroupsCreated = 0;
    let phoneStudentsLinked = 0;

    // ---- Pass 1: phone-based ----
    const phoneMap = new Map<string, typeof unlinkedStudents>();
    for (const s of unlinkedStudents) {
      const phone = s.guardians?.[0]?.phone;
      if (!phone) continue;
      if (!phoneMap.has(phone)) phoneMap.set(phone, []);
      phoneMap.get(phone)!.push(s);
    }

    const stillUnlinkedIds = new Set(unlinkedStudents.map(s => String(s._id)));

    for (const [phone, students] of phoneMap.entries()) {
      const g = students[0].guardians?.[0];
      const familyCode = await this.generateFamilyCode(schoolSlug);
      const family = new this.familyModel({
        familyCode, schoolSlug,
        primaryGuardianName: g?.name || '',
        phone, email: g?.email || '',
        source: 'retrofit-phone', verified: false,
        studentIds: students.map(s => s._id),
      });
      await family.save();
      for (const s of students) {
        await this.studentModel.findByIdAndUpdate(s._id, {
          $set: { familyId: family._id, familyCode: family.familyCode },
        });
        stillUnlinkedIds.delete(String(s._id));
      }
      phoneGroupsCreated++;
      phoneStudentsLinked += students.length;
    }

    // ---- Pass 2: lastname-based (only remaining unlinked students, groups of 2+) ----
    let lastnameGroupsCreated = 0;
    let lastnameStudentsLinked = 0;

    const remaining = unlinkedStudents.filter(s => stillUnlinkedIds.has(String(s._id)));
    const lastnameMap = new Map<string, typeof unlinkedStudents>();
    for (const s of remaining) {
      const key = (s.lastName || '').trim().toLowerCase();
      if (!key) continue;
      if (!lastnameMap.has(key)) lastnameMap.set(key, []);
      lastnameMap.get(key)!.push(s);
    }

    for (const [lastName, students] of lastnameMap.entries()) {
      if (students.length < 2) continue; // only group if 2+ share the last name
      const familyCode = await this.generateFamilyCode(schoolSlug);
      const family = new this.familyModel({
        familyCode, schoolSlug,
        primaryGuardianName: '',
        phone: '', email: '',
        source: 'retrofit-lastname', verified: false,
        notes: `Auto-grouped by shared last name "${students[0].lastName}" — UNVERIFIED, please confirm this is a real family.`,
        studentIds: students.map(s => s._id),
      });
      await family.save();
      for (const s of students) {
        await this.studentModel.findByIdAndUpdate(s._id, {
          $set: { familyId: family._id, familyCode: family.familyCode },
        });
      }
      lastnameGroupsCreated++;
      lastnameStudentsLinked += students.length;
    }

    const totalUnlinkedRemaining = unlinkedStudents.length - phoneStudentsLinked - lastnameStudentsLinked;

    return {
      totalStudentsProcessed: unlinkedStudents.length,
      phoneGroupsCreated, phoneStudentsLinked,
      lastnameGroupsCreated, lastnameStudentsLinked,
      totalUnlinkedRemaining,
      note: 'All retrofit-created families are UNVERIFIED. Review via GET /families?verifiedOnly=false and confirm each via POST /families/:id/verify.',
    };
  }
}
