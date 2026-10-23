import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { ECEObservation, ECEObservationDocument } from '../ece/schemas/observation.schema';
import { ECEPortfolioEntry, ECEPortfolioEntryDocument } from '../ece/schemas/portfolio-entry.schema';
import { ECESkill, ECESkillDocument } from '../ece/schemas/ontology.schema';
import { UploadService } from '../upload/upload.service';
import { assertStudentAccess, ScopedUser } from '../auth/scope.util';

/**
 * Parent-facing, READ-ONLY view of a child's Early Years record.
 *
 * What a family may see is decided here and nowhere else:
 *  - only portfolio entries with isVisibleToFamily=true and observations with isSharedWithFamily=true;
 *  - every response is built from an explicit allow-list: no care, allergy, support, medication, staff names or ids,
 *    internal notes (`context`), the family reply, source-observation links or school/tenant fields ever leave this class;
 *  - media is returned only as short-lived signed URLs, generated server-side, and only for keys that belong to this school's
 *    `ece-evidence` folder (an entry that points elsewhere loses that media item rather than leaking another file).
 * The caller must already be a parent (controller @Roles) linked to the child (assertStudentAccess); the child is looked up
 * by id AND the school of the signed-in token.
 */
export const EY_MEDIA_FOLDER = 'ece-evidence';
export const EY_SIGNED_URL_SECONDS = 900;
const DEFAULT_LIMIT = 20;

export interface ParentEyMedia { type: string; url: string | null; caption: string | null }

/** `<schoolSlug>/ece-evidence/<file>` for a stored evidence url (full S3 url or bare key), else null. */
export function evidenceKeyOf(stored: unknown, schoolSlug: string): string | null {
  if (typeof stored !== 'string' || !stored || !schoolSlug) return null;
  let key = stored.trim();
  if (/^https?:\/\//i.test(key)) {
    try { key = decodeURIComponent(new URL(key).pathname); } catch { return null; }
  }
  key = key.replace(/^\/+/, '');
  if (key.includes('..') || key.includes('\\') || key.includes('//') || key.includes('?')) return null;
  const parts = key.split('/');
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  if (parts[0] !== schoolSlug || parts[1] !== EY_MEDIA_FOLDER) return null;
  return key;
}

@Injectable()
export class ParentEarlyYearsService {
  private readonly logger = new Logger(ParentEarlyYearsService.name);

  constructor(
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(ECEObservation.name) private observationModel: Model<ECEObservationDocument>,
    @InjectModel(ECEPortfolioEntry.name) private portfolioModel: Model<ECEPortfolioEntryDocument>,
    @InjectModel(ECESkill.name) private skillModel: Model<ECESkillDocument>,
    private readonly uploadService: UploadService,
  ) {}

  // ── child + guards ───────────────────────────────────────────
  /** Ownership first (parent -> linked child only), then the child in THIS school. Never trusts a header for the school. */
  private async childOf(user: ScopedUser, studentId: string) {
    const schoolSlug = (user as any)?.schoolSlug;
    if (!schoolSlug) throw new ForbiddenException('No school context on this account.');
    if (!Types.ObjectId.isValid(studentId)) throw new BadRequestException('Invalid student id');
    assertStudentAccess(user, studentId);
    const student: any = await this.studentModel.findOne({ _id: studentId, schoolSlug })
      .select('firstName lastName currentGrade currentSection classTeacher programType currentAcademicYear').lean();
    if (!student) throw new NotFoundException('Student not found');
    return { schoolSlug: schoolSlug as string, student };
  }

  private async eyChildOf(user: ScopedUser, studentId: string) {
    const c = await this.childOf(user, studentId);
    if (c.student.programType !== 'early-years') throw new NotFoundException('Early Years is not enabled for this child');
    return c;
  }

  // ── media ────────────────────────────────────────────────────
  private async signedMedia(schoolSlug: string, evidence: any[] | undefined): Promise<ParentEyMedia[]> {
    const out: ParentEyMedia[] = [];
    for (const e of evidence || []) {
      const key = evidenceKeyOf(e?.url, schoolSlug);
      if (!key) continue; // not this school's ece-evidence file: never sign it
      let url: string | null = null;
      try { url = await this.uploadService.getSignedUrl(key, EY_SIGNED_URL_SECONDS); }
      catch (err) { this.logger.warn(`Could not sign an Early Years media key (${(err as Error)?.message})`); }
      out.push({ type: String(e.type || 'photo'), url, caption: e.caption ? String(e.caption) : null });
    }
    return out;
  }

  // ── projections (the allow-lists) ────────────────────────────
  private async portfolioItem(schoolSlug: string, e: any) {
    return {
      id: String(e._id),
      title: e.title,
      narrative: e.narrative,
      tryThisAtHome: e.tryThisAtHome || null,
      createdAt: e.createdAt,
      media: await this.signedMedia(schoolSlug, e.evidence),
    };
  }

  private async observationItem(schoolSlug: string, o: any, skillNames: Map<string, string>) {
    return {
      id: String(o._id),
      type: o.observationType,
      narrative: o.narrative,
      nextStep: o.nextStep || null,
      createdAt: o.createdAt,
      learningAreas: (o.skillMappings || [])
        .map((m: any) => ({ skill: skillNames.get(String(m.skillId)) || null, level: m.progressionLevel }))
        .filter((a: any) => a.skill),
      media: await this.signedMedia(schoolSlug, o.evidence),
    };
  }

  private paging(page?: number, limit?: number) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(50, Math.max(1, Number(limit) || DEFAULT_LIMIT));
    return { page: p, limit: l, skip: (p - 1) * l };
  }

  private yearFilter(academicYear?: string) {
    const y = typeof academicYear === 'string' ? academicYear.trim() : '';
    return y ? { academicYearLabel: y } : {};
  }

  // ── routes ───────────────────────────────────────────────────
  async getSummary(user: ScopedUser, studentId: string, academicYear?: string) {
    const { schoolSlug, student } = await this.childOf(user, studentId);
    const base = { studentId: String(student._id), firstName: student.firstName, lastName: student.lastName };
    if (student.programType !== 'early-years') return { ...base, isEarlyYears: false, programme: 'k12' };
    const sid = new Types.ObjectId(studentId);
    const [portfolioCount, observationCount, lastEntry, lastObs] = await Promise.all([
      this.portfolioModel.countDocuments({ schoolSlug, studentId: sid, isVisibleToFamily: true }),
      this.observationModel.countDocuments({ schoolSlug, studentId: sid, isSharedWithFamily: true, ...this.yearFilter(academicYear) }),
      this.portfolioModel.findOne({ schoolSlug, studentId: sid, isVisibleToFamily: true }).sort({ createdAt: -1 }).select('createdAt').lean(),
      this.observationModel.findOne({ schoolSlug, studentId: sid, isSharedWithFamily: true, ...this.yearFilter(academicYear) }).sort({ createdAt: -1 }).select('createdAt').lean(),
    ]);
    const dates = [(lastEntry as any)?.createdAt, (lastObs as any)?.createdAt].filter(Boolean).map((d: any) => new Date(d).getTime());
    return {
      ...base,
      isEarlyYears: true,
      programme: 'early-years',
      grade: student.currentGrade || null,
      section: student.currentSection || null,
      keyPerson: student.classTeacher || null,
      academicYear: student.currentAcademicYear || null,
      sharedPortfolioCount: portfolioCount,
      sharedObservationCount: observationCount,
      lastSharedAt: dates.length ? new Date(Math.max(...dates)) : null,
    };
  }

  async listPortfolio(user: ScopedUser, studentId: string, page?: number, limit?: number) {
    const { schoolSlug } = await this.eyChildOf(user, studentId);
    const sid = new Types.ObjectId(studentId);
    const { page: p, limit: l, skip } = this.paging(page, limit);
    const filter = { schoolSlug, studentId: sid, isVisibleToFamily: true };
    const [rows, total] = await Promise.all([
      this.portfolioModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(l)
        .select('title narrative tryThisAtHome evidence createdAt').lean(),
      this.portfolioModel.countDocuments(filter),
    ]);
    const items = await Promise.all(rows.map((e: any) => this.portfolioItem(schoolSlug, e)));
    return { items, page: p, limit: l, total, hasMore: skip + rows.length < total };
  }

  async getPortfolioEntry(user: ScopedUser, studentId: string, entryId: string) {
    const { schoolSlug } = await this.eyChildOf(user, studentId);
    if (!Types.ObjectId.isValid(entryId)) throw new BadRequestException('Invalid entry id');
    // An entry that is not shared, belongs to another child, or lives in another school is simply "not found".
    const entry: any = await this.portfolioModel
      .findOne({ _id: entryId, schoolSlug, studentId: new Types.ObjectId(studentId), isVisibleToFamily: true })
      .select('title narrative tryThisAtHome evidence createdAt').lean();
    if (!entry) throw new NotFoundException('Portfolio entry not found');
    return this.portfolioItem(schoolSlug, entry);
  }

  async listObservations(user: ScopedUser, studentId: string, page?: number, limit?: number, academicYear?: string) {
    const { schoolSlug } = await this.eyChildOf(user, studentId);
    const sid = new Types.ObjectId(studentId);
    const { page: p, limit: l, skip } = this.paging(page, limit);
    const filter = { schoolSlug, studentId: sid, isSharedWithFamily: true, ...this.yearFilter(academicYear) };
    const [rows, total] = await Promise.all([
      this.observationModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(l)
        .select('observationType narrative nextStep skillMappings.skillId skillMappings.progressionLevel evidence createdAt').lean(),
      this.observationModel.countDocuments(filter),
    ]);
    const skillIds = [...new Set(rows.flatMap((o: any) => (o.skillMappings || []).map((m: any) => String(m.skillId))))];
    const skills: any[] = skillIds.length
      ? await this.skillModel.find({ _id: { $in: skillIds }, schoolSlug }).select('name').lean()
      : [];
    const skillNames = new Map<string, string>(skills.map((s: any) => [String(s._id), s.name]));
    const items = await Promise.all(rows.map((o: any) => this.observationItem(schoolSlug, o, skillNames)));
    return { items, page: p, limit: l, total, hasMore: skip + rows.length < total };
  }
}
