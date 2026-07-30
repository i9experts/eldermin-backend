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
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
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
    @InjectModel('School') private schoolModel: Model<any>,
    @InjectModel(Family.name) private familyModel: Model<FamilyDocument>,
    private uploadService: UploadService,
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
        currentGrade: 'Grade', currentSection: 'Section', currentRollNumber: 'GR No',
        currentAcademicYear: 'Academic Year', houseGroup: 'House Group',
      },
    },
    admission: {
      label: 'Admission Information',
      fields: {
        admissionNumber: 'Admission Number', admissionDate: 'Admission Date',
        previousSchool: 'Previous School',
      },
    },
    status: {
      label: 'Status',
      fields: {
        status: 'Status', scholarshipHolder: 'Scholarship Holder', specialNeeds: 'Special Needs',
      },
    },
  };

  async generateProfilePdf(id: string, schoolSlug: string, selectedFields: string[]): Promise<Buffer> {
    const student: any = await this.studentModel.findOne({ _id: id, schoolSlug }).lean();
    if (!student) throw new NotFoundException('Student not found');
    const school: any = await this.schoolModel.findOne({ slug: schoolSlug }).lean();

    const selected = new Set(selectedFields || []);
    const includePhoto = selected.has('photo');
    const includeGuardians = selected.has('guardians');

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
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

    const fetchImageBytes = async (url: string): Promise<{ bytes: ArrayBuffer; isPng: boolean } | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const bytes = await res.arrayBuffer();
        const isPng = url.toLowerCase().includes('.png') || res.headers.get('content-type')?.includes('png');
        return { bytes, isPng: !!isPng };
      } catch {
        return null;
      }
    };

    // ── Header banner ──
    const bannerHeight = 95;
    page.drawRectangle({ x: 0, y: y - (bannerHeight - 25), width: pageWidth, height: bannerHeight, color: navy });
    const bannerTop = y + 25;
    const bannerBottom = y - (bannerHeight - 25);
    const bannerCenterY = (bannerTop + bannerBottom) / 2;

    let textStartX = margin;
    if (school?.logo) {
      const img = await fetchImageBytes(school.logo);
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

    const schoolName = school?.name || 'School';
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
      const img = await fetchImageBytes(student.photo);
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

    page.drawText(`${student.firstName || ''} ${student.lastName || ''}`.trim(), {
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
        if (fieldKey === 'dateOfBirth' || fieldKey === 'admissionDate') value = fmtValue(value ? new Date(value) : null);
        else value = fmtValue(value);
        page.drawText(value, { x: margin + 175, y, size: 10, font, color: black });
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
        page.drawText(line, { x: margin + 14, y, size: 10, font, color: black });
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
}
