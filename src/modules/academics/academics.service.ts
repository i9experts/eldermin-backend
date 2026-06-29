import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subject, SubjectDocument } from './schemas/subject.schema';
import { Curriculum, CurriculumDocument } from './schemas/curriculum.schema';
import { Syllabus, SyllabusDocument } from './schemas/syllabus.schema';
import { Book, BookDocument } from './schemas/book.schema';
import { BookIssue, BookIssueDocument } from './schemas/book-issue.schema';

@Injectable()
export class AcademicsService {
  constructor(
    @InjectModel(Subject.name)   private subjectModel:    Model<SubjectDocument>,
    @InjectModel(Curriculum.name) private curriculumModel: Model<CurriculumDocument>,
    @InjectModel(Syllabus.name)  private syllabusModel:   Model<SyllabusDocument>,
    @InjectModel(Book.name)      private bookModel:       Model<BookDocument>,
    @InjectModel(BookIssue.name) private issueModel:      Model<BookIssueDocument>,
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

  async getSubjects(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.gradeLevel) filter.gradeLevels = query.gradeLevel;
    if (query.category)   filter.category = query.category;
    if (query.isActive !== undefined) filter.isActive = query.isActive !== 'false';
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { code: { $regex: query.search, $options: 'i' } },
      ];
    }
    return this.subjectModel.find(filter).sort({ name: 1 }).lean();
  }

  async createSubject(tenantId: string, institutionId: string, data: any) {
    try {
      return await this.subjectModel.create({
        ...data,
        tenantId:      this.tid(tenantId),
        institutionId: this.oid(institutionId),
      });
    } catch (e: any) { throw new BadRequestException(e.message); }
  }

  async updateSubject(tenantId: string, id: string, data: any) {
    const doc = await this.subjectModel
      .findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: data }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Subject not found');
    return doc;
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

  // ─── SYLLABUS ─────────────────────────────────────────────────────────────────

  async getSyllabi(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.gradeLevel)        filter.gradeLevel = query.gradeLevel;
    if (query.subjectName)       filter.subjectName = { $regex: query.subjectName, $options: 'i' };
    if (query.status)            filter.status = query.status;
    if (query.framework)         filter.framework = query.framework;
    if (query.academicYearLabel) filter.academicYearLabel = query.academicYearLabel;
    return this.syllabusModel.find(filter).sort({ gradeLevel: 1, subjectName: 1 }).lean();
  }

  async getSyllabusById(tenantId: string, id: string) {
    const doc = await this.syllabusModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!doc) throw new NotFoundException('Syllabus not found');
    return doc;
  }

  async createSyllabus(tenantId: string, institutionId: string, data: any, userId: string) {
    try {
      const totalWeeks   = (data.units || []).reduce((s: number, u: any) => s + (u.weeks || 0), 0);
      const totalPeriods = (data.units || []).reduce((s: number, u: any) => s + (u.periods || 0), 0);
      return await this.syllabusModel.create({
        ...data,
        totalWeeks:    data.totalWeeks   || totalWeeks,
        totalPeriods:  data.totalPeriods || totalPeriods,
        subjectId:     data.subjectId ? this.oid(data.subjectId) : undefined,
        tenantId:      this.tid(tenantId),
        institutionId: this.oid(institutionId),
        createdBy:     this.oid(userId),
      });
    } catch (e: any) { throw new BadRequestException(e.message); }
  }

  async updateSyllabus(tenantId: string, id: string, data: any) {
    const update: any = { ...data };
    if (data.units) {
      update.totalWeeks   = data.units.reduce((s: number, u: any) => s + (u.weeks || 0), 0);
      update.totalPeriods = data.units.reduce((s: number, u: any) => s + (u.periods || 0), 0);
    }
    const doc = await this.syllabusModel
      .findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: update }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Syllabus not found');
    return doc;
  }

  async addUnit(tenantId: string, id: string, unit: any) {
    const doc = await this.syllabusModel
      .findOneAndUpdate(
        { _id: id, tenantId: this.tid(tenantId) },
        {
          $push: { units: unit },
          $inc:  { totalWeeks: unit.weeks || 0, totalPeriods: unit.periods || 0 },
        },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('Syllabus not found');
    return doc;
  }

  async approveSyllabus(tenantId: string, id: string, approverName: string) {
    const doc = await this.syllabusModel
      .findOneAndUpdate(
        { _id: id, tenantId: this.tid(tenantId) },
        { $set: { status: 'approved', approvedBy: approverName, approvedAt: new Date() } },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('Syllabus not found');
    return doc;
  }

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

  async getBooks(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.category)  filter.category = query.category;
    if (query.status)    filter.status = query.status;
    if (query.available === 'true') filter.availableCopies = { $gt: 0 };
    if (query.search)    filter.$text = { $search: query.search };
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

  async createBook(tenantId: string, institutionId: string, data: any) {
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

  async getIssues(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.status)       filter.status = query.status;
    if (query.borrowerType) filter.borrowerType = query.borrowerType;
    if (query.borrowerId)   filter.borrowerId = this.oid(query.borrowerId);
    if (query.overdue === 'true') {
      filter.status  = { $in: ['issued','overdue'] };
      filter.dueDate = { $lt: new Date() };
    }
    return this.issueModel.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  }

  async issueBook(tenantId: string, institutionId: string, data: any, userId: string) {
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
