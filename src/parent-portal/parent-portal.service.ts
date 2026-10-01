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
import { AssignmentSubmission, AssignmentSubmissionDocument } from '../modules/teaching/schemas/assignment-submission.schema';
import { Staff, StaffDocument } from '../modules/hr/schemas/staff.schema';
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
import {
  Notification, NotificationDocument,
  MessageThread, MessageThreadDocument,
  Message, MessageDocument,
} from './schemas/notification-and-message.schema';
import { Syllabus, SyllabusDocument } from '../syllabus/schemas/syllabus.schema';
import { LessonProgress, LessonProgressDocument } from '../syllabus/schemas/lesson-progress.schema';
import { AssessmentService } from '../assessments/assessment.service';

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
    @InjectModel(AssignmentSubmission.name) private submissionModel: Model<AssignmentSubmissionDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(Book.name) private bookModel: Model<BookDocument>,
    @InjectModel(BookIssue.name) private bookIssueModel: Model<BookIssueDocument>,
    @InjectModel(DocumentRecord.name) private documentModel: Model<DocumentRecordDocument>,
    @InjectModel(SchoolEvent.name) private eventModel: Model<SchoolEventDocument>,
    @InjectModel(PTMMeeting.name) private ptmModel: Model<PTMMeetingDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ConsentRequest.name) private consentRequestModel: Model<ConsentRequestDocument>,
    @InjectModel(ConsentResponse.name) private consentResponseModel: Model<ConsentResponseDocument>,
    @InjectModel(StudentLeave.name) private studentLeaveModel: Model<StudentLeaveDocument>,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(MessageThread.name) private threadModel: Model<MessageThreadDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Syllabus.name) private syllabusModel: Model<SyllabusDocument>,
    @InjectModel(LessonProgress.name) private lessonProgressModel: Model<LessonProgressDocument>,
    private assessmentService: AssessmentService,
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
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection campusId').lean();
    if (!student) throw new NotFoundException('Student not found');
    const filter: any = {
      tenantId, gradeLevel: (student as any).currentGrade,
      $or: [{ sectionName: (student as any).currentSection }, { sectionName: { $exists: false } }, { sectionName: null }],
    };
    // A student's own campusId is the source of truth for scoping this,
    // not the assignment's - without it, a multi-campus tenant where two
    // campuses happen to name a section the same way ("Grade 5 - A") leaked
    // homework across campuses to any parent whose child's section matched.
    if ((student as any).campusId) filter.campusId = new Types.ObjectId((student as any).campusId);
    const assignments = await this.assignmentModel.find(filter).sort({ dueDate: -1 }).limit(100).lean();
    if (assignments.length === 0) return [];

    const submissions = await this.submissionModel.find({
      tenantId, studentId: new Types.ObjectId(studentId),
      assignmentId: { $in: assignments.map((a) => a._id) },
    }).lean();
    const byAssignment = new Map(submissions.map((s) => [String(s.assignmentId), s]));
    // Merge in this student's own submission status/grade/feedback so the
    // parent sees "submitted / late / graded, scored X/Y" per assignment,
    // not just the bare assignment listing.
    return assignments.map((a) => ({ ...a, mySubmission: byAssignment.get(String(a._id)) || null }));
  }

  async submitHomework(studentId: string, assignmentId: string, requestingUser: ScopedUser, tenantId: string, schoolSlug: string, dto: { textResponse?: string; attachmentS3Keys?: string[] }) {
    assertStudentAccess(requestingUser, studentId);
    if (!dto.textResponse?.trim() && !(dto.attachmentS3Keys || []).length) {
      throw new BadRequestException('Submission needs a written response, an attachment, or both.');
    }
    const assignment = await this.assignmentModel.findOne({ _id: assignmentId, tenantId });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const submission = await this.submissionModel.findOne({ tenantId, assignmentId: assignment._id, studentId: new Types.ObjectId(studentId) });
    if (!submission) throw new NotFoundException('This assignment is not on your child\'s class roster - contact the school if this looks wrong.');
    if (submission.status === 'graded') throw new BadRequestException('This has already been graded and can no longer be resubmitted.');

    const now = new Date();
    const isLate = !!assignment.dueDate && now > assignment.dueDate;
    submission.textResponse = dto.textResponse;
    submission.attachmentS3Keys = dto.attachmentS3Keys || [];
    submission.submittedAt = now;
    submission.isLate = isLate;
    submission.status = isLate ? 'late' : 'submitted';
    await submission.save();

    const [stats] = await this.assignmentModel.db.collection('assignmentSubmissions').aggregate([
      { $match: { assignmentId: assignment._id } },
      { $group: { _id: null, submissionsCount: { $sum: { $cond: [{ $in: ['$status', ['submitted', 'late', 'graded']] }, 1, 0] } } } },
    ]).toArray();
    await this.assignmentModel.updateOne({ _id: assignment._id }, { $set: { submissionsCount: stats?.submissionsCount || 0 } });

    if (assignment.teacherId) {
      const teacher = await this.staffModel.findOne({ _id: assignment.teacherId }).select('userId').lean();
      if ((teacher as any)?.userId) {
        await this.notificationModel.create({
          recipientUserId: (teacher as any).userId, type: 'homework',
          title: `Submission received: ${assignment.title}`,
          body: `${submission.studentName} ${isLate ? 'submitted (late)' : 'submitted'} "${assignment.title}".`,
          relatedEntityId: String(assignment._id), schoolSlug,
        });
      }
    }
    return submission.toObject();
  }

  // ── Learning Resources (from delivered lesson plans covering this student's grade) ──
  async getLearningResources(studentId: string, requestingUser: ScopedUser, tenantId: string, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection').lean();
    if (!student) throw new NotFoundException('Student not found');
    // LessonPlan lives in the Teaching module's own schema - read via the
    // shared connection directly, same approach as getDatesheet, rather
    // than pulling in that module's whole dependency graph.
    const plans = await this.reportCardModel.db.collection('lessonPlans').find({
      tenantId: new Types.ObjectId(tenantId), gradeLevel: (student as any).currentGrade,
      $or: [{ sectionName: (student as any).currentSection }, { sectionName: { $exists: false } }, { sectionName: null }],
      resources: { $exists: true, $ne: [] },
    }).sort({ planDate: -1 }).limit(50).toArray();
    return plans.map((p: any) => ({
      subject: p.subject, topic: p.topic, planDate: p.planDate, resources: p.resources,
    }));
  }

  // ── LMS: My Courses (published syllabi + this student's own lesson
  // completion state) ─────────────────────────────────────────────
  async getMyCourses(studentId: string, requestingUser: ScopedUser, tenantId: string, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection campusId').lean();
    if (!student) throw new NotFoundException('Student not found');

    const filter: any = {
      tenantId, gradeLevel: (student as any).currentGrade, publishedToStudents: true,
      $or: [{ sectionName: (student as any).currentSection }, { sectionName: { $exists: false } }, { sectionName: null }],
    };
    // Same campus-scoping rule as getHomework - a student's own campusId
    // decides this, not the syllabus's, so a matching grade/section name
    // at a different campus never leaks in.
    if ((student as any).campusId) filter.campusId = new Types.ObjectId((student as any).campusId);

    const syllabi = await this.syllabusModel.find(filter).sort({ subjectName: 1 }).lean();
    if (syllabi.length === 0) return [];

    const progressRows = await this.lessonProgressModel.find({
      studentId: new Types.ObjectId(studentId), syllabusId: { $in: syllabi.map((s: any) => s._id) },
    }).lean();
    const progressByKey = new Map(progressRows.map((p: any) => [`${p.syllabusId}-${p.unitNo}-${p.topicNo}-${p.lessonNo}`, p]));

    return syllabi.map((s: any) => {
      let totalLessons = 0;
      let completedLessons = 0;
      const units = (s.units || []).map((u: any) => ({
        unitNo: u.unitNo,
        unitName: u.unitName,
        topics: (u.topics || []).map((t: any) => ({
          topicNo: t.topicNo,
          topicName: t.topicName,
          lessons: (t.lessons || []).slice().sort((a: any, b: any) => a.order - b.order).map((l: any) => {
            const progress = progressByKey.get(`${s._id}-${u.unitNo}-${t.topicNo}-${l.lessonNo}`);
            const status = progress?.status || 'not_started';
            totalLessons += 1;
            if (status === 'completed') completedLessons += 1;
            return {
              lessonNo: l.lessonNo, title: l.title, description: l.description,
              type: l.type, url: l.url, fileUrl: l.fileUrl, fileName: l.fileName,
              status,
            };
          }),
        })).filter((t: any) => t.lessons.length > 0),
      })).filter((u: any) => u.topics.length > 0);

      return {
        syllabusId: s._id, subjectName: s.subjectName, teacherName: s.teacherName,
        academicYearLabel: s.academicYearLabel, term: s.term,
        totalLessons, completedLessons,
        completionPct: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
        units,
      };
    }).filter((c: any) => c.totalLessons > 0); // a published syllabus with no lessons yet has nothing to show
  }

  async markLessonProgress(studentId: string, requestingUser: ScopedUser, tenantId: string, schoolSlug: string, dto: { syllabusId: string; unitNo: number; topicNo: number; lessonNo: number; status: string }) {
    assertStudentAccess(requestingUser, studentId);
    if (!['not_started', 'in_progress', 'completed'].includes(dto.status)) {
      throw new BadRequestException('Invalid status');
    }
    const syllabus = await this.syllabusModel.findOne({ _id: dto.syllabusId, tenantId, publishedToStudents: true }).lean();
    if (!syllabus) throw new NotFoundException('Course not found');
    const unit = (syllabus.units || []).find((u: any) => u.unitNo === dto.unitNo);
    const topic = unit?.topics?.find((t: any) => t.topicNo === dto.topicNo);
    const lesson = topic?.lessons?.find((l: any) => l.lessonNo === dto.lessonNo);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const updated = await this.lessonProgressModel.findOneAndUpdate(
      { studentId: new Types.ObjectId(studentId), syllabusId: new Types.ObjectId(dto.syllabusId), unitNo: dto.unitNo, topicNo: dto.topicNo, lessonNo: dto.lessonNo },
      {
        $set: {
          status: dto.status, completedAt: dto.status === 'completed' ? new Date() : undefined,
          tenantId, schoolSlug,
        },
      },
      { upsert: true, new: true },
    );
    return updated;
  }

  // ── LMS Phase 2: self-paced online quizzes ─────────────────────
  // Thin wrappers around AssessmentService - the grading/auto-mark logic
  // lives there once, shared with the teacher-facing review queue,
  // rather than duplicated here. The only thing Parent Portal adds is
  // the guardian-access check and resolving this student's own
  // grade/section to list what's actually available to them.
  async listMyQuizzes(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection campusId').lean();
    if (!student) throw new NotFoundException('Student not found');
    return this.assessmentService.listAvailableQuizzes(schoolSlug, studentId, (student as any).currentGrade, (student as any).currentSection, (student as any).campusId);
  }

  async startQuiz(studentId: string, requestingUser: ScopedUser, schoolSlug: string, dto: { assessmentId: string; subject: string }) {
    assertStudentAccess(requestingUser, studentId);
    return this.assessmentService.startQuizAttempt(schoolSlug, studentId, dto);
  }

  async submitQuiz(studentId: string, requestingUser: ScopedUser, schoolSlug: string, attemptId: string, answers: { questionId: string; selectedOptionIndex?: number; textAnswer?: string }[]) {
    assertStudentAccess(requestingUser, studentId);
    return this.assessmentService.submitQuizAttempt(schoolSlug, studentId, attemptId, answers);
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

  // ── Notifications / Inbox (same data, two views) ──────────────
  async getNotifications(userId: string, schoolSlug: string, query: any) {
    const filter: any = { recipientUserId: new Types.ObjectId(userId), schoolSlug };
    if (query.unreadOnly === 'true') filter.isRead = false;
    return this.notificationModel.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  }

  async markNotificationRead(id: string, userId: string, schoolSlug: string) {
    const n = await this.notificationModel.findOneAndUpdate(
      { _id: id, recipientUserId: new Types.ObjectId(userId), schoolSlug },
      { $set: { isRead: true, readAt: new Date() } }, { new: true },
    );
    if (!n) throw new NotFoundException('Notification not found');
    return n;
  }

  async markAllNotificationsRead(userId: string, schoolSlug: string) {
    const result = await this.notificationModel.updateMany(
      { recipientUserId: new Types.ObjectId(userId), schoolSlug, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return { updated: result.modifiedCount };
  }

  // ── Messages ────────────────────────────────────────────────
  async getMyThreads(userId: string, schoolSlug: string) {
    return this.threadModel.find({ guardianUserId: new Types.ObjectId(userId), schoolSlug }).sort({ lastMessageAt: -1 }).lean();
  }

  async createThread(userId: string, guardianName: string, schoolSlug: string, requestingUser: ScopedUser, data: { subject: string; studentId?: string; studentName?: string; staffId: string; staffName: string; firstMessage: string }) {
    if (data.studentId) assertStudentAccess(requestingUser, data.studentId);
    const thread = await this.threadModel.create({
      subject: data.subject, studentId: data.studentId || null, studentName: data.studentName,
      guardianUserId: userId, guardianName,
      staffId: data.staffId, staffName: data.staffName,
      lastMessagePreview: data.firstMessage.slice(0, 140), lastMessageAt: new Date(), staffHasUnread: true,
      schoolSlug,
    });
    await this.messageModel.create({ threadId: thread._id, senderRole: 'guardian', senderName: guardianName, body: data.firstMessage, schoolSlug });
    return thread;
  }

  async getThreadMessages(threadId: string, userId: string, schoolSlug: string) {
    const thread = await this.threadModel.findOne({ _id: threadId, guardianUserId: new Types.ObjectId(userId), schoolSlug });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.guardianHasUnread) {
      thread.guardianHasUnread = false;
      await thread.save();
    }
    return this.messageModel.find({ threadId, schoolSlug }).sort({ createdAt: 1 }).lean();
  }

  async sendMessage(threadId: string, userId: string, guardianName: string, schoolSlug: string, body: string) {
    const thread = await this.threadModel.findOne({ _id: threadId, guardianUserId: new Types.ObjectId(userId), schoolSlug });
    if (!thread) throw new NotFoundException('Thread not found');
    const message = await this.messageModel.create({ threadId, senderRole: 'guardian', senderName: guardianName, body, schoolSlug });
    thread.lastMessagePreview = body.slice(0, 140);
    thread.lastMessageAt = new Date();
    thread.staffHasUnread = true;
    await thread.save();
    return message;
  }
}
