import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subject, SubjectDocument } from './schemas/subject.schema';
import { SubjectGroup, SubjectGroupDocument } from './schemas/subject-group.schema';
import { Curriculum, CurriculumDocument } from './schemas/curriculum.schema';
import { Syllabus, SyllabusDocument } from '../../syllabus/schemas/syllabus.schema';
import { Book, BookDocument } from './schemas/book.schema';
import { BookIssue, BookIssueDocument } from './schemas/book-issue.schema';
import { Timetable, TimetableDocument } from '../teaching/schemas/timetable.schema';
import { ElectiveGroup, ElectiveGroupDocument } from '../teaching/schemas/elective-group.schema';
import { resolveCampusScope, ScopedUser } from '../../auth/scope.util';
import { describeSubjectBlockers, buildSubjectInUseMessage } from './subject-reference.util';
import { mergeClassAssignment } from './subject-assign.util';

@Injectable()
export class AcademicsService {
  constructor(
    @InjectModel(Subject.name)   private subjectModel:    Model<SubjectDocument>,
    @InjectModel(SubjectGroup.name) private subjectGroupModel: Model<SubjectGroupDocument>,
    @InjectModel(Curriculum.name) private curriculumModel: Model<CurriculumDocument>,
    @InjectModel(Syllabus.name)  private syllabusModel:   Model<SyllabusDocument>,
    @InjectModel(Book.name)      private bookModel:       Model<BookDocument>,
    @InjectModel(BookIssue.name) private issueModel:      Model<BookIssueDocument>,
    @InjectModel(Timetable.name) private timetableModel:  Model<TimetableDocument>,
    @InjectModel(ElectiveGroup.name) private electiveGroupModel: Model<ElectiveGroupDocument>,
  ) {}

  private tid(t: string) { return t; }
  private oid(id: string) { return new Types.ObjectId(id); }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────────

  async getDashboardStats(tenantId: string) {
    const tid = this.tid(tenantId);
    const [
      totalSubjects, totalCurricula, activeSyllabi,
      totalBooks, availableBooks, issuedBooks,
      overdueIssues, totalIssues,
    ] = await Promise.all([
      this.subjectModel.countDocuments({ tenantId: tid, isActive: true }),
      this.curriculumModel.countDocuments({ tenantId: tid, status: 'active' }),
      this.syllabusModel.countDocuments({ tenantId: tid, status: 'active' }),
      this.bookModel.countDocuments({ tenantId: tid }),
      this.bookModel.countDocuments({ tenantId: tid, status: 'available' }),
      this.issueModel.countDocuments({ tenantId: tid, status: 'issued' }),
      this.issueModel.countDocuments({ tenantId: tid, status: 'overdue' }),
      this.issueModel.countDocuments({ tenantId: tid }),
    ]);
    return {
      totalSubjects, totalCurricula, activeSyllabi,
      totalBooks, availableBooks, issuedBooks, overdueIssues, totalIssues,
    };
  }

  // ─── SUBJECTS ─────────────────────────────────────────────────────────────────

  async getSubjects(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.gradeLevel) filter.gradeLevels = query.gradeLevel;
    if (query.category)   filter.category = query.category;
    // Default to active-only, same as the dashboard count already does -
    // a deactivated subject should actually disappear from the default
    // list rather than linger looking exactly like delete silently failed.
    // Pass isActive=false explicitly, or includeInactive=true, to see them.
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive !== 'false';
    } else if (query.includeInactive !== 'true') {
      filter.isActive = true;
    }
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { code: { $regex: query.search, $options: 'i' } },
      ];
    }
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, query.campusId) : query.campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    return this.subjectModel.find(filter).sort({ name: 1 }).lean();
  }

  async createSubject(tenantId: string, institutionId: string, data: any, requestingUser?: ScopedUser) {
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, data.campusId) : data.campusId;
    try {
      return await this.subjectModel.create({
        ...data,
        tenantId:      this.tid(tenantId),
        institutionId: this.oid(institutionId),
        campusId:      effectiveCampusId ? this.oid(effectiveCampusId) : null,
      });
    } catch (e: any) { throw new BadRequestException(e.message); }
  }

  async updateSubject(tenantId: string, id: string, data: any, requestingUser?: ScopedUser) {
    const update: any = { ...data };
    if (data.campusId !== undefined) {
      const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, data.campusId) : data.campusId;
      update.campusId = effectiveCampusId ? this.oid(effectiveCampusId) : null;
    }
    const doc = await this.subjectModel
      .findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: update }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Subject not found');
    return doc;
  }

  /**
   * Hard-deletes a subject once confirmed unreferenced. Subjects are
   * catalog/config data (not financial records), so a real delete is
   * appropriate - but only after checking every collection that points at
   * one, either by its ObjectId (Curriculum, Syllabus, SubjectGroup) or,
   * for the older modules that predate Subject having stable ids, by its
   * name (Timetable periods, ElectiveGroup). Mirrors Teaching's
   * deleteTimetable convention of blocking a destructive action on
   * in-use records with a clear, specific reason.
   */
  async deleteSubject(tenantId: string, id: string) {
    const tid = this.tid(tenantId);
    const subject = await this.subjectModel.findOne({ _id: id, tenantId: tid }).lean();
    if (!subject) throw new NotFoundException('Subject not found');

    const subjectOid = this.oid(id);
    const [curricula, syllabi, timetablePeriods, electiveGroups, subjectGroups] = await Promise.all([
      this.curriculumModel.countDocuments({ tenantId: tid, subjectId: subjectOid }),
      this.syllabusModel.countDocuments({ tenantId: tid, subjectId: subjectOid }),
      this.timetableModel.countDocuments({ tenantId: tid, 'periods.subject': subject.name }),
      this.electiveGroupModel.countDocuments({ tenantId: tid, subject: subject.name }),
      this.subjectGroupModel.countDocuments({ tenantId: tid, subjectIds: subjectOid }),
    ]);

    const reasons = describeSubjectBlockers({ curricula, syllabi, timetablePeriods, electiveGroups, subjectGroups });
    if (reasons.length > 0) {
      throw new BadRequestException(buildSubjectInUseMessage(reasons));
    }

    await this.subjectModel.deleteOne({ _id: id, tenantId: tid });
    return { deleted: true };
  }

  async seedDefaultSubjects(tenantId: string, institutionId: string) {
    const existing = await this.subjectModel.countDocuments({ tenantId: this.tid(tenantId) });
    if (existing > 0) return { message: 'Subjects already exist', count: existing };

    const ALL_GRADES = ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];
    const defaults = [
      { name: 'Mathematics',       code: 'MATH', category: 'core',     gradeLevels: ALL_GRADES },
      { name: 'English Language',  code: 'ENG',  category: 'core',     gradeLevels: ALL_GRADES },
      { name: 'Urdu',              code: 'URD',  category: 'language', gradeLevels: ALL_GRADES.slice(0, 10) },
      { name: 'Islamic Studies',   code: 'ISL',  category: 'islamic',  gradeLevels: ALL_GRADES },
      { name: 'Arabic',            code: 'ARB',  category: 'islamic',  gradeLevels: ALL_GRADES.slice(0, 10) },
      { name: 'General Science',   code: 'SCI',  category: 'core',     gradeLevels: ALL_GRADES.slice(0, 8) },
      { name: 'Physics',           code: 'PHY',  category: 'stem',     gradeLevels: ALL_GRADES.slice(8) },
      { name: 'Chemistry',         code: 'CHE',  category: 'stem',     gradeLevels: ALL_GRADES.slice(8) },
      { name: 'Biology',           code: 'BIO',  category: 'stem',     gradeLevels: ALL_GRADES.slice(8) },
      { name: 'Computer Science',  code: 'CS',   category: 'stem',     gradeLevels: ALL_GRADES.slice(5) },
      { name: 'Pakistan Studies',  code: 'PAK',  category: 'core',     gradeLevels: ['Grade 8','Grade 9','Grade 10'] },
      { name: 'Social Studies',    code: 'SS',   category: 'core',     gradeLevels: ALL_GRADES.slice(0, 8) },
      { name: 'Physical Education',code: 'PE',   category: 'pe',       gradeLevels: ALL_GRADES.slice(0, 10) },
      { name: 'Art & Drawing',     code: 'ART',  category: 'arts',     gradeLevels: ALL_GRADES.slice(0, 6) },
    ];

    const docs = defaults.map(s => ({
      ...s,
      periodsPerWeek: 5,
      isActive: true,
      tenantId:      this.tid(tenantId),
      institutionId: this.oid(institutionId),
    }));
    await this.subjectModel.insertMany(docs);
    return { message: `${defaults.length} default subjects created`, count: defaults.length };
  }

  // ─── SUBJECT GROUPS ───────────────────────────────────────────────────────────

  async getSubjectGroups(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, query.campusId) : query.campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    const groups = await this.subjectGroupModel.find(filter).sort({ name: 1 }).lean();
    const allSubjectIds = Array.from(new Set(groups.flatMap(g => (g.subjectIds || []).map(String))));
    const subjects = allSubjectIds.length
      ? await this.subjectModel.find({ tenantId: this.tid(tenantId), _id: { $in: allSubjectIds } }).lean()
      : [];
    const byId = new Map(subjects.map(s => [String(s._id), s]));
    return groups.map(g => ({
      ...g,
      subjects: (g.subjectIds || []).map(id => byId.get(String(id))).filter(Boolean),
    }));
  }

  async createSubjectGroup(tenantId: string, institutionId: string, data: any, userId: string, requestingUser?: ScopedUser) {
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, data.campusId) : data.campusId;
    try {
      return await this.subjectGroupModel.create({
        ...data,
        subjectIds:    (data.subjectIds || []).map((id: string) => this.oid(id)),
        tenantId:      this.tid(tenantId),
        institutionId: this.oid(institutionId),
        campusId:      effectiveCampusId ? this.oid(effectiveCampusId) : null,
        createdBy:     userId ? this.oid(userId) : undefined,
      });
    } catch (e: any) { throw new BadRequestException(e.message); }
  }

  async updateSubjectGroup(tenantId: string, id: string, data: any, requestingUser?: ScopedUser) {
    const update: any = { ...data };
    if (data.subjectIds) update.subjectIds = data.subjectIds.map((sid: string) => this.oid(sid));
    if (data.campusId !== undefined) {
      const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, data.campusId) : data.campusId;
      update.campusId = effectiveCampusId ? this.oid(effectiveCampusId) : null;
    }
    const doc = await this.subjectGroupModel
      .findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: update }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Subject group not found');
    return doc;
  }

  async deleteSubjectGroup(tenantId: string, id: string) {
    // A subject group is just a saved bundle/shortcut, not a source of
    // truth for any other record (unlike Subject itself, which curricula
    // and syllabi genuinely point at) - so there's nothing to guard here,
    // deleting the group never orphans anything else.
    const doc = await this.subjectGroupModel.findOneAndDelete({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!doc) throw new NotFoundException('Subject group not found');
    return { deleted: true };
  }

  /**
   * Adds one class (grade, optionally a section) to every member subject
   * of this group in one action - the actual "easily assign to classes"
   * feature. Reuses updateSubject's own persistence rather than
   * duplicating the findOneAndUpdate/campus-scope logic.
   */
  async assignSubjectGroupToClass(tenantId: string, id: string, data: any, requestingUser?: ScopedUser) {
    const group = await this.subjectGroupModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!group) throw new NotFoundException('Subject group not found');
    if (!data.gradeLevel) throw new BadRequestException('gradeLevel is required');

    return this.assignSubjectsToClass(tenantId, (group.subjectIds || []).map(String), data.gradeLevel, data.sectionName, requestingUser);
  }

  /**
   * Same merge behavior as assignSubjectGroupToClass, but for an
   * explicitly-picked list of subject ids - backs the Subjects table's
   * bulk "Assign Selected to Class" action, for subjects an admin doesn't
   * want to formally group.
   */
  async assignSubjectsToClass(tenantId: string, subjectIds: string[], gradeLevel: string, sectionName: string | undefined, requestingUser?: ScopedUser) {
    if (!gradeLevel) throw new BadRequestException('gradeLevel is required');
    const tid = this.tid(tenantId);
    const subjects = await this.subjectModel.find({ tenantId: tid, _id: { $in: subjectIds } }).lean();

    const updated = await Promise.all(subjects.map(s => {
      const merged = mergeClassAssignment(
        { gradeLevels: s.gradeLevels || [], sections: s.sections || [] },
        gradeLevel,
        sectionName,
      );
      return this.updateSubject(tenantId, String(s._id), merged, requestingUser);
    }));

    return { updated: updated.length, subjects: updated };
  }

  // ─── CURRICULUM ───────────────────────────────────────────────────────────────

  async getCurricula(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.gradeLevel)        filter.gradeLevel = query.gradeLevel;
    if (query.status)            filter.status = query.status;
    if (query.framework)         filter.framework = query.framework;
    if (query.academicYearLabel) filter.academicYearLabel = query.academicYearLabel;
    if (query.subjectId)         filter.subjectId = this.oid(query.subjectId);
    return this.curriculumModel.find(filter).sort({ gradeLevel: 1, subjectName: 1 }).lean();
  }

  async getCurriculumById(tenantId: string, id: string) {
    const doc = await this.curriculumModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!doc) throw new NotFoundException('Curriculum not found');
    return doc;
  }

  async createCurriculum(tenantId: string, institutionId: string, data: any, userId: string) {
    try {
      return await this.curriculumModel.create({
        ...data,
        subjectId:     data.subjectId ? this.oid(data.subjectId) : undefined,
        tenantId:      this.tid(tenantId),
        institutionId: this.oid(institutionId),
        createdBy:     this.oid(userId),
      });
    } catch (e: any) { throw new BadRequestException(e.message); }
  }

  async updateCurriculum(tenantId: string, id: string, data: any) {
    const update: any = { ...data };
    if (data.subjectId) update.subjectId = this.oid(data.subjectId);
    const doc = await this.curriculumModel
      .findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: update }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Curriculum not found');
    return doc;
  }

  async addSLO(tenantId: string, id: string, slo: any) {
    const doc = await this.curriculumModel
      .findOneAndUpdate(
        { _id: id, tenantId: this.tid(tenantId) },
        { $push: { slos: slo } },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('Curriculum not found');
    return doc;
  }

  // Syllabus CRUD/tracking/approval has moved entirely to the new unified
  // SyllabusModule (src/syllabus/) - this used to be a parallel,
  // design-only system with no tracking, disconnected from Teaching
  // Management's separate SyllabusCoverage collection. The dashboard count
  // above still reads the same underlying (now-shared) collection.

  // ─── LIBRARY — STATS ──────────────────────────────────────────────────────────

  async getLibraryStats(tenantId: string) {
    const tid = this.tid(tenantId);
    const now = new Date();
    const [
      total, byCategory, issued, overdue,
      totalIssues, unpaidFines,
    ] = await Promise.all([
      this.bookModel.countDocuments({ tenantId: tid }),
      this.bookModel.aggregate([
        { $match: { tenantId: tid } },
        { $group: {
          _id: '$category',
          books:     { $sum: 1 },
          copies:    { $sum: '$totalCopies' },
          available: { $sum: '$availableCopies' },
        }},
        { $sort: { books: -1 } },
      ]),
      this.issueModel.countDocuments({ tenantId: tid, status: 'issued' }),
      this.issueModel.countDocuments({
        tenantId: tid, status: { $in: ['issued','overdue'] }, dueDate: { $lt: now },
      }),
      this.issueModel.countDocuments({ tenantId: tid }),
      this.issueModel.aggregate([
        { $match: { tenantId: tid, finePaid: false, fineAmount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$fineAmount' }, count: { $sum: 1 } } },
      ]).then(r => r[0] ?? { total: 0, count: 0 }),
    ]);
    return { total, byCategory, issued, overdue, totalIssues, unpaidFines };
  }

  // ─── LIBRARY — BOOKS ──────────────────────────────────────────────────────────

  async getBooks(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.category)  filter.category = query.category;
    if (query.status)    filter.status = query.status;
    if (query.available === 'true') filter.availableCopies = { $gt: 0 };
    if (query.search)    filter.$text = { $search: query.search };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, query.campusId) : query.campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    return this.bookModel.find(filter).sort({ title: 1 }).limit(100).lean();
  }

  async getBookById(tenantId: string, id: string) {
    const book = await this.bookModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!book) throw new NotFoundException('Book not found');
    const issues = await this.issueModel
      .find({ bookId: this.oid(id), tenantId: this.tid(tenantId) })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    return { ...book, issues };
  }

  async createBook(tenantId: string, institutionId: string, data: any, requestingUser?: ScopedUser) {
    const count = await this.bookModel.countDocuments({ tenantId: this.tid(tenantId) });
    const accessionNo = data.accessionNo
      || `ACC-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const totalCopies = data.totalCopies ?? 1;
    try {
      return await this.bookModel.create({
        ...data,
        accessionNo,
        totalCopies,
        availableCopies: totalCopies,
        issuedCopies:    0,
        tenantId:        this.tid(tenantId),
        institutionId:   this.oid(institutionId),
        campusId:        requestingUser?.campusId ? this.oid(requestingUser.campusId) : (data.campusId ? this.oid(data.campusId) : null),
      });
    } catch (e: any) { throw new BadRequestException(e.message); }
  }

  async updateBook(tenantId: string, id: string, data: any) {
    const doc = await this.bookModel.findOne({ _id: id, tenantId: this.tid(tenantId) });
    if (!doc) throw new NotFoundException('Book not found');
    if (data.totalCopies !== undefined) {
      const diff = data.totalCopies - doc.totalCopies;
      data.availableCopies = Math.max(0, doc.availableCopies + diff);
    }
    return this.bookModel.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
  }

  async searchBooks(tenantId: string, searchTerm: string) {
    if (!searchTerm?.trim()) return [];
    return this.bookModel
      .find({ tenantId: this.tid(tenantId), $text: { $search: searchTerm } })
      .limit(20)
      .lean();
  }

  // ─── LIBRARY — ISSUES ─────────────────────────────────────────────────────────

  async getIssues(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.status)       filter.status = query.status;
    if (query.borrowerType) filter.borrowerType = query.borrowerType;
    if (query.borrowerId)   filter.borrowerId = this.oid(query.borrowerId);
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, query.campusId) : query.campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    if (query.overdue === 'true') {
      filter.status  = { $in: ['issued','overdue'] };
      filter.dueDate = { $lt: new Date() };
    }
    return this.issueModel.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  }

  async issueBook(tenantId: string, institutionId: string, data: any, userId: string, requestingUser?: ScopedUser) {
    const book = await this.bookModel.findOne({ _id: data.bookId, tenantId: this.tid(tenantId) });
    if (!book) throw new NotFoundException('Book not found');
    if (book.availableCopies < 1) throw new BadRequestException('No copies available');

    const issueDate = new Date();
    const dueDate   = new Date();
    dueDate.setDate(dueDate.getDate() + (data.loanDays || 14));

    const issue = await this.issueModel.create({
      ...data,
      bookId:       this.oid(data.bookId),
      bookTitle:    book.title,
      accessionNo:  book.accessionNo,
      // Inherit the book's own campus, not the issuing staff member's -
      // the issue record belongs to wherever the physical book lives.
      campusId:     book.campusId || (requestingUser?.campusId ? this.oid(requestingUser.campusId) : null),
      issueDate,
      dueDate,
      status:       'issued',
      tenantId:     this.tid(tenantId),
      institutionId: this.oid(institutionId),
      issuedBy:     this.oid(userId),
    });

    const newAvailable = book.availableCopies - 1;
    await this.bookModel.findByIdAndUpdate(data.bookId, {
      $inc: { availableCopies: -1, issuedCopies: 1, totalIssues: 1 },
      $set: { status: newAvailable === 0 ? 'fully_issued' : 'available' },
    });

    return issue;
  }

  async returnBook(tenantId: string, issueId: string, data: any, userId: string) {
    const issue = await this.issueModel.findOne({ _id: issueId, tenantId: this.tid(tenantId) }).lean();
    if (!issue) throw new NotFoundException('Issue record not found');
    if (issue.status === 'returned') throw new BadRequestException('Book already returned');

    const now         = new Date();
    const overdueDays = now > new Date(issue.dueDate)
      ? Math.ceil((now.getTime() - new Date(issue.dueDate).getTime()) / 86_400_000)
      : 0;
    const fineAmount  = overdueDays * (data.finePerDay ?? 5);

    await this.issueModel.findByIdAndUpdate(issueId, {
      $set: {
        status:     'returned',
        returnDate: now,
        fineAmount,
        returnedTo: this.oid(userId),
        condition:  data.condition || 'good',
        notes:      data.notes,
      },
    });

    await this.bookModel.findByIdAndUpdate(issue.bookId, {
      $inc: { availableCopies: 1, issuedCopies: -1 },
      $set: { status: 'available' },
    });

    return { message: 'Book returned successfully', overdueDays, fineAmount };
  }

  async getOverdueIssues(tenantId: string) {
    const now = new Date();
    const issues = await this.issueModel
      .find({ tenantId: this.tid(tenantId), status: 'issued', dueDate: { $lt: now } })
      .sort({ dueDate: 1 })
      .lean();
    if (issues.length > 0) {
      await this.issueModel.updateMany(
        { tenantId: this.tid(tenantId), status: 'issued', dueDate: { $lt: now } },
        { $set: { status: 'overdue' } },
      );
    }
    return issues;
  }

  async markFinePaid(tenantId: string, issueId: string) {
    const doc = await this.issueModel
      .findOneAndUpdate(
        { _id: issueId, tenantId: this.tid(tenantId) },
        { $set: { finePaid: true } },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('Issue record not found');
    return doc;
  }
}
