import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as XLSX from 'xlsx';
import { Subject, SubjectDocument } from './schemas/subject.schema';
import { SubjectGroup, SubjectGroupDocument } from './schemas/subject-group.schema';
import { Curriculum, CurriculumDocument } from './schemas/curriculum.schema';
import { Syllabus, SyllabusDocument } from '../../syllabus/schemas/syllabus.schema';
import { Book, BookDocument } from './schemas/book.schema';
import { BookIssue, BookIssueDocument } from './schemas/book-issue.schema';
import { LibrarySettings, LibrarySettingsDocument } from './schemas/library-settings.schema';
import { Reservation, ReservationDocument } from './schemas/reservation.schema';
import { Timetable, TimetableDocument } from '../teaching/schemas/timetable.schema';
import { ElectiveGroup, ElectiveGroupDocument } from '../teaching/schemas/elective-group.schema';
import { Student, StudentDocument } from '../../students/schemas/student.schema';
import { Staff, StaffDocument } from '../hr/schemas/staff.schema';
import { resolveCampusScope, ScopedUser } from '../../auth/scope.util';
import { describeSubjectBlockers, buildSubjectInUseMessage } from './subject-reference.util';
import { buildSubjectCategoryInUseMessage } from './subject-category-reference.util';
import { SubjectCategory, SubjectCategoryDocument } from './schemas/subject-category.schema';
import { mergeClassAssignment } from './subject-assign.util';
import { computeLibraryFine } from './library-fine.util';

const paged = (page = 1, limit = 20) => ({ skip: (page - 1) * limit, limit });

@Injectable()
export class AcademicsService {
  private logger = new Logger('AcademicsService');

  constructor(
    @InjectModel(Subject.name)   private subjectModel:    Model<SubjectDocument>,
    @InjectModel(SubjectGroup.name) private subjectGroupModel: Model<SubjectGroupDocument>,
    @InjectModel(Curriculum.name) private curriculumModel: Model<CurriculumDocument>,
    @InjectModel(Syllabus.name)  private syllabusModel:   Model<SyllabusDocument>,
    @InjectModel(Book.name)      private bookModel:       Model<BookDocument>,
    @InjectModel(BookIssue.name) private issueModel:      Model<BookIssueDocument>,
    @InjectModel(LibrarySettings.name) private librarySettingsModel: Model<LibrarySettingsDocument>,
    @InjectModel(Reservation.name) private reservationModel: Model<ReservationDocument>,
    @InjectModel(Timetable.name) private timetableModel:  Model<TimetableDocument>,
    @InjectModel(ElectiveGroup.name) private electiveGroupModel: Model<ElectiveGroupDocument>,
    @InjectModel(SubjectCategory.name) private subjectCategoryModel: Model<SubjectCategoryDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
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

  // ─── SUBJECT CATEGORIES ───────────────────────────────────────────────────────
  // Configurable replacement for the old hardcoded SUBJECT_CATEGORIES list -
  // same {tenantId, name, code, isActive} + unique (tenantId, code) shape as
  // Designation (hr/schemas/designation.schema.ts), no campus-scoping, same
  // as that precedent.

  async getSubjectCategories(tenantId: string, query: any = {}) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive !== 'false';
    } else if (query.includeInactive !== 'true') {
      filter.isActive = true;
    }
    return this.subjectCategoryModel.find(filter).sort({ order: 1, name: 1 }).lean();
  }

  async createSubjectCategory(tenantId: string, institutionId: string, data: any) {
    try {
      return await this.subjectCategoryModel.create({
        ...data,
        tenantId: this.tid(tenantId),
        institutionId: institutionId ? this.oid(institutionId) : undefined,
      });
    } catch (e: any) { throw new BadRequestException(e.message); }
  }

  async updateSubjectCategory(tenantId: string, id: string, data: any) {
    const doc = await this.subjectCategoryModel
      .findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: data }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Subject category not found');
    return doc;
  }

  /**
   * Blocks deleting a category still in use by any Subject - Subject.category
   * stores the category's `code` as a plain string (not an ObjectId ref, same
   * convention as Timetable periods' `subject` name-reference), so the check
   * is a simple count of subjects with that code. Mirrors deleteSubject's own
   * in-use guard (subject-reference.util.ts) and Teaching's deleteTimetable
   * active-status guard: name what's blocking it rather than failing silently.
   */
  async deleteSubjectCategory(tenantId: string, id: string) {
    const tid = this.tid(tenantId);
    const category = await this.subjectCategoryModel.findOne({ _id: id, tenantId: tid }).lean();
    if (!category) throw new NotFoundException('Subject category not found');

    const subjectCount = await this.subjectModel.countDocuments({ tenantId: tid, category: category.code });
    if (subjectCount > 0) {
      throw new BadRequestException(buildSubjectCategoryInUseMessage(subjectCount));
    }

    await this.subjectCategoryModel.deleteOne({ _id: id, tenantId: tid });
    return { deleted: true };
  }

  /**
   * POST /academics/subject-categories/seed-defaults - seeds exactly the 9
   * values that used to be hardcoded in Subject.category's enum (and in the
   * frontend's SUBJECT_CATEGORIES array) as this school's starting,
   * editable/extensible category list. Idempotent upsert-by-code, same
   * pattern as KnowledgeBaseService.seedDefaults - safe to call more than
   * once (e.g. auto-triggered by the frontend on first load), running it
   * again just refreshes the seeded copies rather than duplicating them.
   */
  async seedDefaultSubjectCategories(tenantId: string, institutionId: string) {
    const defaults = [
      { name: 'Core',           code: 'core',          order: 1 },
      { name: 'Elective',       code: 'elective',      order: 2 },
      { name: 'Co-Curricular',  code: 'co_curricular', order: 3 },
      { name: 'Islamic',        code: 'islamic',       order: 4 },
      { name: 'Language',      code: 'language',       order: 5 },
      { name: 'STEM',           code: 'stem',           order: 6 },
      { name: 'Arts',           code: 'arts',           order: 7 },
      { name: 'Physical Education', code: 'pe',         order: 8 },
      { name: 'Other',          code: 'other',          order: 9 },
    ];
    const tid = this.tid(tenantId);
    const names: string[] = [];
    for (const cat of defaults) {
      const result = await this.subjectCategoryModel.findOneAndUpdate(
        { tenantId: tid, code: cat.code },
        { $set: { ...cat, tenantId: tid, institutionId: institutionId ? this.oid(institutionId) : undefined, isActive: true } },
        { upsert: true, new: true },
      );
      names.push(result!.name);
    }
    return { message: `${defaults.length} default subject categories seeded`, count: defaults.length, names };
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

  // ─── LIBRARY — SETTINGS ───────────────────────────────────────────────────────
  // Configurable circulation policy - replaces the hardcoded fine rate,
  // unlimited-checkout and unlimited-renewal behavior the first cut
  // shipped with. Same "return defaults, only persist on explicit save"
  // pattern as AttendanceComplianceService.getSettings.

  async getLibrarySettings(tenantId: string) {
    const existing = await this.librarySettingsModel.findOne({ tenantId: this.tid(tenantId) }).lean();
    if (existing) return existing;
    return {
      tenantId,
      finePerDay: 5,
      gracePeriodDays: 0,
      maxFineCap: 0,
      maxBooksStudent: 2,
      maxBooksStaff: 5,
      maxRenewals: 1,
      renewalDays: 14,
      defaultLoanDays: 14,
    };
  }

  async updateLibrarySettings(tenantId: string, data: any) {
    return this.librarySettingsModel.findOneAndUpdate(
      { tenantId: this.tid(tenantId) },
      { $set: { ...data, tenantId: this.tid(tenantId) } },
      { upsert: true, new: true },
    );
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

  async getBooks(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20 } = query;
    const { skip } = paged(Number(page), Number(limit));
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.category)  filter.category = query.category;
    if (query.status)    filter.status = query.status;
    if (query.available === 'true') filter.availableCopies = { $gt: 0 };
    if (query.search)    filter.$text = { $search: query.search };
    // Deaccessioned copies are retired stock - excluded from the default
    // catalog view same as Subjects excludes inactive ones by default,
    // unless a status filter or includeInactive explicitly asks for them.
    if (!query.status && query.includeInactive !== 'true') {
      filter.status = { $ne: 'deaccessioned' };
    }
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, query.campusId) : query.campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    const [data, total] = await Promise.all([
      this.bookModel.find(filter).sort({ title: 1 }).skip(skip).limit(Number(limit)).lean(),
      this.bookModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } };
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

  /**
   * Retires a book copy record from the catalog - the missing half of
   * `deaccessioned` being a valid Book.status all along with nothing ever
   * setting it. Refuses while any copy is still checked out, same "block
   * on in-use records with a clear reason" convention as deleteSubject.
   */
  async deaccessionBook(tenantId: string, id: string) {
    const book = await this.bookModel.findOne({ _id: id, tenantId: this.tid(tenantId) }).lean();
    if (!book) throw new NotFoundException('Book not found');
    if (book.issuedCopies > 0) {
      throw new BadRequestException(`Cannot deaccession this book - ${book.issuedCopies} copy(ies) still issued. Wait for them to be returned first.`);
    }
    return this.bookModel.findByIdAndUpdate(id, { $set: { status: 'deaccessioned' } }, { new: true }).lean();
  }

  async searchBooks(tenantId: string, searchTerm: string) {
    if (!searchTerm?.trim()) return [];
    return this.bookModel
      .find({ tenantId: this.tid(tenantId), $text: { $search: searchTerm } })
      .limit(20)
      .lean();
  }

  // ─── LIBRARY — ISSUES ─────────────────────────────────────────────────────────

  /**
   * Resolves a client-supplied {borrowerType, borrowerId} into the real
   * Student/Staff record and the denormalized fields BookIssue/Reservation
   * store, never trusting a client-typed name/admission-no/class. Student
   * is schoolSlug-keyed (no tenantId at all) and Staff is tenantId-keyed -
   * since the id already came from a school/tenant-scoped picker on the
   * frontend, this looks up by _id alone (mirrors ConsentRecord.subjectRef
   * in compliance.service.ts: `Types.ObjectId, refPath` + trust the id).
   */
  private async resolveBorrower(borrowerType: string, borrowerId: string) {
    if (borrowerType === 'student') {
      const student = await this.studentModel.findById(borrowerId).lean();
      if (!student) throw new NotFoundException('Student not found');
      return {
        borrowerName: `${student.firstName} ${student.lastName}`.trim(),
        borrowerAdmissionNo: student.studentId || student.admissionNumber || '',
        borrowerClass: `${student.currentGrade || ''}${student.currentSection ? ' - ' + student.currentSection : ''}`.trim(),
      };
    }
    if (borrowerType === 'staff') {
      const staff = await this.staffModel.findById(borrowerId).lean();
      if (!staff) throw new NotFoundException('Staff member not found');
      return {
        borrowerName: `${staff.firstName} ${staff.lastName}`.trim(),
        borrowerAdmissionNo: staff.employeeId || '',
        borrowerClass: undefined,
      };
    }
    throw new BadRequestException('borrowerType must be "student" or "staff"');
  }

  async getIssues(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20 } = query;
    const { skip } = paged(Number(page), Number(limit));
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
    const [data, total] = await Promise.all([
      this.issueModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      this.issueModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } };
  }

  async issueBook(tenantId: string, institutionId: string, data: any, userId: string, requestingUser?: ScopedUser) {
    const book = await this.bookModel.findOne({ _id: data.bookId, tenantId: this.tid(tenantId) });
    if (!book) throw new NotFoundException('Book not found');
    if (book.availableCopies < 1) throw new BadRequestException('No copies available');

    if (!data.borrowerType || !data.borrowerId) {
      throw new BadRequestException('borrowerType and borrowerId are required');
    }
    const borrower = await this.resolveBorrower(data.borrowerType, data.borrowerId);

    const settings = await this.getLibrarySettings(tenantId);
    const activeIssueCount = await this.issueModel.countDocuments({
      tenantId: this.tid(tenantId),
      borrowerId: this.oid(data.borrowerId),
      status: { $in: ['issued', 'overdue'] },
    });
    const limit = data.borrowerType === 'staff' ? settings.maxBooksStaff : settings.maxBooksStudent;
    if (activeIssueCount >= limit) {
      throw new BadRequestException(`This ${data.borrowerType} already has ${activeIssueCount} book(s) issued - the maximum allowed is ${limit}.`);
    }

    const issueDate = new Date();
    const dueDate   = new Date();
    dueDate.setDate(dueDate.getDate() + (data.loanDays || settings.defaultLoanDays));

    const issue = await this.issueModel.create({
      bookId:       this.oid(data.bookId),
      bookTitle:    book.title,
      accessionNo:  book.accessionNo,
      // Inherit the book's own campus, not the issuing staff member's -
      // the issue record belongs to wherever the physical book lives.
      campusId:     book.campusId || (requestingUser?.campusId ? this.oid(requestingUser.campusId) : null),
      borrowerType: data.borrowerType,
      borrowerId:   this.oid(data.borrowerId),
      ...borrower,
      notes:        data.notes,
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

    // If this exact borrower was holding a waiting/ready reservation on
    // this exact book, this issue satisfies it - don't make the frontend
    // orchestrate a second call to close the loop.
    const reservation = await this.reservationModel.findOne({
      tenantId: this.tid(tenantId),
      bookId: this.oid(data.bookId),
      borrowerId: this.oid(data.borrowerId),
      status: { $in: ['waiting', 'ready'] },
    });
    if (reservation) {
      await this.reservationModel.findByIdAndUpdate(reservation._id, { $set: { status: 'fulfilled' } });
      await this.bookModel.findByIdAndUpdate(data.bookId, { $inc: { reservedCopies: -1 } });
    }

    return issue;
  }

  async returnBook(tenantId: string, issueId: string, data: any, userId: string) {
    const issue = await this.issueModel.findOne({ _id: issueId, tenantId: this.tid(tenantId) }).lean();
    if (!issue) throw new NotFoundException('Issue record not found');
    if (issue.status === 'returned') throw new BadRequestException('Book already returned');

    const now = new Date();
    const settings = await this.getLibrarySettings(tenantId);
    const { overdueDays, fineAmount } = computeLibraryFine(new Date(issue.dueDate), now, settings);

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

    // The oldest waiting reservation on this book (if any) graduates to
    // "ready for pickup" - reservedCopies is left alone here, it was
    // already claimed when the reservation was created and only releases
    // on fulfil/cancel/expire.
    const nextReservation = await this.reservationModel
      .findOne({ tenantId: this.tid(tenantId), bookId: issue.bookId, status: 'waiting' })
      .sort({ reservedDate: 1 });
    if (nextReservation) {
      await this.reservationModel.findByIdAndUpdate(nextReservation._id, { $set: { status: 'ready' } });
    }

    return { message: 'Book returned successfully', overdueDays, fineAmount };
  }

  /**
   * Renews an active issue: extends dueDate by settings.renewalDays,
   * capped at settings.maxRenewals total renewals, blocked once the book
   * is overdue past the configured grace period (renew is not a way to
   * dodge an already-late return).
   */
  async renewIssue(tenantId: string, issueId: string) {
    const issue = await this.issueModel.findOne({ _id: issueId, tenantId: this.tid(tenantId) });
    if (!issue) throw new NotFoundException('Issue record not found');
    if (!['issued', 'overdue'].includes(issue.status)) {
      throw new BadRequestException(`Cannot renew a book with status "${issue.status}"`);
    }

    const settings = await this.getLibrarySettings(tenantId);
    const now = new Date();
    const { overdueDays } = computeLibraryFine(new Date(issue.dueDate), now, settings);
    if (overdueDays > 0) {
      throw new BadRequestException('Cannot renew an overdue book - return or pay the fine first');
    }
    if ((issue.renewalCount || 0) >= settings.maxRenewals) {
      throw new BadRequestException('Maximum renewals reached');
    }

    const newDueDate = new Date(issue.dueDate);
    newDueDate.setDate(newDueDate.getDate() + settings.renewalDays);

    return this.issueModel.findByIdAndUpdate(
      issueId,
      { $inc: { renewalCount: 1 }, $set: { dueDate: newDueDate, status: 'issued' } },
      { new: true },
    ).lean();
  }

  /**
   * Marks a checked-out copy lost - it permanently leaves the collection
   * (totalCopies decrements, not just availableCopies which was already
   * excluded while issued) and can carry a replacement charge distinct
   * from any overdue fine.
   */
  async markLost(tenantId: string, issueId: string, data: any) {
    const issue = await this.issueModel.findOne({ _id: issueId, tenantId: this.tid(tenantId) });
    if (!issue) throw new NotFoundException('Issue record not found');
    if (!['issued', 'overdue'].includes(issue.status)) {
      throw new BadRequestException(`Cannot mark a book with status "${issue.status}" as lost`);
    }

    const updated = await this.issueModel.findByIdAndUpdate(issueId, {
      $set: {
        status: 'lost',
        returnDate: new Date(),
        replacementCharge: data.replacementCharge || 0,
        notes: data.notes,
      },
    }, { new: true }).lean();

    const book = await this.bookModel.findByIdAndUpdate(issue.bookId, {
      $inc: { issuedCopies: -1, lostCopies: 1, totalCopies: -1 },
    }, { new: true }).lean();
    if (book) {
      await this.bookModel.findByIdAndUpdate(issue.bookId, {
        $set: { status: book.availableCopies === 0 ? 'fully_issued' : 'available' },
      });
    }

    return updated;
  }

  /**
   * Marks a returned-but-damaged copy - stays out of circulation
   * (availableCopies untouched, it was already excluded while issued) but
   * remains part of the collection count since it could theoretically be
   * repaired later. No repair/restore flow in this build - disclosed gap.
   */
  async markDamaged(tenantId: string, issueId: string, data: any) {
    const issue = await this.issueModel.findOne({ _id: issueId, tenantId: this.tid(tenantId) });
    if (!issue) throw new NotFoundException('Issue record not found');
    if (!['issued', 'overdue'].includes(issue.status)) {
      throw new BadRequestException(`Cannot mark a book with status "${issue.status}" as damaged`);
    }

    const updated = await this.issueModel.findByIdAndUpdate(issueId, {
      $set: {
        status: 'damaged',
        returnDate: new Date(),
        condition: 'damaged',
        notes: data.notes,
      },
    }, { new: true }).lean();

    await this.bookModel.findByIdAndUpdate(issue.bookId, {
      $inc: { issuedCopies: -1, damagedCopies: 1 },
    });

    return updated;
  }

  async getOverdueIssues(tenantId: string) {
    return this.issueModel
      .find({ tenantId: this.tid(tenantId), status: { $in: ['issued', 'overdue'] }, dueDate: { $lt: new Date() } })
      .sort({ dueDate: 1 })
      .lean();
  }

  /**
   * Daily sweep that actually flips status to 'overdue' - moved out of
   * getOverdueIssues (a GET endpoint used to mutate on every read, a
   * genuine data-integrity smell). No tenantId filter - runs system-wide
   * across every tenant, same pattern as FeeDefaulterService's own daily
   * cron, with the same try/catch-and-log so one failure doesn't crash
   * the whole run.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async markOverdueBooks() {
    try {
      const result = await this.issueModel.updateMany(
        { status: 'issued', dueDate: { $lt: new Date() } },
        { $set: { status: 'overdue' } },
      );
      this.logger.log(`Library overdue sweep: ${result.modifiedCount} issue(s) marked overdue.`);
      return result;
    } catch (err: any) {
      this.logger.error(`Library overdue sweep failed: ${err.message}`, err.stack);
    }
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

  // ─── LIBRARY — RESERVATIONS ───────────────────────────────────────────────────

  async getReservations(tenantId: string, query: any = {}, requestingUser?: ScopedUser) {
    const filter: any = { tenantId: this.tid(tenantId) };
    if (query.status)     filter.status = query.status;
    if (query.bookId)     filter.bookId = this.oid(query.bookId);
    if (query.borrowerId) filter.borrowerId = this.oid(query.borrowerId);
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, query.campusId) : query.campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    return this.reservationModel.find(filter).sort({ reservedDate: 1 }).lean();
  }

  async createReservation(tenantId: string, institutionId: string, data: any, requestingUser?: ScopedUser) {
    const book = await this.bookModel.findOne({ _id: data.bookId, tenantId: this.tid(tenantId) }).lean();
    if (!book) throw new NotFoundException('Book not found');
    if (!data.borrowerType || !data.borrowerId) {
      throw new BadRequestException('borrowerType and borrowerId are required');
    }
    const borrower = await this.resolveBorrower(data.borrowerType, data.borrowerId);

    const duplicate = await this.reservationModel.findOne({
      tenantId: this.tid(tenantId),
      bookId: this.oid(data.bookId),
      borrowerId: this.oid(data.borrowerId),
      status: { $in: ['waiting', 'ready'] },
    });
    if (duplicate) throw new BadRequestException('This borrower already has an active hold on this book');

    const reservation = await this.reservationModel.create({
      tenantId: this.tid(tenantId),
      institutionId: this.oid(institutionId),
      campusId: book.campusId || (requestingUser?.campusId ? this.oid(requestingUser.campusId) : null),
      bookId: this.oid(data.bookId),
      bookTitle: book.title,
      borrowerType: data.borrowerType,
      borrowerId: this.oid(data.borrowerId),
      ...borrower,
      reservedDate: new Date(),
      status: 'waiting',
      notes: data.notes,
    });

    await this.bookModel.findByIdAndUpdate(data.bookId, { $inc: { reservedCopies: 1 } });
    return reservation;
  }

  async cancelReservation(tenantId: string, id: string) {
    const reservation = await this.reservationModel.findOne({ _id: id, tenantId: this.tid(tenantId) });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (!['waiting', 'ready'].includes(reservation.status)) {
      throw new BadRequestException(`Cannot cancel a reservation with status "${reservation.status}"`);
    }

    const updated = await this.reservationModel.findByIdAndUpdate(id, { $set: { status: 'cancelled' } }, { new: true }).lean();
    await this.bookModel.findByIdAndUpdate(reservation.bookId, { $inc: { reservedCopies: -1 } });
    return updated;
  }

  // ─── LIBRARY — REPORTS ────────────────────────────────────────────────────────

  /** Overdue issues with the same fine calc as returnBook, plus best-effort
   * borrower contact info batch-fetched by distinct borrowerId (no N+1). */
  async getLibraryDefaultersReport(tenantId: string, requestingUser?: ScopedUser) {
    const tid = this.tid(tenantId);
    const settings = await this.getLibrarySettings(tenantId);
    const filter: any = { tenantId: tid, status: { $in: ['issued', 'overdue'] }, dueDate: { $lt: new Date() } };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, undefined) : undefined;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;

    const issues = await this.issueModel.find(filter).sort({ dueDate: 1 }).lean();
    const now = new Date();

    const studentIds = Array.from(new Set(issues.filter(i => i.borrowerType === 'student').map(i => String(i.borrowerId))));
    const staffIds   = Array.from(new Set(issues.filter(i => i.borrowerType === 'staff').map(i => String(i.borrowerId))));
    const [students, staff] = await Promise.all([
      studentIds.length ? this.studentModel.find({ _id: { $in: studentIds } }).select('personalPhone personalEmail').lean() : [],
      staffIds.length ? this.staffModel.find({ _id: { $in: staffIds } }).select('phone email').lean() : [],
    ]);
    const studentContactById = new Map<string, { phone: string | null; email: string | null }>(
      students.map((s: any) => [String(s._id), { phone: s.personalPhone ?? null, email: s.personalEmail ?? null }] as const),
    );
    const staffContactById = new Map<string, { phone: string | null; email: string | null }>(
      staff.map((s: any) => [String(s._id), { phone: s.phone ?? null, email: s.email ?? null }] as const),
    );

    return issues.map((issue) => {
      const { overdueDays, fineAmount } = computeLibraryFine(new Date(issue.dueDate), now, settings);
      const contact = issue.borrowerType === 'student'
        ? studentContactById.get(String(issue.borrowerId))
        : staffContactById.get(String(issue.borrowerId));
      return { ...issue, overdueDays, fineAmount, contact: contact || null };
    });
  }

  /** Top borrowed books - aggregate-counted, then batch-joined to Book
   * (no per-row lookups). */
  async getMostBorrowedReport(tenantId: string, limitParam: any) {
    const limit = Number(limitParam) || 10;
    const rows = await this.issueModel.aggregate([
      { $match: { tenantId: this.tid(tenantId) } },
      { $group: { _id: '$bookId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
    const bookIds = rows.map(r => r._id);
    const books = bookIds.length
      ? await this.bookModel.find({ _id: { $in: bookIds } }).select('title author category').lean()
      : [];
    const bookById = new Map(books.map((b: any) => [String(b._id), b]));
    return rows.map(r => ({
      bookId: r._id,
      count: r.count,
      title: bookById.get(String(r._id))?.title ?? null,
      author: bookById.get(String(r._id))?.author ?? null,
      category: bookById.get(String(r._id))?.category ?? null,
    }));
  }

  /** Circulation counts by book category - BookIssue has no category of
   * its own, so this batch-joins to Book rather than a $lookup per issue. */
  async getCirculationByCategoryReport(tenantId: string) {
    const tid = this.tid(tenantId);
    const issues = await this.issueModel.find({ tenantId: tid }).select('bookId').lean();
    const bookIds = Array.from(new Set(issues.map(i => String(i.bookId))));
    const books = bookIds.length
      ? await this.bookModel.find({ _id: { $in: bookIds } }).select('category').lean()
      : [];
    const categoryByBookId = new Map(books.map((b: any) => [String(b._id), b.category || 'other']));

    const counts = new Map<string, number>();
    for (const issue of issues) {
      const category = categoryByBookId.get(String(issue.bookId)) || 'other';
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
  }

  /** XLSX export for the three library reports above - same pattern as
   * SyllabusService.generateSloTemplateDownload (XLSX.utils.book_new /
   * aoa_to_sheet or json_to_sheet / book_append_sheet / XLSX.write with
   * {type:'buffer', bookType:'xlsx'}). */
  async exportLibraryReport(tenantId: string, type: string, requestingUser?: ScopedUser): Promise<{ buffer: Buffer; filename: string }> {
    const wb = XLSX.utils.book_new();

    if (type === 'defaulters') {
      const rows = await this.getLibraryDefaultersReport(tenantId, requestingUser);
      const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
        Book: r.bookTitle, Borrower: r.borrowerName, Type: r.borrowerType,
        'Admission/Employee No': r.borrowerAdmissionNo, 'Due Date': r.dueDate,
        'Days Overdue': r.overdueDays, 'Fine Amount': r.fineAmount,
        Phone: r.contact?.phone ?? '', Email: r.contact?.email ?? '',
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Defaulters');
      return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), filename: 'library-defaulters.xlsx' };
    }

    if (type === 'most-borrowed') {
      const rows = await this.getMostBorrowedReport(tenantId, 100);
      const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
        Title: r.title, Author: r.author, Category: r.category, 'Times Borrowed': r.count,
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Most Borrowed');
      return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), filename: 'library-most-borrowed.xlsx' };
    }

    if (type === 'circulation') {
      const rows = await this.getCirculationByCategoryReport(tenantId);
      const ws = XLSX.utils.json_to_sheet(rows.map(r => ({ Category: r.category, Issues: r.count })));
      XLSX.utils.book_append_sheet(wb, ws, 'Circulation by Category');
      return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), filename: 'library-circulation-by-category.xlsx' };
    }

    throw new BadRequestException('type must be one of: defaulters, most-borrowed, circulation');
  }
}
