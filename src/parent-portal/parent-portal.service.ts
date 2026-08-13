import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { assertStudentAccess, getGuardianStudentIds, ScopedUser } from '../auth/scope.util';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { StudentAttendance, StudentAttendanceDocument } from '../students/schemas/student-supporting.schema';
import { Invoice, InvoiceDocument } from '../finance/schemas/finance.schema';
import { MarkEntry, MarkEntryDocument, ReportCard, ReportCardDocument } from '../assessments/schemas/assessment.schema';
import { BehaviourRecord, BehaviourRecordDocument, TarbiyahAssessment, TarbiyahAssessmentDocument } from '../behaviour/schemas/behaviour.schema';
import { Timetable, TimetableDocument } from '../modules/teaching/schemas/timetable.schema';
import { Assignment, AssignmentDocument } from '../modules/teaching/schemas/assignment.schema';
import { Book, BookDocument } from '../modules/academics/schemas/book.schema';
import { BookIssue, BookIssueDocument } from '../modules/academics/schemas/book-issue.schema';
import { DocumentRecord, DocumentRecordDocument } from '../documents/schemas/documents.schema';
import { SchoolEvent, SchoolEventDocument } from '../campus/campus.schema';
import { PTMMeeting, PTMMeetingDocument } from '../modules/teaching/schemas/ptm-meeting.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import {
  ConsentRequest, ConsentRequestDocument,
  ConsentResponse, ConsentResponseDocument,
  StudentLeave, StudentLeaveDocument,
} from './schemas/consent-and-leave.schema';

@Injectable()
export class ParentPortalService {
  constructor(
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(StudentAttendance.name) private attendanceModel: Model<StudentAttendanceDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(MarkEntry.name) private markModel: Model<MarkEntryDocument>,
    @InjectModel(ReportCard.name) private reportCardModel: Model<ReportCardDocument>,
    @InjectModel(BehaviourRecord.name) private behaviourModel: Model<BehaviourRecordDocument>,
    @InjectModel(TarbiyahAssessment.name) private tarbiyahModel: Model<TarbiyahAssessmentDocument>,
    @InjectModel(Timetable.name) private timetableModel: Model<TimetableDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    @InjectModel(BookIssue.name) private bookIssueModel: Model<BookIssueDocument>,
    @InjectModel(DocumentRecord.name) private documentModel: Model<DocumentRecordDocument>,
    @InjectModel(SchoolEvent.name) private eventModel: Model<SchoolEventDocument>,
    @InjectModel(PTMMeeting.name) private ptmModel: Model<PTMMeetingDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ConsentRequest.name) private consentRequestModel: Model<ConsentRequestDocument>,
    @InjectModel(ConsentResponse.name) private consentResponseModel: Model<ConsentResponseDocument>,
    @InjectModel(StudentLeave.name) private studentLeaveModel: Model<StudentLeaveDocument>,
  ) {}

  // ── Admin: link a guardian's login to their child/children ─────
  // This is the foundational step - without it, a parent account has
  // no defined relationship to any student, and every endpoint below
  // would have nothing to check against.
  async linkGuardianToStudents(schoolSlug: string, tenantId: string, institutionId: string, email: string, studentIds: string[]) {
    const students = await this.studentModel.find({ _id: { $in: studentIds }, schoolSlug }).lean();
    if (students.length !== studentIds.length) throw new BadRequestException('One or more student ids were not found in this school');

    let user = await this.userModel.findOne({ email: email.toLowerCase().trim(), tenantId });
    let tempPassword: string | undefined;

    if (!user) {
      tempPassword = `Welcome${Math.floor(1000 + Math.random() * 9000)}!`;
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      const guardian = (students[0] as any).guardians?.find((g: any) => g.email === email.toLowerCase().trim());
      user = await this.userModel.create({
        tenantId, institutionId,
        email: email.toLowerCase().trim(),
        passwordHash,
        profile: { firstName: guardian?.name?.split(' ')?.[0] || 'Parent', lastName: guardian?.name?.split(' ')?.slice(1)?.join(' ') || '' },
        primaryRole: 'parent',
        isActive: true,
        guardianOfStudentIds: studentIds.map((id) => new Types.ObjectId(id)),
      });
    } else {
      const existing = (user.guardianOfStudentIds || []).map(String);
      const merged = Array.from(new Set([...existing, ...studentIds]));
      user.guardianOfStudentIds = merged.map((id) => new Types.ObjectId(id));
      await user.save();
    }

    return {
      email: user.email,
      tempPassword,
      guardianOfStudentIds: user.guardianOfStudentIds,
      note: tempPassword ? 'New login created - share this temporary password with the guardian securely.' : 'Existing login updated with the new student link(s).',
    };
  }

  async unlinkGuardianFromStudent(tenantId: string, email: string, studentId: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase().trim(), tenantId });
    if (!user) throw new NotFoundException('No account found with this email');
    user.guardianOfStudentIds = (user.guardianOfStudentIds || []).filter((id) => String(id) !== String(studentId));
    await user.save();
    return { email: user.email, guardianOfStudentIds: user.guardianOfStudentIds };
  }

  // ── My Students (the Student Selector) ──────────────────────────
  async getMyStudents(requestingUser: ScopedUser, schoolSlug: string) {
    const ids = getGuardianStudentIds(requestingUser);
    if (ids.length === 0) return [];
    return this.studentModel.find({ _id: { $in: ids }, schoolSlug })
      .select('firstName lastName currentGrade currentSection admissionNo studentId photoUrl status')
      .lean();
  }

  // ── Student Profile ──────────────────────────────────────────────
  async getStudentProfile(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).lean();
    if (!student) throw new NotFoundException('Student not found');
    return student;
  }

  async getMedical(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('medical firstName lastName').lean();
    if (!student) throw new NotFoundException('Student not found');
    return (student as any).medical || {};
  }

  async getAcademicDocuments(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('documents firstName lastName').lean();
    if (!student) throw new NotFoundException('Student not found');
    return (student as any).documents || [];
  }

  // ── Attendance ────────────────────────────────────────────────
  async getAttendance(studentId: string, requestingUser: ScopedUser, schoolSlug: string, query: any) {
    assertStudentAccess(requestingUser, studentId);
    const filter: any = { studentId: new Types.ObjectId(studentId), schoolSlug };
    if (query.from || query.to) {
      filter.date = {};
      if (query.from) filter.date.$gte = new Date(query.from);
      if (query.to) filter.date.$lte = new Date(query.to);
    }
    return this.attendanceModel.find(filter).sort({ date: -1 }).limit(200).lean();
  }

  // ── Homework ─────────────────────────────────────────────────
  async getHomework(studentId: string, requestingUser: ScopedUser, tenantId: string, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection').lean();
    if (!student) throw new NotFoundException('Student not found');
    return this.assignmentModel.find({
      tenantId, gradeLevel: (student as any).currentGrade,
      $or: [{ sectionName: (student as any).currentSection }, { sectionName: { $exists: false } }, { sectionName: null }],
    }).sort({ dueDate: -1 }).limit(100).lean();
  }

  // ── Results ──────────────────────────────────────────────────
  async getResults(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    return this.reportCardModel.find({ studentId: new Types.ObjectId(studentId), schoolSlug, published: true }).sort({ createdAt: -1 }).lean();
  }

  // ── Dues ─────────────────────────────────────────────────────
  async getDues(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    return this.invoiceModel.find({ studentId: new Types.ObjectId(studentId), schoolSlug, isDeleted: { $ne: true } }).sort({ createdAt: -1 }).lean();
  }

  // ── Behaviour & Tarbiyah ──────────────────────────────────────
  async getBehaviourAndTarbiyah(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const [records, tarbiyah] = await Promise.all([
      this.behaviourModel.find({ studentId: new Types.ObjectId(studentId), schoolSlug }).sort({ date: -1 }).limit(50).lean(),
      this.tarbiyahModel.find({ studentId: new Types.ObjectId(studentId), schoolSlug }).sort({ assessmentDate: -1 }).limit(20).lean(),
    ]);
    return { behaviourRecords: records, tarbiyahAssessments: tarbiyah };
  }

  // ── Timetable ─────────────────────────────────────────────────
  async getTimetable(studentId: string, requestingUser: ScopedUser, tenantId: string, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection').lean();
    if (!student) throw new NotFoundException('Student not found');
    return this.timetableModel.findOne({
      tenantId, gradeLevel: (student as any).currentGrade, sectionName: (student as any).currentSection, status: 'active',
    }).lean();
  }

  // ── Datesheet (from the Assessments collection covering the student's grade) ──
  async getDatesheet(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade').lean();
    if (!student) throw new NotFoundException('Student not found');
    // Assessment itself lives in the assessments module's own schema -
    // read via the shared connection's collection directly rather than
    // pulling in that whole module's dependency graph for one read.
    return this.reportCardModel.db.collection('assessments').find({
      schoolSlug, grade: (student as any).currentGrade, status: { $in: ['scheduled', 'ongoing'] },
    }).sort({ startDate: 1 }).toArray();
  }

  // ── Library ──────────────────────────────────────────────────
  async getLibrary(studentId: string, requestingUser: ScopedUser, tenantId: string) {
    assertStudentAccess(requestingUser, studentId);
    return this.bookIssueModel.find({ tenantId, borrowerType: 'student', borrowerId: new Types.ObjectId(studentId) }).sort({ issueDate: -1 }).lean();
  }

  // ── Circulars (Documents tagged public, school-wide) ────────────
  async getCirculars(schoolSlug: string) {
    return this.documentModel.find({ schoolSlug, category: 'circular', status: 'active', visibility: 'public' }).sort({ createdAt: -1 }).limit(50).lean();
  }

  // ── Events Calendar ──────────────────────────────────────────
  async getEvents(schoolSlug: string, query: any) {
    const filter: any = { schoolSlug };
    if (query.from || query.to) {
      filter.startDate = {};
      if (query.from) filter.startDate.$gte = new Date(query.from);
      if (query.to) filter.startDate.$lte = new Date(query.to);
    }
    return this.eventModel.find(filter).sort({ startDate: 1 }).lean();
  }

  // ── PTM ──────────────────────────────────────────────────────
  async getPTMHistory(studentId: string, requestingUser: ScopedUser, tenantId: string) {
    assertStudentAccess(requestingUser, studentId);
    return this.ptmModel.find({ tenantId, studentId: new Types.ObjectId(studentId) }).sort({ scheduledDate: -1 }).lean();
  }

  // ── Consent ──────────────────────────────────────────────────
  async getConsentRequests(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const [requests, responses] = await Promise.all([
      this.consentRequestModel.find({ schoolSlug, isActive: true, studentIds: new Types.ObjectId(studentId) }).sort({ createdAt: -1 }).lean(),
      this.consentResponseModel.find({ schoolSlug, studentId: new Types.ObjectId(studentId) }).lean(),
    ]);
    const responseMap = new Map(responses.map((r: any) => [String(r.consentRequestId), r]));
    return requests.map((r: any) => ({ ...r, response: responseMap.get(String(r._id)) || null }));
  }

  async respondToConsent(
    consentRequestId: string, studentId: string, requestingUser: ScopedUser, respondingUserId: string,
    schoolSlug: string, decision: 'granted' | 'declined', respondedByName: string, notes?: string,
  ) {
    assertStudentAccess(requestingUser, studentId);
    const request = await this.consentRequestModel.findOne({ _id: consentRequestId, schoolSlug });
    if (!request) throw new NotFoundException('Consent request not found');

    return this.consentResponseModel.findOneAndUpdate(
      { consentRequestId, studentId, schoolSlug },
      { $set: { decision, notes, respondedByName, respondedByUserId: respondingUserId } },
      { new: true, upsert: true },
    );
  }

  // ── My Leaves (student absence requests) ─────────────────────
  async createStudentLeave(studentId: string, requestingUser: ScopedUser, requestedByUserId: string, requestedByName: string, schoolSlug: string, data: any) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).lean();
    if (!student) throw new NotFoundException('Student not found');

    return this.studentLeaveModel.create({
      studentId, studentName: `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim(),
      fromDate: new Date(data.fromDate), toDate: new Date(data.toDate),
      reason: data.reason, leaveType: data.leaveType || 'other',
      requestedByUserId, requestedByName, status: 'pending',
      schoolSlug,
      campusId: (student as any).campusId ? (() => { try { return new Types.ObjectId((student as any).campusId); } catch { return null; } })() : null,
    });
  }

  async getStudentLeaves(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    return this.studentLeaveModel.find({ studentId, schoolSlug }).sort({ createdAt: -1 }).lean();
  }
}
