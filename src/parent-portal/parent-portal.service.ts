import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { assertStudentAccess, getGuardianStudentIds, ScopedUser } from '../auth/scope.util';
import { notifyGuardiansOfStudents } from '../common/utils/notify-guardians.util';
import { sameGrade, sameSection, gradeMatcher, sectionMatcher } from '../common/utils/class-match.util';
import { UploadService } from '../upload/upload.service';
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
import { CertificatesService } from '../modules/certificates/certificates.service';

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
    private certificatesService: CertificatesService,
    private uploadService: UploadService,
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
    const students = await this.studentModel.find({ _id: { $in: ids }, schoolSlug })
      .select('firstName lastName currentGrade currentSection admissionNumber studentId photo status')
      .lean();
    // The web ERP stores the picture as Student.photo (set by
    // POST /students/:id/photo); the app reads it as photoUrl.
    return students.map((s: any) => ({ ...s, admissionNo: s.admissionNumber, photoUrl: s.photo || null }));
  }

  // ── Student Profile ──────────────────────────────────────────────
  async getStudentProfile(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    // Allow-list only: the raw student record also holds national ids,
    // other guardians' CNIC/income/employer, fee/scholarship detail, etc.
    const student: any = await this.studentModel.findOne({ _id: studentId, schoolSlug })
      .select('firstName lastName dateOfBirth gender currentGrade currentSection currentRollNumber admissionNumber houseGroup classTeacher photo status medical.bloodGroup guardians.name guardians.relation guardians.phone guardians.isPrimary')
      .lean();
    if (!student) throw new NotFoundException('Student not found');
    const docs = await this.reportCardModel.db.collection('student_document_records')
      .find({ schoolSlug, studentId: new Types.ObjectId(studentId), isVisibleToParent: true }).project({ label: 1 }).toArray();
    return { ...student, documents: docs.map((d: any) => ({ name: d.label })), photoUrl: student.photo || null };
  }

  async getMedical(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('medical firstName lastName').lean();
    if (!student) throw new NotFoundException('Student not found');
    return (student as any).medical || {};
  }

  async getAcademicDocuments(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('_id').lean();
    if (!student) throw new NotFoundException('Student not found');
    // The web ERP's Documents tab writes student_document_records; only the
    // ones the school marked visible to parents are returned.
    const rows: any[] = await this.reportCardModel.db.collection('student_document_records')
      .find({ schoolSlug, studentId: new Types.ObjectId(studentId), isVisibleToParent: true })
      .sort({ createdAt: -1 }).toArray();
    return Promise.all(rows.map(async (r) => {
      let fileUrl: string | null = null;
      if (r.s3Key) { try { fileUrl = await this.uploadService.getSignedUrl(r.s3Key); } catch { fileUrl = null; } }
      const expired = r.expiryDate && new Date(r.expiryDate) < new Date();
      return {
        _id: r._id, name: r.label, type: r.type, fileUrl, uploadedAt: r.createdAt,
        status: r.verified ? 'verified' : expired ? 'expired' : 'pending',
      };
    }));
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
    return this.attendanceModel.find(filter).sort({ date: -1 }).limit(400).lean();
  }

  // ── Homework ─────────────────────────────────────────────────
  async getHomework(studentId: string, requestingUser: ScopedUser, tenantId: string, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection campusId').lean();
    if (!student) throw new NotFoundException('Student not found');
    const filter: any = {
      tenantId, gradeLevel: gradeMatcher((student as any).currentGrade), status: { $ne: 'draft' },
      $and: [
        { $or: [{ sectionName: sectionMatcher((student as any).currentSection) }, { sectionName: { $exists: false } }, { sectionName: null }] },
      ],
    };
    // A student's own campusId is the source of truth for scoping this,
    // not the assignment's - without it, a multi-campus tenant where two
    // campuses happen to name a section the same way ("Grade 5 - A") leaked
    // homework across campuses to any parent whose child's section matched.
    // Assignments created by an owner/admin with no campus carry campusId null - those apply to every campus.
    if ((student as any).campusId) filter.$and.push({ $or: [{ campusId: new Types.ObjectId((student as any).campusId) }, { campusId: null }] });
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
      tenantId: new Types.ObjectId(tenantId), gradeLevel: gradeMatcher((student as any).currentGrade),
      $or: [{ sectionName: sectionMatcher((student as any).currentSection) }, { sectionName: { $exists: false } }, { sectionName: null }],
      status: 'approved', resources: { $exists: true, $ne: [] },
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
      tenantId, gradeLevel: gradeMatcher((student as any).currentGrade), publishedToStudents: true,
      $and: [
        { $or: [{ sectionName: sectionMatcher((student as any).currentSection) }, { sectionName: { $exists: false } }, { sectionName: null }] },
      ],
    };
    // Same campus-scoping rule as getHomework - a student's own campusId
    // decides this, not the syllabus's, so a matching grade/section name
    // at a different campus never leaks in.
    if ((student as any).campusId) filter.$and.push({ $or: [{ campusId: new Types.ObjectId((student as any).campusId) }, { campusId: null }] });

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

    // LMS Phase 3 - check whether this just completed the whole course,
    // and if so auto-issue a completion certificate. Only worth checking
    // on the transition that could possibly complete a course; every
    // other status change can't finish one.
    if (dto.status === 'completed') {
      const totalLessons = (syllabus.units || []).reduce(
        (sum: number, u: any) => sum + (u.topics || []).reduce((s2: number, t: any) => s2 + (t.lessons || []).length, 0), 0,
      );
      if (totalLessons > 0) {
        const completedCount = await this.lessonProgressModel.countDocuments({
          studentId: new Types.ObjectId(studentId), syllabusId: new Types.ObjectId(dto.syllabusId), status: 'completed',
        });
        if (completedCount >= totalLessons) {
          try {
            await this.certificatesService.autoIssueCourseCompletion(
              schoolSlug, studentId, syllabus.subjectName, syllabus._id, 'System (course completion)',
            );
          } catch {
            // Never let a certificate hiccup (no template configured yet,
            // a transient write error) block the student's own progress
            // from saving - this is a nice-to-have on top of real state,
            // not the other way around.
          }
        }
      }
    }
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
    return this.invoiceModel.find({ studentId: new Types.ObjectId(studentId), schoolSlug, isDeleted: { $ne: true }, status: { $in: ['sent', 'partial', 'overdue', 'paid'] } }).sort({ createdAt: -1 }).lean();
  }

  // ── Behaviour & Tarbiyah ──────────────────────────────────────
  async getBehaviourAndTarbiyah(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const sid = new Types.ObjectId(studentId);
    const db = this.reportCardModel.db;
    const [records, notes, tarbiyah, settings]: any[] = await Promise.all([
      this.behaviourModel.find({ studentId: sid, schoolSlug }).sort({ date: -1 }).limit(50).lean(),
      // Teacher notes from the web's Teaching > Behaviour tab (a separate
      // collection from behaviour_records) - only ones the teacher flagged
      // as notified to the parent.
      db.collection('behaviourNotes').find({ studentId: sid, parentNotified: true }).sort({ incidentDate: -1 }).limit(50).toArray(),
      // Only assessments the school explicitly shared with parents.
      this.tarbiyahModel.find({ studentId: sid, schoolSlug, parentShared: true })
        .select('-assessedById -schoolSlug -campusId').sort({ assessmentDate: -1 }).limit(20).lean(),
      db.collection('character_program_settings').findOne({ schoolSlug }),
    ]);

    const min = settings?.ratingScale?.min ?? 1;
    const max = settings?.ratingScale?.max ?? 5;
    const names = new Map<string, string>((settings?.characteristics || []).map((c: any) => [c.key, c.nameEn]));
    const pct = (score: number) => Math.round(Math.max(0, Math.min(100, ((score - min) / ((max - min) || 1)) * 100)));
    const assessments = tarbiyah.map((a: any) => ({
      ...a,
      ratingScale: { min, max },
      programName: settings?.moduleDisplayName || 'Tarbiyah',
      traits: (a.traits || []).map((t: any) => ({ ...t, traitName: names.get(t.traitKey) || null, percentage: pct(t.score) })),
    }));

    const noteRecords = notes.map((n: any) => ({
      _id: n._id, title: n.type === 'positive' ? 'Positive note' : n.type === 'resolved' ? 'Resolved' : n.type === 'serious' ? 'Serious concern' : 'Concern',
      description: n.note, date: n.incidentDate, actionTaken: n.actionTaken, source: 'teacher_note',
      type: n.type === 'positive' ? 'positive' : n.type === 'resolved' ? 'neutral' : 'negative',
      points: n.type === 'positive' ? 1 : n.type === 'resolved' ? 0 : -1,
    }));
    const behaviourRecords = [...records, ...noteRecords]
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { behaviourRecords, tarbiyahAssessments: assessments };
  }

  // ── Timetable ─────────────────────────────────────────────────
  async getTimetable(studentId: string, requestingUser: ScopedUser, tenantId: string, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection').lean();
    if (!student) throw new NotFoundException('Student not found');
    return this.timetableModel.findOne({
      tenantId, gradeLevel: gradeMatcher((student as any).currentGrade), sectionName: sectionMatcher((student as any).currentSection), status: 'active',
    }).lean();
  }

  // ── Datesheet (from the Assessments collection covering the student's grade) ──
  async getDatesheet(studentId: string, requestingUser: ScopedUser, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection campusId').lean();
    if (!student) throw new NotFoundException('Student not found');
    // Assessment itself lives in the assessments module's own schema -
    // read via the shared connection's collection directly rather than
    // pulling in that whole module's dependency graph for one read.
    return this.reportCardModel.db.collection('assessments').find({
      schoolSlug, grade: gradeMatcher((student as any).currentGrade), status: { $in: ['scheduled', 'ongoing'] },
      $and: [
        { $or: [{ section: sectionMatcher((student as any).currentSection) }, { section: null }, { section: '' }, { section: { $exists: false } }] },
        ...((student as any).campusId ? [{ $or: [{ campusId: (student as any).campusId }, { campusId: new Types.ObjectId(String((student as any).campusId)) }, { campusId: null }, { campusId: { $exists: false } }] }] : []),
      ],
    }).sort({ startDate: 1 }).toArray();
  }

  // ── Library ──────────────────────────────────────────────────
  async getLibrary(studentId: string, requestingUser: ScopedUser, tenantId: string) {
    assertStudentAccess(requestingUser, studentId);
    return this.bookIssueModel.find({ tenantId, borrowerType: 'student', borrowerId: new Types.ObjectId(studentId) }).sort({ issueDate: -1 }).lean();
  }

  // ── Guardian context: the grades/campuses/ids this parent's children are in ──
  private async guardianScope(requestingUser: ScopedUser, schoolSlug: string) {
    const ids = getGuardianStudentIds(requestingUser);
    const kids = ids.length
      ? await this.studentModel.find({ _id: { $in: ids }, schoolSlug }).select('currentGrade currentSection campusId').lean()
      : [];
    return {
      ids,
      grades: Array.from(new Set(kids.map((k: any) => k.currentGrade).filter(Boolean))) as string[],
      campusIds: Array.from(new Set(kids.map((k: any) => k.campusId && String(k.campusId)).filter(Boolean))) as string[],
    };
  }

  // ── Circulars ────────────────────────────────────────────────
  // Source of truth is the `circulars` collection the web ERP publishes to
  // (School Calendar module) - not the old Documents-tagged-circular path.
  // Only published circulars that target parents AND actually reach one of
  // this guardian's children are returned.
  async getCirculars(schoolSlug: string, requestingUser: ScopedUser) {
    const { ids, grades, campusIds } = await this.guardianScope(requestingUser, schoolSlug);
    const userId = String((requestingUser as any)?.userId || '');
    const rows: any[] = await this.reportCardModel.db.collection('circulars')
      .find({ schoolSlug, status: 'published', 'audience.roles': 'parent' })
      .sort({ publishedAt: -1, createdAt: -1 }).limit(100).toArray();

    const reaches = (c: any) => {
      const a = c.audience || {};
      switch (a.scope) {
        case 'campus': return !a.campusId || campusIds.includes(String(a.campusId));
        case 'grade': return (a.gradeLevels || []).some((g: string) => grades.some((mine) => sameGrade(g, mine)));
        case 'individual':
          return (a.individualStudentIds || []).some((id: string) => ids.includes(String(id)))
            || (a.userIds || []).map(String).includes(userId);
        default: return true; // 'school'
      }
    };

    const acks: any[] = userId && Types.ObjectId.isValid(userId)
      ? await this.reportCardModel.db.collection('circular_acknowledgments')
          .find({ userId: new Types.ObjectId(userId), circularId: { $in: rows.map((r) => r._id) } }).toArray()
      : [];
    const acked = new Set(acks.map((x) => String(x.circularId)));

    const circulars = rows.filter(reaches).map((c) => ({
      _id: c._id,
      title: c.title,
      body: String(c.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      category: c.category || 'other',
      priority: c.priority || 'normal',
      attachmentUrls: c.attachmentUrls || [],
      requiresAcknowledgment: !!c.requiresAcknowledgment,
      acknowledged: acked.has(String(c._id)),
      effectiveDate: c.publishedAt || c.createdAt,
      createdAt: c.createdAt,
    }));

    // Keep anything published the legacy way (Documents tagged circular) visible too.
    const legacy = await this.documentModel.find({ schoolSlug, category: 'circular', status: 'active', visibility: 'public' }).sort({ createdAt: -1 }).limit(50).lean();
    return [...circulars, ...legacy.map((d: any) => ({ ...d, body: d.description || '' }))]
      .sort((x: any, y: any) => new Date(y.effectiveDate || y.createdAt).getTime() - new Date(x.effectiveDate || x.createdAt).getTime());
  }

  async acknowledgeCircular(circularId: string, requestingUser: ScopedUser, schoolSlug: string, userName: string) {
    const userId = String((requestingUser as any)?.userId || '');
    const circular = await this.reportCardModel.db.collection('circulars').findOne({ _id: new Types.ObjectId(circularId), schoolSlug, status: 'published', 'audience.roles': 'parent' });
    if (!circular) throw new NotFoundException('Circular not found');
    await this.reportCardModel.db.collection('circular_acknowledgments').updateOne(
      { circularId: circular._id, userId: new Types.ObjectId(userId) },
      { $set: { userName, acknowledgedAt: new Date(), schoolSlug } },
      { upsert: true },
    );
    return { acknowledged: true };
  }

  // ── Events Calendar ──────────────────────────────────────────
  // Source of truth is `calendar_events` (what the web ERP's School
  // Calendar writes), plus exam windows and term dates the web calendar
  // also derives. School-wide fee-due aggregates are deliberately NOT
  // included - a parent only sees their own child's dues via /dues.
  // Output is normalised to the shape the app renders (category/venue).
  async getEvents(schoolSlug: string, query: any, requestingUser: ScopedUser) {
    const from = query.from ? new Date(query.from) : new Date(new Date().getFullYear(), 0, 1);
    const to = query.to ? new Date(query.to) : new Date(new Date().getFullYear() + 1, 0, 1);
    const { grades, campusIds } = await this.guardianScope(requestingUser, schoolSlug);
    const db = this.reportCardModel.db;

    const toCategory = (type: string) => ({
      holiday: 'holiday', public_holiday: 'holiday', half_day: 'holiday',
      exam: 'exam', event: 'academic', training: 'academic', admission_deadline: 'other',
    } as Record<string, string>)[type] || 'other';

    const manual: any[] = await db.collection('calendar_events')
      .find({ schoolSlug, startDate: { $lte: to }, endDate: { $gte: from } }).sort({ startDate: 1 }).toArray();
    const manualEvents = manual
      .filter((e) => (!e.campusId || campusIds.includes(String(e.campusId)))
        && (!(e.gradeLevels || []).length || e.gradeLevels.some((g: string) => grades.some((mine) => sameGrade(g, mine)))))
      .map((e) => ({ ...e, category: toCategory(e.type), source: 'calendar' }));

    const exams: any[] = grades.length ? await db.collection('assessments').find({
      schoolSlug, $and: [{ $or: grades.map((g) => ({ grade: gradeMatcher(g) })) }], type: { $in: ['mid_term', 'final_exam', 'unit_test'] },
      status: { $ne: 'cancelled' }, startDate: { $lte: to },
      $or: [{ endDate: { $gte: from } }, { endDate: null, startDate: { $gte: from } }],
    }).toArray() : [];
    const examEvents = exams.map((a) => ({
      _id: `exam-${a._id}`, title: a.title, type: 'exam', category: 'exam',
      description: `${String(a.type).replace(/_/g, ' ')} - Grade ${a.grade}${a.section ? ` ${a.section}` : ''}`,
      startDate: a.startDate, endDate: a.endDate || a.startDate, allDay: true, source: 'assessments',
    }));

    const years: any[] = await db.collection('academic_years')
      .find({ schoolSlug, startDate: { $lte: to }, endDate: { $gte: from } }).toArray();
    const termEvents: any[] = [];
    for (const y of years) for (const t of y.terms || []) {
      if (new Date(t.startDate) > to || new Date(t.endDate) < from) continue;
      termEvents.push({
        _id: `term-${y._id}-${t._id}`, title: `${t.name} (${y.name})`, description: 'Academic term',
        type: 'academic_term', category: 'academic', startDate: t.startDate, endDate: t.endDate, allDay: true, source: 'academics',
      });
    }

    // Legacy campus-module events, still shown if any exist for parents.
    const legacy = await this.eventModel.find({
      schoolSlug, audience: { $in: ['all', 'parents'] }, status: { $ne: 'cancelled' },
      startDate: { $gte: from, $lte: to },
    }).lean();

    return [...manualEvents, ...examEvents, ...termEvents, ...legacy]
      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }

  // ── PTM ──────────────────────────────────────────────────────
  async getPTMHistory(studentId: string, requestingUser: ScopedUser, tenantId: string) {
    assertStudentAccess(requestingUser, studentId);
    return this.ptmModel.find({ tenantId, studentId: new Types.ObjectId(studentId) }).sort({ scheduledDate: -1 }).lean();
  }

  /** Teachers who actually teach this student's class (from the active timetable) - the choices for a PTM request. */
  async getPTMTeachers(studentId: string, requestingUser: ScopedUser, tenantId: string, schoolSlug: string) {
    assertStudentAccess(requestingUser, studentId);
    const student: any = await this.studentModel.findOne({ _id: studentId, schoolSlug }).select('currentGrade currentSection').lean();
    if (!student) throw new NotFoundException('Student not found');
    const tt: any = await this.timetableModel.findOne({
      tenantId, gradeLevel: gradeMatcher(student.currentGrade), sectionName: sectionMatcher(student.currentSection), status: 'active',
    }).lean();
    const seen = new Map<string, { teacherId: string; teacherName: string; subjects: Set<string> }>();
    for (const p of tt?.periods || []) {
      const legs = p.splitGroups?.length ? p.splitGroups : [p];
      for (const l of legs) {
        if (!l.teacherId) continue;
        const key = String(l.teacherId);
        const e = seen.get(key) || { teacherId: key, teacherName: l.teacherName || '', subjects: new Set<string>() };
        if (p.subject) e.subjects.add(p.subject);
        seen.set(key, e);
      }
    }
    return Array.from(seen.values()).map((e) => ({ teacherId: e.teacherId, teacherName: e.teacherName, subjects: Array.from(e.subjects) }))
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  }

  /**
   * A parent asks for a meeting. Creates the same PTMMeeting row the web
   * ERP's PTM board lists (status 'requested', so staff can confirm /
   * reschedule it there) and notifies the teacher plus the school admins.
   */
  async requestPTM(
    studentId: string, requestingUser: ScopedUser, tenantId: string, institutionId: string, schoolSlug: string,
    parentName: string, dto: { teacherId: string; scheduledDate: string; startTime?: string; endTime?: string; reason?: string },
  ) {
    assertStudentAccess(requestingUser, studentId);
    if (!dto?.teacherId || !dto?.scheduledDate) throw new BadRequestException('Choose a teacher and a preferred date.');
    const when = new Date(dto.scheduledDate);
    if (isNaN(when.getTime())) throw new BadRequestException('Invalid date.');
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    if (when < startOfToday) throw new BadRequestException('Preferred date cannot be in the past.');

    const [student, teacher]: any[] = await Promise.all([
      this.studentModel.findOne({ _id: studentId, schoolSlug }).lean(),
      this.staffModel.findOne({ _id: dto.teacherId, tenantId }).lean(),
    ]);
    if (!student) throw new NotFoundException('Student not found');
    if (!teacher) throw new NotFoundException('Teacher not found');

    const duplicate = await this.ptmModel.findOne({
      tenantId, studentId: new Types.ObjectId(studentId), teacherId: new Types.ObjectId(dto.teacherId),
      status: { $in: ['requested', 'confirmed'] }, scheduledDate: { $gte: startOfToday },
    }).lean();
    if (duplicate) throw new BadRequestException('You already have an open meeting request with this teacher for this child.');

    const guardian = student.guardians?.find((g: any) => g.isPrimary) || student.guardians?.[0];
    const year: any = await this.reportCardModel.db.collection('academic_years').findOne({ schoolSlug, isCurrent: true });
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const meeting = await this.ptmModel.create({
      tenantId, institutionId: institutionId || student.institutionId,
      campusId: student.campusId ? (() => { try { return new Types.ObjectId(student.campusId); } catch { return null; } })() : null,
      studentId, studentName, gradeLevel: student.currentGrade, sectionName: student.currentSection,
      teacherId: dto.teacherId, teacherName: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim(),
      scheduledDate: when, startTime: dto.startTime, endTime: dto.endTime,
      guardianName: guardian?.name || parentName, guardianPhone: guardian?.phone, guardianEmail: guardian?.email,
      status: 'requested', academicYear: year?.name || `${when.getFullYear()}`,
      discussionPoints: dto.reason?.trim() ? [dto.reason.trim()] : [],
      requestedBy: `${parentName} (parent app)`,
    } as any);

    const title = 'Parent requested a meeting';
    const body = `${parentName} requested a meeting about ${studentName} on ${when.toDateString()}${dto.startTime ? ' at ' + dto.startTime : ''}.${dto.reason ? ' Reason: ' + dto.reason.trim() : ''}`;
    const recipients = new Set<string>();
    if (teacher.userId) recipients.add(String(teacher.userId));
    const admins = await this.userModel.find({
      tenantId, isActive: { $ne: false },
      primaryRole: { $in: ['admin', 'principal', 'vice_principal', 'academic_coordinator', 'institution_owner'] },
    }).select('_id').lean();
    for (const a of admins) recipients.add(String((a as any)._id));
    if (recipients.size) {
      await this.notificationModel.insertMany(Array.from(recipients).map((uid) => ({
        recipientUserId: new Types.ObjectId(uid), type: 'ptm', title, body,
        relatedEntityId: String(meeting._id), schoolSlug,
      })));
    }
    return meeting.toObject();
  }

  async cancelPTMRequest(studentId: string, meetingId: string, requestingUser: ScopedUser, tenantId: string, parentName: string) {
    assertStudentAccess(requestingUser, studentId);
    const m = await this.ptmModel.findOneAndUpdate(
      { _id: meetingId, tenantId, studentId: new Types.ObjectId(studentId), status: { $in: ['requested', 'confirmed'] } },
      { $set: { status: 'cancelled', cancelledReason: 'Cancelled by parent', cancelledBy: parentName } }, { new: true },
    );
    if (!m) throw new NotFoundException('Meeting not found or can no longer be cancelled');
    return m;
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

  // ── Consent management (school side) ─────────────────────────
  // Targets explicit students, or a whole grade (optionally one section),
  // or the entire school; guardians of every targeted student get an
  // in-app notification and see it under Consent in the parent app.
  async createConsentRequest(
    schoolSlug: string, createdBy: string,
    dto: { title: string; description: string; category?: string; dueDate?: string; studentIds?: string[]; grades?: string[]; section?: string; allStudents?: boolean },
  ) {
    if (!dto?.title?.trim() || !dto?.description?.trim()) throw new BadRequestException('Title and description are required.');
    const filter: any = { schoolSlug, status: { $nin: ['left', 'graduated', 'withdrawn', 'transferred'] } };
    if (dto.studentIds?.length) filter._id = { $in: dto.studentIds };
    else if (dto.grades?.length) {
      filter.$and = [{ $or: dto.grades.map((g) => ({ currentGrade: gradeMatcher(g) })) }];
      if (dto.section) filter.$and.push({ currentSection: sectionMatcher(dto.section) });
    } else if (!dto.allStudents) throw new BadRequestException('Choose students, grades, or the whole school.');
    const students = await this.studentModel.find(filter).select('_id').lean();
    if (!students.length) throw new BadRequestException('No students matched this selection.');
    const due = dto.dueDate ? new Date(dto.dueDate) : undefined;
    if (due && isNaN(due.getTime())) throw new BadRequestException('Invalid due date.');

    const request = await this.consentRequestModel.create({
      title: dto.title.trim(), description: dto.description.trim(), category: dto.category || 'other',
      dueDate: due, studentIds: students.map((s: any) => s._id), createdBy, schoolSlug,
    });
    await notifyGuardiansOfStudents(this.reportCardModel.db, students.map((s: any) => s._id), {
      schoolSlug, type: 'consent', title: `Consent needed: ${request.title}`,
      body: request.description.slice(0, 140), relatedEntityId: String(request._id),
    });
    return { ...request.toObject(), studentCount: students.length };
  }

  async listConsentRequests(schoolSlug: string) {
    const requests: any[] = await this.consentRequestModel.find({ schoolSlug }).sort({ createdAt: -1 }).limit(100).lean();
    const counts: any[] = await this.consentResponseModel.aggregate([
      { $match: { schoolSlug, consentRequestId: { $in: requests.map((r) => r._id) } } },
      { $group: { _id: { r: '$consentRequestId', d: '$decision' }, n: { $sum: 1 } } },
    ]);
    return requests.map((r) => {
      const granted = counts.find((c) => String(c._id.r) === String(r._id) && c._id.d === 'granted')?.n || 0;
      const declined = counts.find((c) => String(c._id.r) === String(r._id) && c._id.d === 'declined')?.n || 0;
      const total = (r.studentIds || []).length;
      return { ...r, studentIds: undefined, total, granted, declined, pending: Math.max(0, total - granted - declined) };
    });
  }

  async closeConsentRequest(schoolSlug: string, id: string) {
    const r = await this.consentRequestModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { isActive: false } }, { new: true });
    if (!r) throw new NotFoundException('Consent request not found');
    return r;
  }

  async respondToConsent(
    consentRequestId: string, studentId: string, requestingUser: ScopedUser, respondingUserId: string,
    schoolSlug: string, decision: 'granted' | 'declined', respondedByName: string, notes?: string,
  ) {
    assertStudentAccess(requestingUser, studentId);
    const request = await this.consentRequestModel.findOne({ _id: consentRequestId, schoolSlug });
    if (!request) throw new NotFoundException('Consent request not found');
    if (!(request.studentIds || []).some((id: any) => String(id) === String(studentId))) throw new NotFoundException('Consent request not found');

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

    const leave = await this.studentLeaveModel.create({
      studentId, studentName: `${(student as any).firstName || ''} ${(student as any).lastName || ''}`.trim(),
      fromDate: new Date(data.fromDate), toDate: new Date(data.toDate),
      reason: data.reason, leaveType: data.leaveType || 'other',
      requestedByUserId, requestedByName, status: 'pending',
      schoolSlug,
      campusId: (student as any).campusId ? (() => { try { return new Types.ObjectId((student as any).campusId); } catch { return null; } })() : null,
    });

    // Tell the child's class teacher (the same person who reviews it in the staff app).
    try {
      const profiles: any[] = await this.reportCardModel.db.collection('teacherProfiles')
        .find({ isClassTeacher: true }).toArray();
      const match = profiles.find((p) => sameGrade(p.classTeacherOfGradeName, (student as any).currentGrade)
        && (!p.classTeacherOfSectionName || sameSection(p.classTeacherOfSectionName, (student as any).currentSection)));
      const staff: any = match ? await this.staffModel.findById(match.staffId).select('userId').lean() : null;
      if (staff?.userId) {
        await this.notificationModel.create({
          recipientUserId: staff.userId, type: 'leave_status', title: 'New leave request',
          body: `${leave.studentName}: ${new Date(data.fromDate).toDateString()} - ${new Date(data.toDate).toDateString()}. ${data.reason || ''}`.trim(),
          relatedEntityId: String(leave._id), schoolSlug,
        });
      }
    } catch { /* never fail the request over a notification */ }
    return leave;
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
    await this.notifyStaffOfMessage(String(data.staffId), thread, guardianName, data.firstMessage, schoolSlug);
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
    if (thread.status === 'closed') throw new BadRequestException('This conversation is closed.');
    const message = await this.messageModel.create({ threadId, senderRole: 'guardian', senderName: guardianName, body, schoolSlug });
    thread.lastMessagePreview = body.slice(0, 140);
    thread.lastMessageAt = new Date();
    thread.staffHasUnread = true;
    await thread.save();
    await this.notifyStaffOfMessage(String(thread.staffId), thread, guardianName, body, schoolSlug);
    return message;
  }

  private async notifyStaffOfMessage(staffId: string, thread: any, guardianName: string, body: string, schoolSlug: string) {
    try {
      const staff: any = await this.staffModel.findById(staffId).select('userId').lean();
      if (!staff?.userId) return;
      await this.notificationModel.create({
        recipientUserId: staff.userId, type: 'message', title: `New message from ${guardianName}`,
        body: body.slice(0, 140), relatedEntityId: String(thread._id), schoolSlug,
      });
    } catch { /* best effort */ }
  }
}
