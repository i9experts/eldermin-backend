// ============================================================
// STUDENTS SERVICE — Student 360 Business Logic
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Student, StudentDocument } from './schemas/student.schema';
import {
  StudentAttendance, StudentAttendanceDocument,
  StudentFee, StudentFeeDocument,
  Behaviour, BehaviourDocument,
  AssessmentResult, AssessmentResultDocument,
} from './schemas/student-supporting.schema';

import {
  CreateStudentDto, UpdateStudentDto, StudentQueryDto,
  MarkAttendanceDto, BulkAttendanceDto, AttendanceQueryDto,
  CreateFeeDto, CollectFeeDto, FeeQueryDto,
  CreateBehaviourDto, UpdateBehaviourDto, BehaviourQueryDto,
  CreateAssessmentResultDto,
} from './dto/student.dto';

const paged = (page = 1, limit = 20) => ({ skip: (page - 1) * limit, limit });

const GRADE_MAP: Record<string, number> = {
  'A+': 4.0, 'A': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
  'C+': 2.3, 'C': 2.0, 'D': 1.0, 'F': 0,
};

const percentToGrade = (pct: number): string => {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
};

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(StudentAttendance.name) private attendanceModel: Model<StudentAttendanceDocument>,
    @InjectModel(StudentFee.name) private feeModel: Model<StudentFeeDocument>,
    @InjectModel(Behaviour.name) private behaviourModel: Model<BehaviourDocument>,
    @InjectModel(AssessmentResult.name) private resultModel: Model<AssessmentResultDocument>,
  ) {}

  // ============================================================
  // STUDENT CRUD
  // ============================================================
  async createStudent(dto: CreateStudentDto): Promise<Student> {
    const student = new this.studentModel(dto);
    return student.save();
  }

  // Called automatically when Enrollment is completed
  async createFromEnrollment(enrollmentData: {
    applicantId: string; studentName: string; firstName: string;
    lastName: string; grade: string; section?: string; campusId: string;
    admissionNumber: string; admissionDate: Date; schoolSlug: string;
    academicYear: string; enrollmentId: string;
  }): Promise<Student> {
    const existing = await this.studentModel.findOne({
      admissionNumber: enrollmentData.admissionNumber,
      schoolSlug: enrollmentData.schoolSlug,
    });
    if (existing) return existing;

    const student = new this.studentModel({
      firstName: enrollmentData.firstName,
      lastName: enrollmentData.lastName,
      currentGrade: enrollmentData.grade,
      currentSection: enrollmentData.section,
      currentAcademicYear: enrollmentData.academicYear,
      campusId: enrollmentData.campusId,
      admissionNumber: enrollmentData.admissionNumber,
      admissionDate: enrollmentData.admissionDate,
      applicantId: new Types.ObjectId(enrollmentData.applicantId),
      enrollmentId: new Types.ObjectId(enrollmentData.enrollmentId),
      schoolSlug: enrollmentData.schoolSlug,
      status: 'active',
    });
    return student.save();
  }

  async getStudents(schoolSlug: string, query: StudentQueryDto) {
    const { page, limit, search, sortBy, sortOrder,
      grade, section, status, gender, academicYear, scholarshipHolder, specialNeeds } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (grade) filter.currentGrade = grade;
    if (section) filter.currentSection = section;
    if (status) filter.status = status;
    if (gender) filter.gender = gender;
    if (academicYear) filter.currentAcademicYear = academicYear;
    if (scholarshipHolder !== undefined) filter.scholarshipHolder = scholarshipHolder;
    if (specialNeeds !== undefined) filter.specialNeeds = specialNeeds;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
        { 'guardians.phone': { $regex: search, $options: 'i' } },
        { 'guardians.email': { $regex: search, $options: 'i' } },
      ];
    }

    const sort: any = {};
    sort[sortBy || 'createdAt'] = sortOrder === 'asc' ? 1 : -1;

    const [data, total] = await Promise.all([
      this.studentModel.find(filter).sort(sort).skip(skip).limit(limit!),
      this.studentModel.countDocuments(filter),
    ]);

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async getStudentById(id: string, schoolSlug: string): Promise<Student> {
    const student = await this.studentModel.findOne({ _id: id, schoolSlug });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async getStudentByStudentId(studentId: string, schoolSlug: string): Promise<Student> {
    const student = await this.studentModel.findOne({ studentId, schoolSlug });
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async updateStudent(id: string, schoolSlug: string, dto: UpdateStudentDto): Promise<Student> {
    const student = await this.studentModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  // ============================================================
  // STUDENT 360 — Full Profile
  // ============================================================
  async getStudent360(id: string, schoolSlug: string) {
    const student = await this.studentModel.findOne({ _id: id, schoolSlug });
    if (!student) throw new NotFoundException('Student not found');

    const sid = new Types.ObjectId(id);
    const currentYear = student.currentAcademicYear;

    const [
      attendanceSummary, recentAttendance,
      feeSummary, recentFees,
      behaviourSummary, recentBehaviour,
      recentResults,
    ] = await Promise.all([
      // Attendance summary for current year
      this.attendanceModel.aggregate([
        { $match: { studentId: sid, academicYear: currentYear } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // Last 30 attendance records
      this.attendanceModel.find({ studentId: sid })
        .sort({ date: -1 }).limit(30).lean(),
      // Fee summary
      this.feeModel.aggregate([
        { $match: { studentId: sid, academicYear: currentYear } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$netAmount' },
        }},
      ]),
      // Last 6 fee records
      this.feeModel.find({ studentId: sid })
        .sort({ month: -1 }).limit(6).lean(),
      // Behaviour summary
      this.behaviourModel.aggregate([
        { $match: { studentId: sid, academicYear: currentYear } },
        { $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalPoints: { $sum: '$points' },
        }},
      ]),
      // Last 10 behaviour records
      this.behaviourModel.find({ studentId: sid })
        .sort({ date: -1 }).limit(10).lean(),
      // Last 5 assessment results
      this.resultModel.find({ studentId: sid })
        .sort({ date: -1 }).limit(5).lean(),
    ]);

    // Compute attendance percentage
    const attMap = attendanceSummary.reduce((a: any, s: any) => {
      a[s._id] = s.count; return a;
    }, {} as any);
    const totalDays = Object.values(attMap).reduce((a: any, b: any) => a + b, 0) as number;
    const presentDays = (attMap['present'] || 0) + (attMap['late'] || 0);
    const attendancePercentage = totalDays > 0
      ? parseFloat(((presentDays / totalDays) * 100).toFixed(1)) : 0;

    // Compute fee totals
    const feeMap = feeSummary.reduce((a: any, s: any) => {
      a[s._id] = { count: s.count, total: s.total }; return a;
    }, {} as any);

    // Compute behaviour points
    const behaviourMap = behaviourSummary.reduce((a: any, s: any) => {
      a[s._id] = { count: s.count, points: s.totalPoints }; return a;
    }, {} as any);

    return {
      student,
      attendance: {
        summary: attMap,
        totalDays,
        presentDays,
        percentage: attendancePercentage,
        recent: recentAttendance,
      },
      fees: {
        summary: feeMap,
        recent: recentFees,
      },
      behaviour: {
        summary: behaviourMap,
        totalPoints: (behaviourMap['positive']?.points || 0) -
                     (behaviourMap['negative']?.points || 0),
        recent: recentBehaviour,
      },
      assessments: {
        recent: recentResults,
      },
    };
  }

  // ============================================================
  // DASHBOARD STATS
  // ============================================================
  async getDashboardStats(schoolSlug: string, academicYear?: string) {
    const filter: any = { schoolSlug };
    if (academicYear) filter.currentAcademicYear = academicYear;

    const [
      totalStudents, activeStudents, maleCount, femaleCount,
      gradeDistribution, newThisMonth, scholarship, specialNeeds,
    ] = await Promise.all([
      this.studentModel.countDocuments({ schoolSlug }),
      this.studentModel.countDocuments({ ...filter, status: 'active' }),
      this.studentModel.countDocuments({ ...filter, gender: 'male', status: 'active' }),
      this.studentModel.countDocuments({ ...filter, gender: 'female', status: 'active' }),
      this.studentModel.aggregate([
        { $match: { ...filter, status: 'active' } },
        { $group: { _id: '$currentGrade', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.studentModel.countDocuments({
        schoolSlug,
        createdAt: { $gte: new Date(new Date().setDate(1)) },
      }),
      this.studentModel.countDocuments({ ...filter, scholarshipHolder: true }),
      this.studentModel.countDocuments({ ...filter, specialNeeds: true }),
    ]);

    // Today's attendance summary
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAttendance = await this.attendanceModel.aggregate([
      { $match: { schoolSlug, date: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const attMap = todayAttendance.reduce((a: any, s: any) => {
      a[s._id] = s.count; return a;
    }, {} as any);

    // Fee collection this month
    const monthStart = new Date(new Date().setDate(1));
    const feesThisMonth = await this.feeModel.aggregate([
      { $match: { schoolSlug, paidDate: { $gte: monthStart } } },
      { $group: { _id: '$status', total: { $sum: '$paidAmount' } } },
    ]);

    // Outstanding fees
    const outstanding = await this.feeModel.aggregate([
      { $match: { schoolSlug, status: { $in: ['pending', 'overdue'] } } },
      { $group: { _id: null, total: { $sum: '$netAmount' } } },
    ]);

    return {
      students: {
        total: totalStudents, active: activeStudents,
        male: maleCount, female: femaleCount,
        newThisMonth, scholarship, specialNeeds,
      },
      gradeDistribution,
      todayAttendance: {
        present: attMap['present'] || 0,
        absent: attMap['absent'] || 0,
        late: attMap['late'] || 0,
        total: Object.values(attMap).reduce((a: any, b: any) => a + b, 0) as number,
      },
      fees: {
        collectedThisMonth: feesThisMonth.reduce((a: any, s: any) => a + (s.total || 0), 0),
        outstanding: outstanding[0]?.total || 0,
      },
    };
  }

  // ============================================================
  // ATTENDANCE
  // ============================================================
  async markAttendance(dto: MarkAttendanceDto) {
    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    return this.attendanceModel.findOneAndUpdate(
      { studentId: new Types.ObjectId(dto.studentId), date, schoolSlug: dto.schoolSlug },
      { $set: { ...dto, date, studentId: new Types.ObjectId(dto.studentId) } },
      { upsert: true, new: true },
    );
  }

  async bulkMarkAttendance(dto: BulkAttendanceDto) {
    const ops = dto.records.map(r => {
      const date = new Date(r.date);
      date.setHours(0, 0, 0, 0);
      return {
        updateOne: {
          filter: { studentId: new Types.ObjectId(r.studentId), date, schoolSlug: dto.schoolSlug },
          update: { $set: { ...r, date, schoolSlug: dto.schoolSlug, academicYear: dto.academicYear } },
          upsert: true,
        },
      };
    });
    return this.attendanceModel.bulkWrite(ops as any);
  }

  async getAttendance(schoolSlug: string, query: AttendanceQueryDto) {
    const { page, limit, studentId, grade, section, from, to, status, month } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (grade) filter.grade = grade;
    if (section) filter.section = section;
    if (status) filter.status = status;
    if (month) {
      const [y, m] = month.split('-').map(Number);
      filter.date = {
        $gte: new Date(y, m - 1, 1),
        $lt: new Date(y, m, 1),
      };
    } else if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.attendanceModel.find(filter).sort({ date: -1 }).skip(skip).limit(limit!),
      this.attendanceModel.countDocuments(filter),
    ]);

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async getStudentAttendanceSummary(studentId: string, schoolSlug: string, month?: string) {
    const filter: any = { studentId: new Types.ObjectId(studentId), schoolSlug };
    if (month) {
      const [y, m] = month.split('-').map(Number);
      filter.date = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
    }
    return this.attendanceModel.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
  }

  // ============================================================
  // FEE MANAGEMENT
  // ============================================================
  async createFee(dto: CreateFeeDto) {
    const netAmount = (dto.amount - (dto.discount || 0));
    const fee = new this.feeModel({ ...dto, netAmount });
    return fee.save();
  }

  async getFees(schoolSlug: string, query: FeeQueryDto) {
    const { page, limit, studentId, grade, month, status, feeType, academicYear } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (grade) filter.grade = grade;
    if (month) filter.month = month;
    if (status) filter.status = status;
    if (feeType) filter.feeType = feeType;
    if (academicYear) filter.academicYear = academicYear;

    const [data, total] = await Promise.all([
      this.feeModel.find(filter).sort({ month: -1 }).skip(skip).limit(limit!),
      this.feeModel.countDocuments(filter),
    ]);

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async collectFee(id: string, schoolSlug: string, dto: CollectFeeDto) {
    const fee = await this.feeModel.findOne({ _id: id, schoolSlug });
    if (!fee) throw new NotFoundException('Fee record not found');

    const totalPaid = (fee.paidAmount || 0) + dto.paidAmount;
    const newStatus = totalPaid >= (fee.netAmount || fee.amount)
      ? 'paid' : 'partial';

    return this.feeModel.findByIdAndUpdate(
      id,
      {
        $set: {
          paidAmount: totalPaid,
          status: newStatus,
          paidDate: new Date(),
          paymentMethod: dto.paymentMethod,
          receiptNumber: dto.receiptNumber,
          collectedBy: dto.collectedBy,
          remarks: dto.remarks,
        },
      },
      { new: true },
    );
  }

  async getFeeStatement(studentId: string, schoolSlug: string) {
    const fees = await this.feeModel.find({ studentId: new Types.ObjectId(studentId), schoolSlug })
      .sort({ month: -1 });

    const summary = await this.feeModel.aggregate([
      { $match: { studentId: new Types.ObjectId(studentId), schoolSlug } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$netAmount' },
        totalPaid: { $sum: '$paidAmount' },
      }},
    ]);

    return { fees, summary };
  }

  // ============================================================
  // BEHAVIOUR
  // ============================================================
  async createBehaviour(dto: CreateBehaviourDto) {
    const behaviour = new this.behaviourModel(dto);
    return behaviour.save();
  }

  async getBehaviour(schoolSlug: string, query: BehaviourQueryDto) {
    const { page, limit, studentId, type, grade, severity, from, to, resolved } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (type) filter.type = type;
    if (grade) filter.grade = grade;
    if (severity) filter.severity = severity;
    if (resolved !== undefined) filter.resolved = resolved;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.behaviourModel.find(filter).sort({ date: -1 }).skip(skip).limit(limit!),
      this.behaviourModel.countDocuments(filter),
    ]);

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
  }

  async updateBehaviour(id: string, schoolSlug: string, dto: UpdateBehaviourDto) {
    const record = await this.behaviourModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: dto }, { new: true },
    );
    if (!record) throw new NotFoundException('Behaviour record not found');
    return record;
  }

  // ============================================================
  // ASSESSMENT RESULTS
  // ============================================================
  async createResult(dto: CreateAssessmentResultDto) {
    const totalMax = dto.subjectResults.reduce((a, s) => a + s.maxMarks, 0);
    const totalObtained = dto.subjectResults.reduce((a, s) => a + s.obtainedMarks, 0);
    const percentage = totalMax > 0
      ? parseFloat(((totalObtained / totalMax) * 100).toFixed(1)) : 0;

    const result = new this.resultModel({
      ...dto,
      totalMaxMarks: totalMax,
      totalObtainedMarks: totalObtained,
      percentage,
      overallGrade: percentToGrade(percentage),
      date: new Date(dto.date),
    });
    return result.save();
  }

  async getResults(schoolSlug: string, studentId?: string, grade?: string, type?: string) {
    const filter: any = { schoolSlug };
    if (studentId) filter.studentId = new Types.ObjectId(studentId);
    if (grade) filter.grade = grade;
    if (type) filter.assessmentType = type;

    return this.resultModel.find(filter).sort({ date: -1 }).limit(50);
  }

  // ============================================================
  // REPORTS
  // ============================================================
  async getClassReport(schoolSlug: string, grade: string, section: string, academicYear: string) {
    const students = await this.studentModel.find({
      schoolSlug, currentGrade: grade,
      ...(section ? { currentSection: section } : {}),
      status: 'active',
    }).lean();

    const studentIds = students.map(s => s._id);

    const [attendanceStats, feeStats, behaviourStats] = await Promise.all([
      this.attendanceModel.aggregate([
        { $match: { studentId: { $in: studentIds }, schoolSlug, academicYear } },
        { $group: { _id: { studentId: '$studentId', status: '$status' }, count: { $sum: 1 } } },
      ]),
      this.feeModel.aggregate([
        { $match: { studentId: { $in: studentIds }, schoolSlug, academicYear } },
        { $group: { _id: { studentId: '$studentId', status: '$status' }, total: { $sum: '$netAmount' } } },
      ]),
      this.behaviourModel.aggregate([
        { $match: { studentId: { $in: studentIds }, schoolSlug, academicYear } },
        { $group: { _id: { studentId: '$studentId', type: '$type' }, count: { $sum: 1 } } },
      ]),
    ]);

    return { students, grade, section, academicYear, attendanceStats, feeStats, behaviourStats };
  }

  // ============================================================
  // BULK IMPORT
  // ============================================================

  generateImportTemplate(): string {
    const headers = [
      'firstName', 'lastName', 'dateOfBirth', 'gender', 'currentGrade',
      'currentSection', 'currentRollNumber', 'admissionNumber',
      'personalEmail', 'personalPhone', 'address', 'city', 'province',
      'guardianName', 'guardianRelation', 'guardianPhone', 'guardianEmail',
    ];
    const example = [
      'Ahmed', 'Khan', '2015-03-12', 'male', 'Grade 5',
      'A', '12', 'ADM-2026-0001',
      '', '03001234567', '123 Main Blvd', 'Lahore', 'Punjab',
      'Muhammad Khan', 'father', '03009876543', 'father@example.com',
    ];
    return [headers.join(','), example.join(',')].join('\n');
  }

  private parseCsv(buffer: Buffer): { headers: string[]; rows: string[][] } {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) throw new BadRequestException('CSV file has no data rows');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim()));
    return { headers, rows };
  }

  async previewBulkImport(schoolSlug: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const { headers, rows } = this.parseCsv(file.buffer);

    const col = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const idx: Record<string, number> = {
      firstName: col('firstName'), lastName: col('lastName'),
      dateOfBirth: col('dateOfBirth'), gender: col('gender'),
      currentGrade: col('currentGrade'), currentSection: col('currentSection'),
      currentRollNumber: col('currentRollNumber'), admissionNumber: col('admissionNumber'),
      personalEmail: col('personalEmail'), personalPhone: col('personalPhone'),
      address: col('address'), city: col('city'), province: col('province'),
      guardianName: col('guardianName'), guardianRelation: col('guardianRelation'),
      guardianPhone: col('guardianPhone'), guardianEmail: col('guardianEmail'),
    };

    const required = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'currentGrade'];
    for (const r of required) {
      if (idx[r] === -1) {
        throw new BadRequestException(`CSV is missing required column: ${r}`);
      }
    }

    const existing = await this.studentModel.find({ schoolSlug })
      .select('admissionNumber firstName lastName dateOfBirth').lean();
    const byAdmission = new Map(existing.filter((s: any) => s.admissionNumber).map((s: any) => [s.admissionNumber, s]));
    const byNameDob = new Map(existing.map((s: any) =>
      [`${(s.firstName || '').toLowerCase()}|${(s.lastName || '').toLowerCase()}|${s.dateOfBirth ? new Date(s.dateOfBirth).toISOString().slice(0,10) : ''}`, s]));

    const preview: any[] = [];
    const duplicates: any[] = [];
    let validCount = 0;

    rows.forEach((cols, i) => {
      const rowNum = i + 2;
      const errors: string[] = [];
      const get = (key: string) => idx[key] !== -1 ? cols[idx[key]] : '';

      const firstName = get('firstName');
      const lastName = get('lastName');
      const dobRaw = get('dateOfBirth');
      const gender = get('gender').toLowerCase();
      const currentGrade = get('currentGrade');
      const admissionNumber = get('admissionNumber');

      if (!firstName) errors.push("missing required field 'firstName'");
      if (!lastName) errors.push("missing required field 'lastName'");
      if (!currentGrade) errors.push("missing required field 'currentGrade'");

      let dateOfBirth: Date | null = null;
      if (!dobRaw) {
        errors.push("missing required field 'dateOfBirth'");
      } else {
        dateOfBirth = new Date(dobRaw);
        if (isNaN(dateOfBirth.getTime())) {
          errors.push(`invalid dateOfBirth '${dobRaw}' — use YYYY-MM-DD`);
        }
      }

      if (!gender) {
        errors.push("missing required field 'gender'");
      } else if (!['male', 'female'].includes(gender)) {
        errors.push(`invalid gender '${gender}' — must be 'male' or 'female'`);
      }

      const email = get('personalEmail');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`invalid email format '${email}'`);
      }

      let duplicateOf: any = null;
      if (admissionNumber && byAdmission.has(admissionNumber)) {
        duplicateOf = byAdmission.get(admissionNumber);
      } else {
        const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${dateOfBirth && !isNaN(dateOfBirth.getTime()) ? dateOfBirth.toISOString().slice(0,10) : ''}`;
        if (byNameDob.has(key)) duplicateOf = byNameDob.get(key);
      }

      const rowData = {
        firstName, lastName,
        dateOfBirth: dateOfBirth && !isNaN(dateOfBirth.getTime()) ? dateOfBirth.toISOString().slice(0,10) : dobRaw,
        gender, currentGrade,
        currentSection: get('currentSection'),
        currentRollNumber: get('currentRollNumber'),
        admissionNumber,
        personalEmail: email,
        personalPhone: get('personalPhone'),
        address: get('address'),
        city: get('city'),
        province: get('province'),
        guardianName: get('guardianName'),
        guardianRelation: get('guardianRelation'),
        guardianPhone: get('guardianPhone'),
        guardianEmail: get('guardianEmail'),
      };

      if (errors.length > 0) {
        preview.push({ row: rowNum, data: rowData, errors });
        return;
      }
      validCount++;

      if (duplicateOf) {
        duplicates.push({
          row: rowNum,
          matchedOn: admissionNumber && byAdmission.has(admissionNumber) ? 'admissionNumber' : 'name+dateOfBirth',
          existingStudentId: duplicateOf._id,
        });
      }

      preview.push({ row: rowNum, data: rowData, errors: [], isDuplicate: !!duplicateOf });
    });

    return {
      totalRows: rows.length,
      validRows: validCount,
      invalidRows: rows.length - validCount,
      preview,
      duplicates,
    };
  }

  async commitBulkImport(
    schoolSlug: string,
    academicYear: string,
    rows: any[],
    duplicateAction: 'skip' | 'update' | 'createAnyway' = 'skip',
  ) {
    if (!rows || rows.length === 0) throw new BadRequestException('No rows to import');

    let created = 0, updated = 0, skipped = 0;
    const failed: any[] = [];

    for (const row of rows) {
      try {
        if (row.errors && row.errors.length > 0) { skipped++; continue; }

        let existing: any = null;
        if (row.data.admissionNumber) {
          existing = await this.studentModel.findOne({ schoolSlug, admissionNumber: row.data.admissionNumber });
        }
        if (!existing) {
          existing = await this.studentModel.findOne({
            schoolSlug, firstName: row.data.firstName, lastName: row.data.lastName,
            dateOfBirth: new Date(row.data.dateOfBirth),
          });
        }

        if (existing) {
          if (duplicateAction === 'skip') { skipped++; continue; }
          if (duplicateAction === 'update') {
            await this.studentModel.findByIdAndUpdate(existing._id, {
              $set: {
                currentGrade: row.data.currentGrade,
                currentSection: row.data.currentSection,
                currentRollNumber: row.data.currentRollNumber,
                personalEmail: row.data.personalEmail,
                personalPhone: row.data.personalPhone,
                address: row.data.address,
                city: row.data.city,
                province: row.data.province,
              },
            });
            updated++;
            continue;
          }
        }

        const year = new Date().getFullYear();
        const random = Math.floor(1000 + Math.random() * 9000);
        const guardians = row.data.guardianName ? [{
          name: row.data.guardianName,
          relation: row.data.guardianRelation || 'guardian',
          phone: row.data.guardianPhone,
          email: row.data.guardianEmail,
          isPrimary: true,
        }] : [];

        const student = new this.studentModel({
          studentId: `STU-${year}-${random}`,
          firstName: row.data.firstName,
          lastName: row.data.lastName,
          dateOfBirth: new Date(row.data.dateOfBirth),
          gender: row.data.gender,
          currentGrade: row.data.currentGrade,
          currentSection: row.data.currentSection,
          currentRollNumber: row.data.currentRollNumber,
          currentAcademicYear: academicYear,
          admissionNumber: row.data.admissionNumber,
          personalEmail: row.data.personalEmail,
          personalPhone: row.data.personalPhone,
          address: row.data.address,
          city: row.data.city,
          province: row.data.province,
          guardians,
          schoolSlug,
          status: 'active',
        });
        await student.save();
        created++;
      } catch (err: any) {
        failed.push({ row: row.row, error: err.message || 'Unknown error' });
      }
    }

    return { created, updated, skipped, failed };
  }
}
