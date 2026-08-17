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

  async searchByGuardianContact(schoolSlug: string, query: string) {
    if (!query || query.trim().length < 3) return [];
    const q = query.trim();
    // Search the actual source of truth (Student.guardians) rather than only
    // the Family collection — this way a match works even for students who
    // aren't linked to a family yet, which is the whole point of an "easy
    // way to assign a guardian to students" tool.
    const matches = await this.studentModel.find({
      schoolSlug,
      $or: [
        { 'guardians.phone': { $regex: q, $options: 'i' } },
        { 'guardians.cnic': { $regex: q, $options: 'i' } },
      ],
    }).select('firstName lastName currentGrade currentSection guardians familyId familyCode').lean();

    return matches.map((s: any) => {
      const matchedGuardian = (s.guardians || []).find(
        (g: any) => (g.phone && g.phone.includes(q)) || (g.cnic && g.cnic.includes(q)),
      );
      return {
        studentId: s._id,
        studentName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        grade: s.currentGrade,
        section: s.currentSection,
        guardianName: matchedGuardian?.name,
        guardianRelation: matchedGuardian?.relation,
        guardianPhone: matchedGuardian?.phone,
        guardianCnic: matchedGuardian?.cnic,
        guardianEmail: matchedGuardian?.email,
        matchedOn: matchedGuardian?.phone?.includes(q) ? 'phone' : 'cnic',
        familyId: s.familyId || null,
        familyCode: s.familyCode || null,
      };
    });
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
  // Computes proposed family groupings WITHOUT writing anything to the
  // database - the actual grouping logic (phone/CNIC matching, then
  // lastname matching on whatever's left) is unchanged from the original
  // retrofit, just separated from the write step so an admin can review
  // and approve each proposed group individually before anything is created.
  private async computeRetrofitGroups(schoolSlug: string) {
    const unlinkedStudents = await this.studentModel.find({
      schoolSlug,
      $or: [{ familyId: { $exists: false } }, { familyId: null }],
    });

    const keyMap = new Map<string, typeof unlinkedStudents>();
    const keyToGuardian = new Map<string, any>();
    for (const s of unlinkedStudents) {
      const seenKeysForThisStudent = new Set<string>();
      for (const g of s.guardians || []) {
        const keys = [g.phone ? `phone:${g.phone}` : null, g.cnic ? `cnic:${g.cnic}` : null].filter(Boolean) as string[];
        for (const key of keys) {
          if (seenKeysForThisStudent.has(key)) continue;
          seenKeysForThisStudent.add(key);
          if (!keyMap.has(key)) keyMap.set(key, []);
          keyMap.get(key)!.push(s);
          if (!keyToGuardian.has(key)) keyToGuardian.set(key, g);
        }
      }
    }

    const mergedGroups: typeof unlinkedStudents[] = [];
    const studentToGroupIndex = new Map<string, number>();
    for (const [, students] of keyMap.entries()) {
      if (students.length < 2) continue;
      const existingGroupIdx = students
        .map(s => studentToGroupIndex.get(String(s._id)))
        .find(idx => idx !== undefined);
      if (existingGroupIdx !== undefined) {
        const group = mergedGroups[existingGroupIdx];
        students.forEach(s => {
          if (!group.some(existing => String(existing._id) === String(s._id))) group.push(s);
          studentToGroupIndex.set(String(s._id), existingGroupIdx);
        });
      } else {
        const newIdx = mergedGroups.length;
        mergedGroups.push([...students]);
        students.forEach(s => studentToGroupIndex.set(String(s._id), newIdx));
      }
    }

    const stillUnlinkedIds = new Set(unlinkedStudents.map(s => String(s._id)));
    const proposedGroups: any[] = [];

    for (const students of mergedGroups) {
      const g = students[0].guardians?.find((gd: any) => gd.phone || gd.cnic) || students[0].guardians?.[0];
      proposedGroups.push({
        source: 'retrofit-phone',
        matchedOn: g?.phone ? `Phone: ${g.phone}` : g?.cnic ? `CNIC: ${g.cnic}` : 'Guardian match',
        guardianName: g?.name || '', phone: g?.phone || '', email: g?.email || '',
        students: students.map(s => ({ studentId: String(s._id), name: `${s.firstName} ${s.lastName}`.trim(), grade: (s as any).currentGrade })),
      });
      students.forEach(s => stillUnlinkedIds.delete(String(s._id)));
    }

    const remaining = unlinkedStudents.filter(s => stillUnlinkedIds.has(String(s._id)));
    const lastnameMap = new Map<string, typeof unlinkedStudents>();
    for (const s of remaining) {
      const key = (s.lastName || '').trim().toLowerCase();
      if (!key) continue;
      if (!lastnameMap.has(key)) lastnameMap.set(key, []);
      lastnameMap.get(key)!.push(s);
    }
    for (const [lastName, students] of lastnameMap.entries()) {
      if (students.length < 2) continue;
      proposedGroups.push({
        source: 'retrofit-lastname',
        matchedOn: `Shared last name: ${students[0].lastName}`,
        guardianName: '', phone: '', email: '',
        students: students.map(s => ({ studentId: String(s._id), name: `${s.firstName} ${s.lastName}`.trim(), grade: (s as any).currentGrade })),
      });
    }

    return proposedGroups;
  }

  /** Preview only - computes and returns proposed family groupings, writes nothing. */
  async previewRetrofit(schoolSlug: string) {
    const groups = await this.computeRetrofitGroups(schoolSlug);
    return {
      totalGroupsProposed: groups.length,
      totalStudentsInvolved: groups.reduce((sum, g) => sum + g.students.length, 0),
      groups,
    };
  }

  /** Creates only the specific groups an admin has reviewed and approved -
   * each entry identifies one proposed group by its studentIds, matching
   * exactly what previewRetrofit returned for that group. */
  async commitRetrofit(schoolSlug: string, approvedGroups: { studentIds: string[]; guardianName?: string; phone?: string; email?: string; source: string }[]) {
    let groupsCreated = 0;
    let studentsLinked = 0;
    for (const group of approvedGroups) {
      if (!group.studentIds || group.studentIds.length < 2) continue;
      const familyCode = await this.generateFamilyCode(schoolSlug);
      const family = new this.familyModel({
        familyCode, schoolSlug,
        primaryGuardianName: group.guardianName || '',
        phone: group.phone || '', email: group.email || '',
        source: group.source === 'retrofit-lastname' ? 'retrofit-lastname' : 'retrofit-phone',
        verified: false,
        notes: group.source === 'retrofit-lastname'
          ? `Admin-approved grouping by shared last name - please confirm this is a real family.`
          : undefined,
        studentIds: group.studentIds,
      });
      await family.save();
      for (const studentId of group.studentIds) {
        await this.studentModel.findByIdAndUpdate(studentId, {
          $set: { familyId: family._id, familyCode: family.familyCode },
        });
      }
      groupsCreated++;
      studentsLinked += group.studentIds.length;
    }
    return { groupsCreated, studentsLinked };
  }
}
