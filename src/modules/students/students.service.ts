import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Student, StudentDocument } from './schemas/student.schema';
import { Guardian, GuardianDocument } from './schemas/guardian.schema';
import { StudentAttendance, StudentAttendanceDocument } from './schemas/student-attendance.schema';
import { MedicalRecord, MedicalRecordDocument } from './schemas/medical-record.schema';
import { StudentNote, StudentNoteDocument } from './schemas/student-note.schema';
import { StudentDocument as StudentDoc, StudentDocumentDocument } from './schemas/student-document.schema';
import { AcademicHistory, AcademicHistoryDocument } from './schemas/academic-history.schema';
import { EnrollmentField, EnrollmentFieldDocument } from './schemas/enrollment-field.schema';

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Guardian.name) private guardianModel: Model<GuardianDocument>,
    @InjectModel(StudentAttendance.name) private attendanceModel: Model<StudentAttendanceDocument>,
    @InjectModel(MedicalRecord.name) private medicalModel: Model<MedicalRecordDocument>,
    @InjectModel(StudentNote.name) private noteModel: Model<StudentNoteDocument>,
    @InjectModel(StudentDoc.name) private docModel: Model<StudentDocumentDocument>,
    @InjectModel(AcademicHistory.name) private historyModel: Model<AcademicHistoryDocument>,
    @InjectModel(EnrollmentField.name) private enrollmentFieldModel: Model<EnrollmentFieldDocument>,
  ) {}

  private tid(t: string) { return new Types.ObjectId(t); }

  async getDashboardStats(tenantId: string) {
    const tid = this.tid(tenantId);
    const [total, enrolled, admitted, withdrawn] = await Promise.all([
      this.studentModel.countDocuments({ tenantId: tid }),
      this.studentModel.countDocuments({ tenantId: tid, status: 'enrolled' }),
      this.studentModel.countDocuments({ tenantId: tid, status: 'admitted' }),
      this.studentModel.countDocuments({ tenantId: tid, status: 'withdrawn' }),
    ]);
    return { total, enrolled, admitted, withdrawn, prospect: total - enrolled - admitted - withdrawn };
  }

  async getStudents(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId), isActive: true };
    if (query.status) filter.status = query.status;
    if (query.search) filter.$text = { $search: query.search };
    return this.studentModel.find(filter).sort({ 'personal.firstName': 1 }).limit(100).lean();
  }

  async getStudentById(tenantId: string, id: string) {
    const student = await this.studentModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!student) throw new NotFoundException('Student not found');
    const guardians = await this.guardianModel.find({ linkedStudentIds: new Types.ObjectId(id), tenantId: this.tid(tenantId) }).lean();
    return { ...student, guardians };
  }

  async createStudent(tenantId: string, institutionId: string, campusId: string, data: any) {
    const count = await this.studentModel.countDocuments({ tenantId: this.tid(tenantId) });
    const admissionNo = `STU-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    return this.studentModel.create({
      ...data,
      admissionNo,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
      campusId: new Types.ObjectId(campusId || institutionId),
    });
  }

  async updateStudent(tenantId: string, id: string, data: any) {
    const student = await this.studentModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId) },
      { $set: data },
      { new: true },
    ).lean();
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async getGuardians(tenantId: string, studentId?: string) {
    const filter: any = { tenantId: this.tid(tenantId), isActive: true };
    if (studentId) filter.linkedStudentIds = new Types.ObjectId(studentId);
    return this.guardianModel.find(filter).lean();
  }

  async createGuardian(tenantId: string, institutionId: string, data: any) {
    const guardian = await this.guardianModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
    });
    if (data.studentId) {
      await this.guardianModel.findByIdAndUpdate(guardian._id, {
        $addToSet: { linkedStudentIds: new Types.ObjectId(data.studentId) },
      });
    }
    return guardian;
  }

  async markAttendance(tenantId: string, records: any[]) {
    const ops = records.map((r) => ({
      updateOne: {
        filter: { tenantId: this.tid(tenantId), studentId: new Types.ObjectId(r.studentId), date: new Date(r.date) },
        update: { $set: { ...r, tenantId: this.tid(tenantId) } },
        upsert: true,
      },
    }));
    await this.attendanceModel.bulkWrite(ops);
    return { message: `${records.length} attendance records saved` };
  }

  async getAttendance(tenantId: string, query: any) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (query.sectionId) filter.sectionId = new Types.ObjectId(query.sectionId);
    if (query.date) filter.date = new Date(query.date);
    return this.attendanceModel.find(filter).lean();
  }

  async getMedicalRecord(tenantId: string, studentId: string) {
    return this.medicalModel.findOne({ tenantId: this.tid(tenantId), studentId: new Types.ObjectId(studentId) }).lean();
  }

  async upsertMedicalRecord(tenantId: string, studentId: string, data: any) {
    return this.medicalModel.findOneAndUpdate(
      { tenantId: this.tid(tenantId), studentId: new Types.ObjectId(studentId) },
      { $set: { ...data, tenantId: this.tid(tenantId), studentId: new Types.ObjectId(studentId) } },
      { new: true, upsert: true },
    ).lean();
  }

  async getStudentNotes(tenantId: string, studentId: string) {
    return this.noteModel.find({ tenantId: this.tid(tenantId), studentId: new Types.ObjectId(studentId) }).sort({ createdAt: -1 }).lean();
  }

  async createStudentNote(tenantId: string, institutionId: string, studentId: string, data: any, userId: string, userName: string) {
    return this.noteModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
      studentId: new Types.ObjectId(studentId),
      createdBy: new Types.ObjectId(userId),
      createdByName: userName,
    });
  }

  async getStudentDocuments(tenantId: string, studentId: string) {
    return this.docModel.find({ tenantId: this.tid(tenantId), studentId: new Types.ObjectId(studentId) }).lean();
  }

  async createStudentDocument(tenantId: string, studentId: string, data: any, userId: string) {
    return this.docModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      studentId: new Types.ObjectId(studentId),
      uploadedBy: new Types.ObjectId(userId),
    });
  }

  async getAcademicHistory(tenantId: string, studentId: string) {
    return this.historyModel.find({ tenantId: this.tid(tenantId), studentId: new Types.ObjectId(studentId) }).sort({ yearLabel: -1 }).lean();
  }

  async createAcademicHistory(tenantId: string, studentId: string, data: any) {
    return this.historyModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      studentId: new Types.ObjectId(studentId),
    });
  }

  async getEnrollmentFields(tenantId: string) {
    return this.enrollmentFieldModel
      .find({ tenantId: this.tid(tenantId), isActive: true })
      .sort({ section: 1, sortOrder: 1 })
      .lean();
  }

  async createEnrollmentField(tenantId: string, institutionId: string, data: any) {
    return this.enrollmentFieldModel.create({
      ...data,
      tenantId: this.tid(tenantId),
      institutionId: new Types.ObjectId(institutionId),
    });
  }

  async updateEnrollmentField(tenantId: string, id: string, data: any) {
    return this.enrollmentFieldModel.findOneAndUpdate(
      { _id: id, tenantId: this.tid(tenantId), isSystemField: false },
      { $set: data },
      { new: true },
    ).lean();
  }

  async deleteEnrollmentField(tenantId: string, id: string) {
    await this.enrollmentFieldModel.findOneAndDelete({
      _id: id,
      tenantId: this.tid(tenantId),
      isSystemField: false,
    });
    return { message: 'Custom field deleted' };
  }

  async seedDefaultEnrollmentFields(tenantId: string, institutionId: string) {
    const existing = await this.enrollmentFieldModel.countDocuments({ tenantId: this.tid(tenantId) });
    if (existing > 0) return { message: 'Fields already seeded', count: existing };

    const defaultFields = [
      { label: 'Previous School Name', fieldKey: 'previousSchoolName', fieldType: 'text', section: 'admission', sortOrder: 1, isSystemField: true },
      { label: 'Previous Grade', fieldKey: 'previousGrade', fieldType: 'text', section: 'admission', sortOrder: 2, isSystemField: true },
      { label: 'Transfer Certificate No', fieldKey: 'transferCertNo', fieldType: 'text', section: 'admission', sortOrder: 3, isSystemField: true },
      { label: 'Admission Type', fieldKey: 'admissionType', fieldType: 'select', options: ['new','transfer','readmission','lateral'], section: 'admission', sortOrder: 4, isRequired: true, isSystemField: true },
      { label: 'Nationality', fieldKey: 'nationality', fieldType: 'text', section: 'personal', sortOrder: 1, isSystemField: true },
      { label: 'Second Nationality', fieldKey: 'secondNationality', fieldType: 'text', section: 'personal', sortOrder: 2, isSystemField: true },
      { label: 'Religion', fieldKey: 'religion', fieldType: 'select', options: ['Islam','Christianity','Hinduism','Judaism','Buddhism','Other'], section: 'personal', sortOrder: 3, isSystemField: true },
      { label: 'Mother Tongue', fieldKey: 'motherTongue', fieldType: 'text', section: 'personal', sortOrder: 4, isSystemField: true },
      { label: 'Place of Birth', fieldKey: 'placeOfBirth', fieldType: 'text', section: 'personal', sortOrder: 5, isSystemField: true },
      { label: 'Passport Number', fieldKey: 'passportNo', fieldType: 'text', section: 'personal', sortOrder: 6, isSystemField: true },
      { label: 'National ID', fieldKey: 'nationalId', fieldType: 'text', section: 'personal', sortOrder: 7, isSystemField: true },
      { label: 'Birth Certificate No', fieldKey: 'birthCertNo', fieldType: 'text', section: 'personal', sortOrder: 8, isSystemField: true },
      { label: 'Has Transport Service', fieldKey: 'hasTransport', fieldType: 'checkbox', section: 'services', sortOrder: 1, isSystemField: true },
      { label: 'Transport Route', fieldKey: 'transportRoute', fieldType: 'text', section: 'services', sortOrder: 2, isSystemField: true },
      { label: 'Transport Stop', fieldKey: 'transportStop', fieldType: 'text', section: 'services', sortOrder: 3, isSystemField: true },
      { label: 'Has Hostel Service', fieldKey: 'hasHostel', fieldType: 'checkbox', section: 'services', sortOrder: 4, isSystemField: true },
      { label: 'Has Cafeteria Service', fieldKey: 'hasCafeteria', fieldType: 'checkbox', section: 'services', sortOrder: 5, isSystemField: true },
      { label: 'Sibling at School', fieldKey: 'hasSibling', fieldType: 'checkbox', section: 'services', sortOrder: 6, isSystemField: true },
      { label: 'Sibling Admission No', fieldKey: 'siblingAdmissionNo', fieldType: 'text', section: 'services', sortOrder: 7, isSystemField: true },
      { label: 'Has Special Educational Needs', fieldKey: 'isSEN', fieldType: 'checkbox', section: 'health', sortOrder: 1, isSystemField: true },
      { label: 'SEN Details', fieldKey: 'senDetails', fieldType: 'textarea', section: 'health', sortOrder: 2, isSystemField: true },
      { label: 'Dietary Restrictions', fieldKey: 'dietaryRestrictions', fieldType: 'text', section: 'health', sortOrder: 3, isSystemField: true },
      { label: 'PE Restrictions', fieldKey: 'peRestrictions', fieldType: 'textarea', section: 'health', sortOrder: 4, isSystemField: true },
      { label: 'Emergency Medical Action', fieldKey: 'emergencyAction', fieldType: 'textarea', section: 'health', sortOrder: 5, isSystemField: true },
    ];

    await this.enrollmentFieldModel.insertMany(
      defaultFields.map(f => ({ ...f, tenantId: this.tid(tenantId), institutionId: new Types.ObjectId(institutionId) }))
    );
    return { message: 'Default enrollment fields seeded', count: defaultFields.length };
  }
}
