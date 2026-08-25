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
import { UploadService } from '../upload/upload.service';
import { Family, FamilyDocument } from '../families/schemas/family.schema';
import { Campus } from '../organization/schemas/organization.schema';
import { GroupInstitution } from '../organization/schemas/group-institution.schema';
import { FeeStructure, FeeStructureDocument } from '../finance/schemas/finance.schema';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import {
  StudentAttendance, StudentAttendanceDocument,
  StudentFee, StudentFeeDocument,
  Behaviour, BehaviourDocument,
  AssessmentResult, AssessmentResultDocument,
} from './schemas/student-supporting.schema';
import { EnrollmentField, EnrollmentFieldDocument } from './schemas/enrollment-field.schema';

import {
  CreateStudentDto, UpdateStudentDto, StudentQueryDto,
  MarkAttendanceDto, BulkAttendanceDto, AttendanceQueryDto,
  CreateFeeDto, CollectFeeDto, FeeQueryDto,
  CreateBehaviourDto, UpdateBehaviourDto, BehaviourQueryDto,
  CreateAssessmentResultDto,
} from './dto/student.dto';
import { resolveCampusScope, ScopedUser } from '../auth/scope.util';

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
    @InjectModel('School') private schoolModel: Model<any>,
    @InjectModel(Family.name) private familyModel: Model<FamilyDocument>,
    @InjectModel(Campus.name) private campusModel: Model<any>,
    @InjectModel(GroupInstitution.name) private institutionModel: Model<any>,
    @InjectModel(FeeStructure.name) private feeStructureModel: Model<FeeStructureDocument>,
    @InjectModel(EnrollmentField.name) private enrollmentFieldModel: Model<EnrollmentFieldDocument>,
    private uploadService: UploadService,
  ) {}

  // ============================================================
  // STUDENT CRUD
  // ============================================================
  // ── Guardian Directory ────────────────────────────────────────
  // Guardians are embedded on Student.guardians[] - the schema's real,
  // intended design (confirmed against CreateStudentDto, which is how
  // the Enrollment Wizard correctly creates them). This aggregates
  // across that same data rather than maintaining a second, parallel
  // Guardian collection that would silently diverge from it - a
  // guardian added via the wizard must show up here, and vice versa.
  async getAllGuardians(schoolSlug: string, studentId?: string, search?: string) {
    const matchStage: any = { schoolSlug };
    if (studentId) matchStage._id = new Types.ObjectId(studentId);

    const pipeline: any[] = [
      { $match: matchStage },
      { $unwind: '$guardians' },
      {
        $project: {
          _id: '$guardians._id',
          name: '$guardians.name',
          relation: '$guardians.relation',
          phone: '$guardians.phone',
          email: '$guardians.email',
          occupation: '$guardians.occupation',
          employer: '$guardians.employer',
          isPrimary: '$guardians.isPrimary',
          isEmergencyContact: '$guardians.isEmergencyContact',
          studentId: '$_id',
          studentName: { $concat: ['$firstName', ' ', '$lastName'] },
        },
      },
    ];

    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { studentName: { $regex: search, $options: 'i' } },
          ],
        },
      });
    }

    return this.studentModel.aggregate(pipeline);
  }

  async addGuardianToStudent(studentId: string, schoolSlug: string, data: any) {
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug });
    if (!student) throw new NotFoundException('Student not found');

    student.guardians = student.guardians || [];

    // Real root cause of guardians appearing duplicated many times over
    // in the Guardian Directory: this push() had no duplicate check at
    // all - the same guardian could be added to the same student
    // repeatedly (e.g. via "Link to Another Child" if the same student
    // is accidentally re-selected, since nothing prevented that either).
    // Phone is the most reliable identifier for "is this the same real
    // person" - name alone risks false negatives on minor formatting
    // differences, but the same phone number linked twice to the same
    // student is never legitimate.
    const newPhone = (data.phone || '').trim();
    if (newPhone) {
      const alreadyLinked = student.guardians.some((g: any) => (g.phone || '').trim() === newPhone);
      if (alreadyLinked) {
        throw new BadRequestException(`This guardian (${newPhone}) is already linked to this student.`);
      }
    }

    student.guardians.push({
      name: `${data.firstName} ${data.lastName}`.trim(),
      relation: data.relation || 'guardian',
      phone: data.phone || undefined,
      email: data.email || undefined,
      occupation: data.occupation || undefined,
      employer: data.employer || undefined,
      isPrimary: data.isPrimary || false,
      isEmergencyContact: data.isEmergencyContact !== undefined ? data.isEmergencyContact : true,
    } as any);
    await student.save();
    return student;
  }

  /** One-time cleanup for the real damage already done by the missing
   * duplicate check above - scans every student's guardians[] array and
   * removes exact duplicates (same phone, or same name if no phone was
   * ever recorded), keeping the first occurrence of each. Returns a
   * summary rather than silently running, so an admin can see exactly
   * what was affected. */
  async deduplicateGuardians(schoolSlug: string) {
    const students = await this.studentModel.find({ schoolSlug, 'guardians.1': { $exists: true } });
    let studentsFixed = 0;
    let duplicatesRemoved = 0;
    const affected: { studentId: string; studentName: string; removedCount: number }[] = [];

    for (const student of students) {
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const g of student.guardians as any[]) {
        const key = (g.phone || '').trim() || `name:${(g.name || '').trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(g);
      }
      const removed = student.guardians.length - deduped.length;
      if (removed > 0) {
        student.guardians = deduped as any;
        await student.save();
        studentsFixed++;
        duplicatesRemoved += removed;
        affected.push({ studentId: String(student._id), studentName: `${student.firstName} ${student.lastName}`, removedCount: removed });
      }
    }

    return { studentsFixed, duplicatesRemoved, affected };
  }

  async createStudent(dto: CreateStudentDto): Promise<Student> {
    // studentId is required + unique on the schema but was never being
    // generated here (only the bulk-import path did this) - every single
    // create via this method was guaranteed to fail Mongoose's required-
    // field validation before this fix, surfacing as a bare 500 with no
    // useful message since nothing caught it.
    const year = new Date().getFullYear();
    let studentId: string;
    do {
      const random = Math.floor(1000 + Math.random() * 9000);
      studentId = `STU-${year}-${random}`;
    } while (await this.studentModel.exists({ studentId }));

    let admissionNumber = dto.admissionNumber;
    if (!admissionNumber) {
      do {
        const random = Math.floor(1000 + Math.random() * 9000);
        admissionNumber = `ADM-${year}-${random}`;
      } while (await this.studentModel.exists({ admissionNumber, schoolSlug: dto.schoolSlug }));
    }

    try {
      const student = new this.studentModel({ ...dto, studentId, admissionNumber });
      return await student.save();
    } catch (err: any) {
      // A real, readable message (e.g. "firstName is required") instead of
      // an unhandled exception bubbling into a generic 500 - the previous
      // behavior for any Mongoose validation failure on this path.
      if (err?.name === 'ValidationError') {
        const fields = Object.keys(err.errors || {}).join(', ');
        throw new BadRequestException(`Could not create student - missing or invalid: ${fields}`);
      }
      if (err?.code === 11000) {
        throw new ConflictException('A student with this ID already exists - please try again');
      }
      throw err;
    }
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

  async getDistinctGradesSections(schoolSlug: string) {
    // The formal Organization-module Grade/Section entities may not exist
    // for every school (e.g. one activated directly from a CRM lead skips
    // the self-service wizard steps that create them) — but real students
    // always carry their own grade/section as plain strings regardless.
    // Deriving filter options from actual data means this always works.
    const grades: string[] = await this.studentModel.distinct('currentGrade', { schoolSlug });
    const sections: string[] = await this.studentModel.distinct('currentSection', { schoolSlug });
    return {
      grades: grades.filter(Boolean).sort(),
      sections: sections.filter(Boolean).sort(),
    };
  }

  async getStudents(schoolSlug: string, query: StudentQueryDto, requestingUser?: ScopedUser) {
    const { page, limit, search, sortBy, sortOrder,
      grade, section, status, gender, academicYear, scholarshipHolder, specialNeeds, campusId } = query;
    const { skip } = paged(page, limit);

    const filter: any = { schoolSlug };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    if (grade?.length) filter.currentGrade = { $in: grade };
    if (section?.length) filter.currentSection = { $in: section };
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

    // Monthly Tuition Fee - not a field on Student at all, has to be
    // matched from FeeStructure by grade/section/campus/academicYear.
    // Batch-fetched once for the whole page rather than queried per
    // student (N+1). FeeStructure.section is optional (unset = applies
    // to the whole grade) and .campus is a free-text field that may not
    // always be set either, so this picks the most SPECIFIC matching
    // structure for each student rather than just the first one found.
    const activeStructures = await this.feeStructureModel.find({ schoolSlug, isActive: true }).lean();
    const tuitionAmountFor = (s: any): number | null => {
      let best: { structure: any; specificity: number } | null = null;
      for (const fs of activeStructures) {
        if (fs.grade !== s.currentGrade) continue;
        if (fs.academicYear && s.currentAcademicYear && fs.academicYear !== s.currentAcademicYear) continue;
        if (fs.section && fs.section !== s.currentSection) continue;
        if (fs.campus && s.campusId && fs.campus !== String(s.campusId)) continue;
        const specificity = (fs.section ? 1 : 0) + (fs.campus ? 1 : 0) + (fs.academicYear ? 1 : 0);
        if (!best || specificity > best.specificity) best = { structure: fs, specificity };
      }
      if (!best) return null;
      const tuitionLine = (best.structure.items || []).find((i: any) => i.feeHead?.toLowerCase().includes('tuition'));
      return tuitionLine ? tuitionLine.amount : null;
    };
    const dataWithFees = data.map((s: any) => {
      const obj = s.toObject ? s.toObject() : s;
      return { ...obj, monthlyTuitionFee: tuitionAmountFor(obj) };
    });

    return { data: dataWithFees, meta: { total, page, limit, pages: Math.ceil(total / limit!) } };
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

  /** Bulk status change - suspend/withdraw/graduate/transfer multiple
   * students at once. This is the safe, reversible, no-data-loss action -
   * the right default for almost every real case, unlike a hard delete. */
  async bulkUpdateStatus(schoolSlug: string, studentIds: string[], status: string, leftDate?: string, leftReason?: string) {
    if (!studentIds?.length) throw new BadRequestException('studentIds is required');
    const validStatuses = ['active', 'inactive', 'graduated', 'transferred', 'expelled', 'on_leave'];
    if (!validStatuses.includes(status)) throw new BadRequestException(`Invalid status - must be one of: ${validStatuses.join(', ')}`);

    const set: any = { status };
    if (leftDate) set.leftDate = new Date(leftDate);
    if (leftReason) set.leftReason = leftReason;

    const result = await this.studentModel.updateMany(
      { _id: { $in: studentIds }, schoolSlug },
      { $set: set },
    );
    return { matched: result.matchedCount, updated: result.modifiedCount, status };
  }

  /** Real hard delete - genuinely removes the record, not a status change.
   * Only intended for actual mistakes (duplicates, test entries) - blocks
   * itself if the student has any real recorded activity across
   * attendance, fees, behaviour, or results, since deleting a student with
   * real history would silently destroy that data across roughly 20
   * dependent collections. Status change (bulkUpdateStatus /
   * updateStudent with status) is the correct action for every other case. */
  async deleteStudent(id: string, schoolSlug: string) {
    const student = await this.studentModel.findOne({ _id: id, schoolSlug });
    if (!student) throw new NotFoundException('Student not found');

    const [attendanceCount, feeCount, behaviourCount, resultCount] = await Promise.all([
      this.attendanceModel.countDocuments({ studentId: id }),
      this.feeModel.countDocuments({ studentId: id }),
      this.behaviourModel.countDocuments({ studentId: id }),
      this.resultModel.countDocuments({ studentId: id }),
    ]);
    const totalActivity = attendanceCount + feeCount + behaviourCount + resultCount;
    if (totalActivity > 0) {
      const details = [
        attendanceCount > 0 ? `${attendanceCount} attendance record(s)` : null,
        feeCount > 0 ? `${feeCount} fee record(s)` : null,
        behaviourCount > 0 ? `${behaviourCount} behaviour record(s)` : null,
        resultCount > 0 ? `${resultCount} result record(s)` : null,
      ].filter(Boolean).join(', ');
      throw new BadRequestException(
        `Cannot delete - this student has real recorded activity (${details}). Use "Mark as Withdrawn" instead, which keeps their history intact.`,
      );
    }

    await this.studentModel.deleteOne({ _id: id, schoolSlug });
    if ((student as any).familyId) {
      await this.familyModel.updateOne({ _id: (student as any).familyId }, { $pull: { studentIds: student._id } });
    }
    return { deleted: true };
  }

  async bulkAssignCampus(schoolSlug: string, campusId: string, grade?: string, section?: string) {
    if (!campusId) throw new BadRequestException('campusId is required');
    const filter: any = {
      schoolSlug,
      $or: [{ campusId: { $exists: false } }, { campusId: null }, { campusId: '' }],
    };
    if (grade) filter.currentGrade = grade;
    if (section) filter.currentSection = section;
    const result = await this.studentModel.updateMany(filter, { $set: { campusId } });
    return { matched: result.matchedCount, updated: result.modifiedCount };
  }

  async uploadPhoto(id: string, schoolSlug: string, file: Express.Multer.File) {
    const { url } = await this.uploadService.uploadFile(file, 'student-photos', schoolSlug);
    const student = await this.studentModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { photo: url } }, { new: true },
    );
    if (!student) throw new NotFoundException('Student not found');
    return { photoUrl: url };
  }

  // Field groups + labels available for the Print Profile PDF report.
  // Keep in sync with the frontend's field-selection checklist.
  private readonly PDF_FIELD_GROUPS: Record<string, { label: string; fields: Record<string, string> }> = {
    personal: {
      label: 'Personal Information',
      fields: {
        firstName: 'First Name', lastName: 'Last Name', dateOfBirth: 'Date of Birth',
        gender: 'Gender', nationality: 'Nationality', religion: 'Religion', arabicName: 'Arabic Name',
        grNo: 'GR No', dateOfBirthInWords: 'Date of Birth (in words)',
      },
    },
    contact: {
      label: 'Contact Information',
      fields: {
        personalEmail: 'Email', personalPhone: 'Phone',
        address: 'Address', town: 'Town', city: 'City', province: 'Province',
      },
    },
    academic: {
      label: 'Academic Information',
      fields: {
        currentGrade: 'Grade', currentSection: 'Section', currentRollNumber: 'Class Roll No',
        currentAcademicYear: 'Academic Year', houseGroup: 'House Group',
      },
    },
    admission: {
      label: 'Admission Information',
      fields: {
        admissionNumber: 'Admission Number', admissionDate: 'Admission Date',
        reAdmissionDate: 'Re-Admission Date', previousSchool: 'Previous School',
      },
    },
    emergency: {
      label: 'Emergency Contact',
      fields: {
        emergencyContactName: 'Name', emergencyContactRelation: 'Relation', emergencyContactPhone: 'Phone',
      },
    },
    tutor: {
      label: 'Tutor Information',
      fields: {
        tutorName: 'Name', tutorPhone: 'Phone',
      },
    },
    status: {
      label: 'Status',
      fields: {
        status: 'Status', scholarshipHolder: 'Scholarship Holder', specialNeeds: 'Special Needs',
      },
    },
  };

  private async fetchImageBytes(url: string): Promise<{ bytes: ArrayBuffer; isPng: boolean } | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      const isPng = url.toLowerCase().includes('.png') || res.headers.get('content-type')?.includes('png');
      return { bytes, isPng: !!isPng };
    } catch {
      return null;
    }
  }

  async generateProfilePdf(id: string, schoolSlug: string, selectedFields: string[], institutionIdOverride?: string): Promise<Buffer> {
    const student: any = await this.studentModel.findOne({ _id: id, schoolSlug }).lean();
    if (!student) throw new NotFoundException('Student not found');
    const school: any = await this.schoolModel.findOne({ slug: schoolSlug }).lean();

    // The real bug this resolves: School.logo is one single, school-wide
    // logo, but a multi-campus school can have multiple separately-
    // branded GroupInstitution records (Campus.institutionId), each with
    // its own real logoUrl. Using the generic school-wide logo for every
    // student regardless of which campus/institution they actually
    // belong to is what caused a student's report to print with a
    // completely different institution's logo. Traces the student's own
    // campus to find their real institution's logo; institutionIdOverride
    // lets the caller explicitly choose one instead (the "select
    // institution before printing" option), for schools where this link
    // isn't set up correctly yet or where an admin wants a specific one.
    let institutionName: string | undefined;
    let institutionLogo: string | undefined;
    if (institutionIdOverride) {
      const inst: any = await this.institutionModel.findOne({ _id: institutionIdOverride, schoolSlug }).lean();
      institutionName = inst?.name;
      institutionLogo = inst?.logoUrl;
    } else if (student.campusId) {
      const campus: any = await this.campusModel.findOne({ _id: student.campusId, schoolSlug }).lean();
      if (campus?.institutionId) {
        const inst: any = await this.institutionModel.findOne({ _id: campus.institutionId, schoolSlug }).lean();
        institutionName = inst?.name;
        institutionLogo = inst?.logoUrl;
      }
    }
    const effectiveSchoolName = institutionName || school?.name;
    const effectiveLogo = institutionLogo || school?.logo;

    const selected = new Set(selectedFields || []);
    const includePhoto = selected.has('photo');
    const includeGuardians = selected.has('guardians');

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    let page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    // Standard fonts (Helvetica) only support WinAnsi encoding - any
    // non-Latin text (Arabic names being the known, real case that
    // crashed this report before) throws when drawn with them. Rather
    // than trying to predict every character this could ever fail on,
    // drawTextSafe below tries the requested font first and only falls
    // back to this real, verified Arabic-capable font if that actually
    // throws - covers arabicName specifically and any other field or
    // guardian name that happens to contain non-Latin script.
    const arabicFontBytes = fs.readFileSync(
      require.resolve('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2'),
    );
    const arabicFont = await pdfDoc.embedFont(arabicFontBytes);
    const drawTextSafe = (targetPage: any, text: string, opts: any) => {
      try {
        targetPage.drawText(text, opts);
      } catch {
        targetPage.drawText(text, { ...opts, font: arabicFont });
      }
    };
    const navy = rgb(0.047, 0.267, 0.486);   // #0C447C
    const amber = rgb(0.937, 0.624, 0.153);  // #EF9F27
    const grayText = rgb(0.4, 0.4, 0.4);
    const black = rgb(0.1, 0.1, 0.1);

    const margin = 45;
    let y = 842 - margin;
    const pageWidth = 595;

    const ensureSpace = (needed: number) => {
      if (y - needed < margin) {
        page = pdfDoc.addPage([595, 842]);
        y = 842 - margin;
      }
    };

    // fetchImageBytes is now a shared private class method (see below) -
    // used here and in generateGrRegisterPdf, both of which need to embed
    // a school/institution logo.

    // ── Header banner ──
    const bannerHeight = 95;
    page.drawRectangle({ x: 0, y: y - (bannerHeight - 25), width: pageWidth, height: bannerHeight, color: navy });
    const bannerTop = y + 25;
    const bannerBottom = y - (bannerHeight - 25);
    const bannerCenterY = (bannerTop + bannerBottom) / 2;

    let textStartX = margin;
    if (effectiveLogo) {
      const img = await this.fetchImageBytes(effectiveLogo);
      if (img) {
        try {
          const embedded = img.isPng ? await pdfDoc.embedPng(img.bytes) : await pdfDoc.embedJpg(img.bytes);
          // Constrain BOTH dimensions (not just height) so a wide/landscape
          // logo can't stretch far enough to collide with the title text —
          // scale by whichever limit is hit first, keeping aspect ratio.
          const maxLogoH = 52;
          const maxLogoW = 100;
          const ratio = embedded.width / embedded.height;
          let logoW = maxLogoW;
          let logoH = logoW / ratio;
          if (logoH > maxLogoH) { logoH = maxLogoH; logoW = logoH * ratio; }
          const logoX = margin;
          const logoY = bannerCenterY - logoH / 2;
          // Subtle white card behind the logo — most school logos are
          // designed for a light background, so dropping them directly
          // onto navy can look muddy or let a white-background PNG show
          // an ugly rectangle. A small padded white card fixes both.
          const pad = 6;
          page.drawRectangle({
            x: logoX - pad, y: logoY - pad, width: logoW + pad * 2, height: logoH + pad * 2,
            color: rgb(1, 1, 1), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5,
          });
          page.drawImage(embedded, { x: logoX, y: logoY, width: logoW, height: logoH });
          textStartX = logoX + logoW + pad * 2 + 18; // dynamic gap based on actual rendered width
        } catch { /* corrupt/unsupported image — fall through to text-only header */ }
      }
    }

    const schoolName = effectiveSchoolName || 'School';
    // Shrink the school name if it's long enough to risk crowding the page edge
    const nameSize = schoolName.length > 38 ? 15 : 17;
    page.drawText(schoolName, {
      x: textStartX, y: bannerCenterY + 6, size: nameSize, font: bold, color: rgb(1, 1, 1),
      maxWidth: pageWidth - textStartX - margin,
    });
    page.drawText('STUDENT PROFILE REPORT', {
      x: textStartX, y: bannerCenterY - 14, size: 9, font: bold, color: rgb(0.75, 0.82, 0.93),
    });
    y = bannerBottom - 40;

    // ── Student name + photo ──
    const hasPhoto = includePhoto && student.photo;
    const nameBlockWidth = hasPhoto ? pageWidth - margin * 2 - 90 : pageWidth - margin * 2;
    if (hasPhoto) {
      const img = await this.fetchImageBytes(student.photo);
      if (img) {
        try {
          const embedded = img.isPng ? await pdfDoc.embedPng(img.bytes) : await pdfDoc.embedJpg(img.bytes);
          const size = 72;
          const photoX = pageWidth - margin - size;
          const photoY = y - size + 30;
          // Bordered frame so the photo reads as an intentional portrait
          // slot regardless of the source image's own aspect ratio/content.
          page.drawRectangle({
            x: photoX - 3, y: photoY - 3, width: size + 6, height: size + 6,
            color: rgb(1, 1, 1), borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1,
          });
          page.drawImage(embedded, { x: photoX, y: photoY, width: size, height: size });
        } catch { /* skip if the image can't be embedded */ }
      }
    }

    drawTextSafe(page, `${student.firstName || ''} ${student.lastName || ''}`.trim(), {
      x: margin, y, size: 21, font: bold, color: black, maxWidth: nameBlockWidth,
    });
    y -= 20;
    page.drawText(`Student ID: ${student.studentId || '—'}`, { x: margin, y, size: 10, font, color: grayText });
    y -= 22;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    y -= 22;

    const fmtValue = (v: any): string => {
      if (v === undefined || v === null || v === '') return '—';
      if (typeof v === 'boolean') return v ? 'Yes' : 'No';
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v);
    };


    // ── Field group sections ──
    for (const groupKey of Object.keys(this.PDF_FIELD_GROUPS)) {
      const group = this.PDF_FIELD_GROUPS[groupKey];
      const fieldsInGroup = Object.keys(group.fields).filter(f => selected.has(f));
      if (fieldsInGroup.length === 0) continue;

      ensureSpace(40 + fieldsInGroup.length * 22);
      page.drawRectangle({ x: margin, y: y - 8, width: pageWidth - margin * 2, height: 26, color: rgb(0.96, 0.97, 0.98) });
      page.drawRectangle({ x: margin, y: y - 8, width: 4, height: 26, color: amber });
      page.drawText(group.label.toUpperCase(), { x: margin + 14, y, size: 10.5, font: bold, color: navy });
      y -= 34;

      fieldsInGroup.forEach((fieldKey, idx) => {
        ensureSpace(22);
        if (idx % 2 === 1) {
          page.drawRectangle({ x: margin, y: y - 5, width: pageWidth - margin * 2, height: 21, color: rgb(0.985, 0.985, 0.985) });
        }
        page.drawText(`${group.fields[fieldKey]}`, { x: margin + 14, y, size: 9.5, font: bold, color: rgb(0.35, 0.35, 0.35) });
        let value = student[fieldKey];
        if (fieldKey === 'dateOfBirth' || fieldKey === 'admissionDate' || fieldKey === 'reAdmissionDate') value = fmtValue(value ? new Date(value) : null);
        else value = fmtValue(value);
        drawTextSafe(page, value, { x: margin + 175, y, size: 10, font, color: black });
        y -= 22;
      });
      y -= 12;
    }

    // ── Guardians ──
    if (includeGuardians && Array.isArray(student.guardians) && student.guardians.length > 0) {
      ensureSpace(40 + student.guardians.length * 22);
      page.drawRectangle({ x: margin, y: y - 8, width: pageWidth - margin * 2, height: 26, color: rgb(0.96, 0.97, 0.98) });
      page.drawRectangle({ x: margin, y: y - 8, width: 4, height: 26, color: amber });
      page.drawText('GUARDIAN INFORMATION', { x: margin + 14, y, size: 10.5, font: bold, color: navy });
      y -= 34;
      student.guardians.forEach((g: any, idx: number) => {
        ensureSpace(22);
        if (idx % 2 === 1) {
          page.drawRectangle({ x: margin, y: y - 5, width: pageWidth - margin * 2, height: 21, color: rgb(0.985, 0.985, 0.985) });
        }
        const line = `${g.name || '—'} (${g.relation || '—'}) — ${g.phone || '—'}${g.email ? ' · ' + g.email : ''}`;
        drawTextSafe(page, line, { x: margin + 14, y, size: 10, font, color: black });
        y -= 22;
      });
      y -= 12;
    }

    // ── Footer ──
    const pages = pdfDoc.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Generated ${new Date().toISOString().slice(0, 10)} · Page ${i + 1} of ${pages.length}`, {
        x: margin, y: 25, size: 8, font, color: grayText,
      });
    });

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  // ============================================================
  // STUDENT LIST REPORT (PDF) — filtered, multi-column, class/section/status
  // ============================================================
  private calculateAge(dob: Date, asOf: Date): string {
    let years = asOf.getFullYear() - dob.getFullYear();
    let months = asOf.getMonth() - dob.getMonth();
    if (asOf.getDate() < dob.getDate()) months--;
    if (months < 0) { years--; months += 12; }
    return `${years}y ${months}m`;
  }

  async generateStudentListPdf(
    schoolSlug: string,
    filters: { grades?: string[]; sections?: string[]; statuses?: string[] },
  ): Promise<Buffer> {
    const query: any = { schoolSlug };
    if (filters.grades?.length) query.currentGrade = { $in: filters.grades };
    if (filters.sections?.length) query.currentSection = { $in: filters.sections };
    if (filters.statuses?.length) query.status = { $in: filters.statuses };

    const students: any[] = await this.studentModel.find(query)
      .sort({ currentGrade: 1, currentSection: 1, firstName: 1 }).lean();
    const school: any = await this.schoolModel.findOne({ slug: schoolSlug }).lean();

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.047, 0.267, 0.486);
    const black = rgb(0.1, 0.1, 0.1);
    const grayText = rgb(0.4, 0.4, 0.4);

    // Landscape A4 — 7 wide columns (2 of them compound: father/mother each
    // carry name+phone+CNIC on 3 lines) don't fit a portrait page sensibly.
    const pageWidth = 842, pageHeight = 595;
    const margin = 30;
    const printDate = new Date();

    const cols = [
      { key: 'gr', label: 'GR No.', width: 60 },
      { key: 'name', label: 'Student Name', width: 100 },
      { key: 'father', label: 'Father (Name / Phone / CNIC)', width: 150 },
      { key: 'mother', label: 'Mother (Name / Phone / CNIC)', width: 150 },
      { key: 'age', label: 'Age', width: 45 },
      { key: 'bform', label: 'B-Form No.', width: 90 },
      { key: 'address', label: 'Address', width: 195 },
    ];
    const tableWidth = cols.reduce((s, c) => s + c.width, 0);

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawHeader = () => {
      page.drawRectangle({ x: 0, y: y - 45, width: pageWidth, height: 60, color: navy });
      page.drawText(school?.name || 'School', { x: margin, y: y - 20, size: 15, font: bold, color: rgb(1, 1, 1) });
      const filterDesc = [
        filters.grades?.length ? `Grades: ${filters.grades.join(', ')}` : 'All Grades',
        filters.sections?.length ? `Sections: ${filters.sections.join(', ')}` : 'All Sections',
        filters.statuses?.length ? `Status: ${filters.statuses.join(', ')}` : 'All Statuses',
      ].join(' · ');
      page.drawText(`Student List Report — ${filterDesc}`, { x: margin, y: y - 36, size: 8.5, font, color: rgb(0.8, 0.85, 0.95) });
      y -= 70;

      // Table header row
      page.drawRectangle({ x: margin, y: y - 6, width: tableWidth, height: 20, color: rgb(0.93, 0.94, 0.96) });
      let x = margin;
      cols.forEach(c => {
        page.drawText(c.label, { x: x + 4, y: y, size: 7.5, font: bold, color: navy, maxWidth: c.width - 8 });
        x += c.width;
      });
      y -= 22;
    };

    drawHeader();

    const ensureRowSpace = (needed: number) => {
      if (y - needed < margin + 20) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        drawHeader();
      }
    };

    students.forEach((s, idx) => {
      const father = (s.guardians || []).find((g: any) => g.relation === 'father');
      const mother = (s.guardians || []).find((g: any) => g.relation === 'mother');
      const age = s.dateOfBirth ? this.calculateAge(new Date(s.dateOfBirth), printDate) : '—';

      const fatherLines = [father?.name || '—', father?.phone || '—', father?.cnic || '—'];
      const motherLines = [mother?.name || '—', mother?.phone || '—', mother?.cnic || '—'];
      const rowHeight = 34; // 3 lines for father/mother columns

      ensureRowSpace(rowHeight);
      if (idx % 2 === 1) {
        page.drawRectangle({ x: margin, y: y - rowHeight + 8, width: tableWidth, height: rowHeight, color: rgb(0.98, 0.98, 0.98) });
      }

      let x = margin;
      const topY = y - 2;
      page.drawText(s.admissionNumber || '—', { x: x + 4, y: topY, size: 7.5, font, color: black, maxWidth: cols[0].width - 8 }); x += cols[0].width;
      page.drawText(`${s.firstName || ''} ${s.lastName || ''}`.trim(), { x: x + 4, y: topY, size: 7.5, font, color: black, maxWidth: cols[1].width - 8 }); x += cols[1].width;
      fatherLines.forEach((line, i) => page.drawText(line, { x: x + 4, y: topY - i * 11, size: 7, font, color: black, maxWidth: cols[2].width - 8 })); x += cols[2].width;
      motherLines.forEach((line, i) => page.drawText(line, { x: x + 4, y: topY - i * 11, size: 7, font, color: black, maxWidth: cols[3].width - 8 })); x += cols[3].width;
      page.drawText(age, { x: x + 4, y: topY, size: 7.5, font, color: black }); x += cols[4].width;
      page.drawText(s.bForm || '—', { x: x + 4, y: topY, size: 7.5, font, color: black, maxWidth: cols[5].width - 8 }); x += cols[5].width;
      page.drawText(s.address || '—', { x: x + 4, y: topY, size: 7, font, color: black, maxWidth: cols[6].width - 8 });

      y -= rowHeight;
    });

    if (students.length === 0) {
      page.drawText('No students match the selected filters.', { x: margin, y, size: 10, font, color: grayText });
    }

    const pages = pdfDoc.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Print Date: ${printDate.toISOString().slice(0, 10)} · Total: ${students.length} · Page ${i + 1} of ${pages.length}`, {
        x: margin, y: 15, size: 7.5, font, color: grayText,
      });
    });

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  // Known early-years stages get an explicit priority order, checked
  // before falling back to numeric extraction - a name like "PreK-2"
  // contains a digit but isn't a numbered grade, and would otherwise sort
  // as if it were equivalent to "Grade 2" (confirmed with a direct test
  // before this fix - it landed between Grade 1 and Grade 2 instead of
  // before Kindergarten).
  private static readonly EARLY_YEARS_ORDER = ['pre-nursery', 'prenursery', 'nursery', 'prek', 'pre-k', 'kg', 'kindergarten'];
  private earlyYearsRank(name: string): number {
    const lower = name.toLowerCase().replace(/[\s-]/g, '');
    for (let i = 0; i < StudentsService.EARLY_YEARS_ORDER.length; i++) {
      if (lower.startsWith(StudentsService.EARLY_YEARS_ORDER[i].replace(/[\s-]/g, ''))) return i;
    }
    return -1;
  }
  private naturalGradeSort(a: string, b: string): number {
    const rankA = this.earlyYearsRank(a), rankB = this.earlyYearsRank(b);
    if (rankA !== -1 && rankB !== -1) return rankA - rankB;
    if (rankA !== -1 && rankB === -1) return -1;
    if (rankA === -1 && rankB !== -1) return 1;
    const numA = a.match(/\d+/); const numB = b.match(/\d+/);
    if (numA && numB) return parseInt(numA[0]) - parseInt(numB[0]);
    return a.localeCompare(b);
  }

  /** GR Register - a real, formal register listing every currently
   * enrolled student grouped by class (grade + section), with GR No,
   * Family Code, guardian contact details, and per-class + grand total
   * counts (including gender breakdown). Distinct from
   * generateStudentListPdf, which serves a different purpose with a
   * different, more compact column set (age, B-Form, father/mother with
   * CNIC) - this report specifically matches what a GR Register needs to
   * contain, with real formatting rather than a dense, cramped table. */
  async generateGrRegisterPdf(
    schoolSlug: string,
    filters: { grades?: string[]; sections?: string[]; campusId?: string; institutionId?: string },
  ): Promise<Buffer> {
    const query: any = { schoolSlug, status: 'active' };
    if (filters.grades?.length) query.currentGrade = { $in: filters.grades };
    if (filters.sections?.length) query.currentSection = { $in: filters.sections };
    if (filters.campusId) query.campusId = filters.campusId;

    const students: any[] = await this.studentModel.find(query).lean();
    const school: any = await this.schoolModel.findOne({ slug: schoolSlug }).lean();

    // Same institution-aware logo tracing as generateProfilePdf - a GR
    // Register is just as much a school-branded printed document. A
    // register can span multiple campuses if unfiltered, so there's no
    // single "the student's campus" to trace here - relies on an
    // explicit campusId/institutionId filter instead, falling back to
    // the school-wide logo if neither is given.
    let institutionName: string | undefined;
    let institutionLogo: string | undefined;
    if (filters.institutionId) {
      const inst: any = await this.institutionModel.findOne({ _id: filters.institutionId, schoolSlug }).lean();
      institutionName = inst?.name; institutionLogo = inst?.logoUrl;
    } else if (filters.campusId) {
      const campus: any = await this.campusModel.findOne({ _id: filters.campusId, schoolSlug }).lean();
      if (campus?.institutionId) {
        const inst: any = await this.institutionModel.findOne({ _id: campus.institutionId, schoolSlug }).lean();
        institutionName = inst?.name; institutionLogo = inst?.logoUrl;
      }
    }
    const effectiveName = institutionName || school?.name || 'School';
    const effectiveLogo = institutionLogo || school?.logo;

    // Group by "Grade - Section" (e.g. "Grade 3 - Girls"), sorted
    // naturally by grade number then section name.
    const groups = new Map<string, any[]>();
    for (const s of students) {
      const key = `${s.currentGrade || 'Unassigned'}${s.currentSection ? ` - ${s.currentSection}` : ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const sortedGroupKeys = Array.from(groups.keys()).sort((a, b) => {
      const gradeA = a.split(' - ')[0], gradeB = b.split(' - ')[0];
      const gradeCmp = this.naturalGradeSort(gradeA, gradeB);
      return gradeCmp !== 0 ? gradeCmp : a.localeCompare(b);
    });

    const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-') : '—';
    const genderCounts = (list: any[]) => ({
      m: list.filter(s => s.gender === 'male').length,
      f: list.filter(s => s.gender === 'female').length,
    });

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const arabicFontBytes = fs.readFileSync(
      require.resolve('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2'),
    );
    const arabicFont = await pdfDoc.embedFont(arabicFontBytes);
    const drawTextSafe = (targetPage: any, text: string, opts: any) => {
      try { targetPage.drawText(text, opts); } catch { targetPage.drawText(text, { ...opts, font: arabicFont }); }
    };

    const navy = rgb(0.047, 0.267, 0.486);
    const amber = rgb(0.937, 0.624, 0.153);
    const black = rgb(0.1, 0.1, 0.1);
    const grayText = rgb(0.45, 0.45, 0.45);
    const lightBg = rgb(0.965, 0.97, 0.98);

    const pageWidth = 842, pageHeight = 595; // landscape A4
    const margin = 28;
    const printDate = new Date();

    const cols = [
      { key: 'grNo', label: 'GR #', width: 55 },
      { key: 'familyCode', label: 'F.Code', width: 55 },
      { key: 'name', label: 'Student Name', width: 145 },
      { key: 'father', label: 'Father Name', width: 130 },
      { key: 'contact', label: 'Contact Details', width: 140 },
      { key: 'dob', label: 'DOB', width: 75 },
      { key: 'doa', label: 'DOA', width: 75 },
      { key: 'address', label: 'Address', width: 111 },
    ];
    const tableWidth = cols.reduce((s, c) => s + c.width, 0);

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawPageHeader = async (isFirstPage: boolean) => {
      if (isFirstPage) {
        page.drawRectangle({ x: 0, y: y - 46, width: pageWidth, height: 60, color: navy });
        let textStartX = margin;
        if (effectiveLogo) {
          const img = await this.fetchImageBytes(effectiveLogo);
          if (img) {
            try {
              const embedded = img.isPng ? await pdfDoc.embedPng(img.bytes) : await pdfDoc.embedJpg(img.bytes);
              const maxLogoH = 42, maxLogoW = 80;
              const ratio = embedded.width / embedded.height;
              let logoW = maxLogoW, logoH = logoW / ratio;
              if (logoH > maxLogoH) { logoH = maxLogoH; logoW = logoH * ratio; }
              const logoX = margin, logoY = y - 42;
              const pad = 5;
              page.drawRectangle({ x: logoX - pad, y: logoY - pad, width: logoW + pad * 2, height: logoH + pad * 2, color: rgb(1, 1, 1), borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
              page.drawImage(embedded, { x: logoX, y: logoY, width: logoW, height: logoH });
              textStartX = logoX + logoW + pad * 2 + 16;
            } catch { /* corrupt/unsupported image - fall through to text-only header */ }
          }
        }
        drawTextSafe(page, effectiveName, { x: textStartX, y: y - 20, size: 16, font: bold, color: rgb(1, 1, 1), maxWidth: pageWidth - textStartX - margin });
        page.drawText('GENERAL REGISTER (GR)', { x: textStartX, y: y - 38, size: 9, font: bold, color: rgb(0.8, 0.85, 0.95) });
        y -= 68;
      }
    };

    const drawGroupHeader = (groupName: string, count: number) => {
      page.drawRectangle({ x: margin, y: y - 8, width: tableWidth, height: 24, color: amber });
      page.drawText(groupName.toUpperCase(), { x: margin + 10, y: y - 1, size: 10.5, font: bold, color: rgb(1, 1, 1) });
      page.drawText(`${count} student${count === 1 ? '' : 's'}`, { x: margin + tableWidth - 90, y: y - 1, size: 9, font: bold, color: rgb(1, 1, 1) });
      y -= 30;
      page.drawRectangle({ x: margin, y: y - 4, width: tableWidth, height: 18, color: rgb(0.93, 0.94, 0.96) });
      let x = margin;
      cols.forEach(c => { page.drawText(c.label, { x: x + 5, y: y, size: 7.5, font: bold, color: navy, maxWidth: c.width - 10 }); x += c.width; });
      y -= 20;
    };

    const ensureSpace = (needed: number, currentGroup?: string, currentGroupCount?: number) => {
      if (y - needed < margin + 20) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        if (currentGroup) drawGroupHeader(`${currentGroup} (cont'd)`, currentGroupCount || 0);
      }
    };

    await drawPageHeader(true);

    let grandTotal = 0, grandM = 0, grandF = 0;

    sortedGroupKeys.forEach((groupKey) => {
      const groupStudents = groups.get(groupKey)!.sort((a, b) => (a.grNo || '').localeCompare(b.grNo || '') || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
      const { m, f } = genderCounts(groupStudents);
      grandTotal += groupStudents.length; grandM += m; grandF += f;

      ensureSpace(24 + 18 + 24);
      drawGroupHeader(groupKey, groupStudents.length);

      groupStudents.forEach((s, idx) => {
        const father = (s.guardians || []).find((g: any) => g.relation === 'father');
        const contactNumbers = (s.guardians || []).map((g: any) => g.phone).filter(Boolean).join(', ') || '—';
        const rowHeight = 20;

        ensureSpace(rowHeight, groupKey, groupStudents.length);
        if (idx % 2 === 1) {
          page.drawRectangle({ x: margin, y: y - rowHeight + 6, width: tableWidth, height: rowHeight, color: lightBg });
        }

        let x = margin;
        const rowY = y - 4;
        drawTextSafe(page, s.grNo || '—', { x: x + 5, y: rowY, size: 7.5, font, color: black, maxWidth: cols[0].width - 10 }); x += cols[0].width;
        drawTextSafe(page, s.familyCode || '—', { x: x + 5, y: rowY, size: 7.5, font, color: black, maxWidth: cols[1].width - 10 }); x += cols[1].width;
        drawTextSafe(page, `${s.firstName || ''} ${s.lastName || ''}`.trim(), { x: x + 5, y: rowY, size: 7.5, font: bold, color: black, maxWidth: cols[2].width - 10 }); x += cols[2].width;
        drawTextSafe(page, father?.name || '—', { x: x + 5, y: rowY, size: 7.5, font, color: black, maxWidth: cols[3].width - 10 }); x += cols[3].width;
        drawTextSafe(page, contactNumbers, { x: x + 5, y: rowY, size: 7, font, color: black, maxWidth: cols[4].width - 10 }); x += cols[4].width;
        page.drawText(fmtDate(s.dateOfBirth), { x: x + 5, y: rowY, size: 7.5, font, color: black, maxWidth: cols[5].width - 10 }); x += cols[5].width;
        page.drawText(fmtDate(s.admissionDate), { x: x + 5, y: rowY, size: 7.5, font, color: black, maxWidth: cols[6].width - 10 }); x += cols[6].width;
        drawTextSafe(page, s.address || '—', { x: x + 5, y: rowY, size: 7, font, color: black, maxWidth: cols[7].width - 10 });

        y -= rowHeight;
      });

      // Per-group summary line
      ensureSpace(20);
      page.drawText(`${groupStudents.length} student${groupStudents.length === 1 ? '' : 's'} in ${groupKey}  |  ${m} M  |  ${f} F`,
        { x: margin, y: y - 2, size: 8, font: bold, color: navy });
      y -= 26;
    });

    if (students.length === 0) {
      page.drawText('No students match the selected filters.', { x: margin, y, size: 10, font, color: grayText });
    } else {
      ensureSpace(30);
      page.drawRectangle({ x: margin, y: y - 8, width: tableWidth, height: 26, color: navy });
      page.drawText(`GRAND TOTAL: ${grandTotal} students  |  ${grandM} M  |  ${grandF} F`,
        { x: margin + 10, y: y - 1, size: 10.5, font: bold, color: rgb(1, 1, 1) });
      y -= 34;
    }

    const pages = pdfDoc.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Generated ${printDate.toISOString().slice(0, 10)} · GR Register · Page ${i + 1} of ${pages.length}`,
        { x: margin, y: 14, size: 7.5, font, color: grayText });
    });

    const bytes2 = await pdfDoc.save();
    return Buffer.from(bytes2);
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
      gradeSectionDistribution, sectionAgeStats, townDistribution,
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
      // Grade+Section breakdown — same as gradeDistribution but split further
      this.studentModel.aggregate([
        { $match: { ...filter, status: 'active' } },
        { $group: { _id: { grade: '$currentGrade', section: '$currentSection' }, count: { $sum: 1 } } },
        { $sort: { '_id.grade': 1, '_id.section': 1 } },
      ]),
      // Min/max/avg age per grade+section, computed from dateOfBirth as of today.
      // Using basic $subtract/$divide arithmetic (works on any MongoDB version)
      // rather than $dateDiff, which needs MongoDB 5.0+ — safer given this can't
      // be tested against the live Atlas cluster directly from here.
      this.studentModel.aggregate([
        { $match: { ...filter, status: 'active', dateOfBirth: { $exists: true, $ne: null } } },
        {
          $addFields: {
            ageYears: {
              $divide: [
                { $subtract: ['$$NOW', '$dateOfBirth'] },
                1000 * 60 * 60 * 24 * 365.25,
              ],
            },
          },
        },
        {
          $group: {
            _id: { grade: '$currentGrade', section: '$currentSection' },
            minAge: { $min: '$ageYears' },
            maxAge: { $max: '$ageYears' },
            avgAge: { $avg: '$ageYears' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.grade': 1, '_id.section': 1 } },
      ]),
      // Town-wise distribution (neighborhood/area, not the broader city)
      this.studentModel.aggregate([
        { $match: { ...filter, status: 'active', town: { $exists: true, $ne: '' } } },
        { $group: { _id: '$town', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Family-size distribution (from the Family module — linked via phone/CNIC
    // matching or manual assignment). Only counts VERIFIED families, since
    // retrofit-lastname groups start unverified and may be false positives.
    const families = await this.familyModel.find({ schoolSlug, verified: true }).lean();
    const familySizeBuckets: Record<string, number> = {};
    families.forEach(f => {
      const size = (f.studentIds || []).length;
      const key = size >= 3 ? '3+' : String(size);
      familySizeBuckets[key] = (familySizeBuckets[key] || 0) + 1;
    });
    const linkedStudentIds = new Set(families.flatMap(f => (f.studentIds || []).map((id: any) => String(id))));
    const unlinkedActiveCount = await this.studentModel.countDocuments({
      ...filter, status: 'active',
      _id: { $nin: Array.from(linkedStudentIds).map(id => new Types.ObjectId(id)) },
    });

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
      gradeSectionDistribution: gradeSectionDistribution.map((r: any) => ({
        grade: r._id.grade, section: r._id.section, count: r.count,
      })),
      sectionAgeStats: sectionAgeStats.map((r: any) => ({
        grade: r._id.grade, section: r._id.section,
        minAge: Math.floor(r.minAge),
        maxAge: Math.floor(r.maxAge),
        avgAge: Math.round(r.avgAge * 10) / 10,
        count: r.count,
      })),
      townDistribution: townDistribution.map((r: any) => ({ town: r._id, count: r.count })),
      familyDistribution: {
        byChildrenCount: familySizeBuckets, // e.g. { "1": 40, "2": 15, "3+": 4 }
        totalFamilies: families.length,
        studentsNotYetLinked: unlinkedActiveCount,
      },
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

  private csvEscape(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  generateImportTemplate(): string {
    const headers = [
      'firstName', 'lastName', 'dateOfBirth', 'gender', 'currentGrade',
      'currentSection', 'currentRollNumber', 'admissionNumber',
      'personalEmail', 'personalPhone', 'address', 'town', 'city', 'province',
      'guardianName', 'guardianRelation', 'guardianPhone', 'guardianEmail',
    ];
    // Guidance row: starts with '#' so it's visually unmistakable as an
    // instruction (not a student) and is automatically skipped by the
    // importer even if someone forgets to delete it before uploading.
    // Fields containing commas MUST go through csvEscape — this row is
    // exactly the kind of thing that silently breaks a naive CSV join.
    const guidance = [
      '# REQUIRED', '# REQUIRED (leave blank if student has one name only)',
      '# REQUIRED — DD/MM/YYYY or YYYY-MM-DD', '# REQUIRED — male or female',
      '# REQUIRED — e.g. Grade 5, Prek-2, KG',
      'e.g. A', 'e.g. 12', 'leave blank to auto-generate',
      'optional', 'optional — digits only',
      'if address has a comma, wrap the whole field in quotes',
      'optional — neighborhood/area, e.g. North Nazimabad, Gulberg, F.B. Area',
      'optional', 'optional',
      'optional', 'e.g. Father, Mother, Guardian',
      'optional', 'optional',
    ].map(f => this.csvEscape(f));
    const example = [
      'SAMPLE', 'DELETE-THIS-ROW', '2015-03-12', 'male', 'Grade 5',
      'A', '12', 'ADM-2026-0001',
      '', '03001234567', '123 Main Blvd', 'North Nazimabad', 'Karachi', 'Sindh',
      'Muhammad Khan', 'father', '03009876543', 'father@example.com',
    ];
    return [headers.join(','), guidance.join(','), example.join(',')].join('\n');
  }

  // RFC4180-aware CSV parser: naive split(newline) then split(',') breaks the
  // moment any field is quoted and contains a comma or an embedded line break
  // (both are valid CSV and both are common in real address fields) — a quoted
  // field like "Flat no,302\nVilla Nazimabad" was being sliced into two broken
  // rows before, silently shifting every column after it on the wrapped row.
  private parseCsv(buffer: Buffer): { headers: string[]; rows: string[][] } {
    let text = buffer.toString('utf-8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip UTF-8 BOM if present

    const records: string[][] = [];
    let field = '';
    let record: string[] = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        record.push(field.trim());
        field = '';
      } else if (ch === '\r') {
        // skip — \n (or end) handles the line break
      } else if (ch === '\n') {
        record.push(field.trim());
        field = '';
        if (record.some(c => c.length > 0)) records.push(record);
        record = [];
      } else {
        field += ch;
      }
    }
    // last field/record if file doesn't end with a newline
    if (field.length > 0 || record.length > 0) {
      record.push(field.trim());
      if (record.some(c => c.length > 0)) records.push(record);
    }

    if (records.length < 2) throw new BadRequestException('CSV file has no data rows');
    const [headers, ...rows] = records;
    return { headers: headers.map(h => h.trim()), rows };
  }

  // Excel exports a date-formatted cell as its underlying serial number
  // (days since 1899-12-30) when the CSV export doesn't preserve display
  // formatting — e.g. '44716' instead of '2022-05-05'. A bare 5-digit
  // number in this field is essentially always this, not a real date typed
  // by a human, so convert it rather than let `new Date(44716)` silently
  // produce a nonsense 1970s date.
  private parseFlexibleDate(raw: string): Date | null {
    const trimmed = (raw || '').replace(/[?|]/g, '').trim();
    if (!trimmed) return null;

    // Excel date-serial number leaking through from a CSV export that
    // dropped the cell's display format (e.g. '44716' instead of a date).
    if (/^\d{4,6}$/.test(trimmed)) {
      const serial = parseInt(trimmed, 10);
      if (serial > 20000 && serial < 60000) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        return new Date(excelEpoch + serial * 86400000);
      }
    }

    // Day-first DD/MM/YYYY or DD-MM-YYYY — the standard convention here,
    // but JS's native Date() assumes US MM/DD/YYYY and silently mis-parses
    // or rejects it (e.g. '18/07/2022' has no month 18, so it fails).
    const dayFirst = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (dayFirst) {
      let [, d, m, y] = dayFirst;
      if (y.length === 2) y = (parseInt(y, 10) > 30 ? '19' : '20') + y;
      const day = parseInt(d, 10), month = parseInt(m, 10), year = parseInt(y, 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(Date.UTC(year, month - 1, day));
        if (!isNaN(date.getTime())) return date;
      }
      return null; // e.g. a typo'd day/month like '06/-9/2021' — genuinely bad data
    }

    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
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
      address: col('address'), town: col('town'), city: col('city'), province: col('province'),
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

      // Skip the template's own guidance row (starts with '#') and the
      // obviously-a-placeholder sample row, in case someone forgets to
      // delete either before uploading their real data.
      const firstCell = (cols[0] || '').trim();
      if (firstCell.startsWith('#') || firstCell.toUpperCase() === 'SAMPLE') {
        return;
      }

      const errors: string[] = [];
      const get = (key: string) => {
        const v = idx[key] !== -1 ? cols[idx[key]] : '';
        return (v ?? '').replace(/^\?+/, '').trim();
      };

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
        dateOfBirth = this.parseFlexibleDate(dobRaw);
        if (!dateOfBirth) {
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
        town: get('town'),
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
    campusId?: string,
  ) {
    if (!rows || rows.length === 0) throw new BadRequestException('No rows to import');

    let created = 0, updated = 0, skipped = 0;
    const failed: any[] = [];

    const importable = rows.filter(r => !(r.errors && r.errors.length > 0));
    skipped += rows.length - importable.length;

    // Batch-fetch every possible existing match ONCE instead of one findOne
    // per row (was ~2 sequential DB round-trips per row — for a few hundred
    // students that's easily enough to blow past a request timeout).
    const admissionNumbers = importable.map(r => r.data.admissionNumber).filter(Boolean);
    const existingByAdmission = admissionNumbers.length
      ? await this.studentModel.find({ schoolSlug, admissionNumber: { $in: admissionNumbers } }).lean()
      : [];
    const admissionMap = new Map(existingByAdmission.map((s: any) => [s.admissionNumber, s]));

    const existingAll = await this.studentModel.find({ schoolSlug })
      .select('admissionNumber firstName lastName dateOfBirth').lean();
    const nameDobMap = new Map(existingAll.map((s: any) =>
      [`${(s.firstName || '').toLowerCase()}|${(s.lastName || '').toLowerCase()}|${s.dateOfBirth ? new Date(s.dateOfBirth).toISOString().slice(0, 10) : ''}`, s]));

    const toInsert: any[] = [];
    const updateOps: any[] = [];
    const usedStudentIds = new Set<string>();
    const year = new Date().getFullYear();
    // studentId has a GLOBAL unique index (not scoped per school), so seed
    // the used-set with every existing id for this year across all schools
    // too — not just checking uniqueness within this one batch.
    const existingIdsThisYear = await this.studentModel
      .find({ studentId: { $regex: `^STU-${year}-` } })
      .select('studentId').lean();
    existingIdsThisYear.forEach((s: any) => usedStudentIds.add(s.studentId));

    const generateUniqueStudentId = (): string => {
      let id: string;
      do {
        const random = Math.floor(1000 + Math.random() * 9000);
        id = `STU-${year}-${random}`;
      } while (usedStudentIds.has(id));
      usedStudentIds.add(id);
      return id;
    };

    // Template says 'leave blank to auto-generate' for admissionNumber but
    // nothing actually generated one — blank values were just passed
    // through as-is. Same collision-avoidance pattern as studentId.
    const usedAdmissionNumbers = new Set<string>();
    const existingAdmissionsThisYear = await this.studentModel
      .find({ schoolSlug, admissionNumber: { $regex: `^ADM-${year}-` } })
      .select('admissionNumber').lean();
    existingAdmissionsThisYear.forEach((s: any) => usedAdmissionNumbers.add(s.admissionNumber));
    const generateUniqueAdmissionNumber = (): string => {
      let num: string;
      do {
        const random = Math.floor(1000 + Math.random() * 9000);
        num = `ADM-${year}-${random}`;
      } while (usedAdmissionNumbers.has(num));
      usedAdmissionNumbers.add(num);
      return num;
    };

    for (const row of importable) {
      const admissionNumber = row.data.admissionNumber;
      const nameDobKey = `${(row.data.firstName || '').toLowerCase()}|${(row.data.lastName || '').toLowerCase()}|${row.data.dateOfBirth || ''}`;
      const existing = (admissionNumber && admissionMap.get(admissionNumber)) || nameDobMap.get(nameDobKey);

      if (existing) {
        if (duplicateAction === 'skip') { skipped++; continue; }
        if (duplicateAction === 'update') {
          const setFields: any = {
            currentGrade: row.data.currentGrade,
            currentSection: row.data.currentSection,
            currentRollNumber: row.data.currentRollNumber,
            personalEmail: row.data.personalEmail,
            personalPhone: row.data.personalPhone,
            address: row.data.address,
            town: row.data.town,
            city: row.data.city,
            province: row.data.province,
          };
          // Backfill admission number for existing records that never got
          // one (e.g. created before auto-generation was added) — updating
          // a duplicate shouldn't leave it permanently blank.
          if (!(existing as any).admissionNumber) {
            setFields.admissionNumber = row.data.admissionNumber || generateUniqueAdmissionNumber();
          }
          // Same backfill logic for campusId - re-running an import with
          // duplicateAction='update' is a natural opportunity to fix
          // records that were created before campus assignment existed.
          if (!(existing as any).campusId && campusId) {
            setFields.campusId = campusId;
          }
          updateOps.push({
            updateOne: {
              filter: { _id: existing._id },
              update: { $set: setFields },
            },
          });
          continue;
        }
        // duplicateAction === 'createAnyway' falls through to insert below
      }

      const studentId = generateUniqueStudentId();
      const allowedRelations = ['father', 'mother', 'guardian'];
      const normalizedRelation = (row.data.guardianRelation || '').toLowerCase().trim();
      const guardians = row.data.guardianName ? [{
        name: row.data.guardianName,
        relation: allowedRelations.includes(normalizedRelation) ? normalizedRelation : 'guardian',
        phone: row.data.guardianPhone,
        email: row.data.guardianEmail,
        isPrimary: true,
      }] : [];

      toInsert.push({
        _row: row.row,
        doc: {
          studentId,
          firstName: row.data.firstName,
          lastName: row.data.lastName,
          dateOfBirth: new Date(row.data.dateOfBirth),
          gender: row.data.gender,
          currentGrade: row.data.currentGrade,
          currentSection: row.data.currentSection,
          currentRollNumber: row.data.currentRollNumber,
          currentAcademicYear: academicYear,
          admissionNumber: row.data.admissionNumber || generateUniqueAdmissionNumber(),
          personalEmail: row.data.personalEmail,
          personalPhone: row.data.personalPhone,
          address: row.data.address,
          town: row.data.town,
          city: row.data.city,
          province: row.data.province,
          guardians,
          schoolSlug,
          status: 'active',
          ...(campusId ? { campusId } : {}),
        },
      });
    }

    if (updateOps.length > 0) {
      const result = await this.studentModel.bulkWrite(updateOps, { ordered: false });
      updated += result.modifiedCount || 0;
    }

    if (toInsert.length > 0) {
      // NOTE: insertMany() was tried here first but mysteriously resolved
      // successfully with insertedCount=0 and zero documents actually
      // persisted (confirmed via an immediate same-request re-query) —
      // with no thrown error to explain why. Individual .create() calls
      // are the same operation type used successfully everywhere else in
      // this codebase (Leads, Tenants, Users, tickets), so falling back to
      // that here rather than continue chasing insertMany's specific
      // silent failure. Still avoids the original N sequential
      // duplicate-check queries per row, which was the actual timeout cause.
      for (const item of toInsert) {
        try {
          await this.studentModel.create(item.doc);
          created++;
        } catch (err: any) {
          failed.push({ row: item._row, error: err.message || 'Insert failed' });
        }
      }
    }

    return { created, updated, skipped, failed };
  }

  // ============================================================
  // ENROLLMENT FIELDS — custom fields for the enrollment wizard
  // (Step 7 "Services") and the admin's "Manage Enrollment Fields"
  // panel, scoped per school.
  // ============================================================

  async getEnrollmentFields(schoolSlug: string) {
    return this.enrollmentFieldModel
      .find({ schoolSlug })
      .sort({ section: 1, sortOrder: 1 })
      .lean();
  }

  async createEnrollmentField(schoolSlug: string, data: any) {
    if (!data?.label?.trim()) throw new BadRequestException('Label is required.');
    if (!data?.fieldKey?.trim()) throw new BadRequestException('fieldKey is required.');
    const { isSystemField: _ignored, schoolSlug: _ignored2, ...safeData } = data;
    return this.enrollmentFieldModel.create({ ...safeData, schoolSlug, isSystemField: false });
  }

  async updateEnrollmentField(schoolSlug: string, id: string, data: any) {
    const { isSystemField, schoolSlug: _ignored, ...safeData } = data || {};
    const updated = await this.enrollmentFieldModel.findOneAndUpdate(
      { _id: id, schoolSlug, isSystemField: false },
      { $set: safeData },
      { new: true },
    ).lean();
    if (!updated) throw new BadRequestException('Field not found or cannot update system fields.');
    return updated;
  }

  async deleteEnrollmentField(schoolSlug: string, id: string) {
    const deleted = await this.enrollmentFieldModel.findOneAndDelete({
      _id: id,
      schoolSlug,
      isSystemField: false,
    });
    if (!deleted) throw new BadRequestException('Field not found or cannot delete system fields.');
    return { message: 'Custom field deleted' };
  }

  async seedDefaultEnrollmentFields(schoolSlug: string) {
    const existing = await this.enrollmentFieldModel.countDocuments({ schoolSlug });
    if (existing > 0) return { message: 'Fields already seeded', count: existing };

    const defaultFields = [
      { label: 'Previous School Name', fieldKey: 'previousSchoolName', fieldType: 'text', section: 'admission', sortOrder: 1, isSystemField: true },
      { label: 'Previous Grade', fieldKey: 'previousGrade', fieldType: 'text', section: 'admission', sortOrder: 2, isSystemField: true },
      { label: 'Transfer Certificate No', fieldKey: 'transferCertNo', fieldType: 'text', section: 'admission', sortOrder: 3, isSystemField: true },
      { label: 'Admission Type', fieldKey: 'admissionType', fieldType: 'select', options: ['new', 'transfer', 'readmission', 'lateral'], section: 'admission', sortOrder: 4, isRequired: true, isSystemField: true },
      { label: 'Nationality', fieldKey: 'nationality', fieldType: 'text', section: 'personal', sortOrder: 1, isSystemField: true },
      { label: 'Second Nationality', fieldKey: 'secondNationality', fieldType: 'text', section: 'personal', sortOrder: 2, isSystemField: true },
      { label: 'Religion', fieldKey: 'religion', fieldType: 'select', options: ['Islam', 'Christianity', 'Hinduism', 'Judaism', 'Buddhism', 'Other'], section: 'personal', sortOrder: 3, isSystemField: true },
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
      defaultFields.map(f => ({ ...f, schoolSlug })),
    );
    return { message: 'Default enrollment fields seeded', count: defaultFields.length };
  }
}
