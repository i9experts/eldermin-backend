import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ECEFramework, ECEFrameworkDocument } from './schemas/framework.schema';
import { ECEDomain, ECEDomainDocument, ECESkill, ECESkillDocument, ECEIndicator, ECEIndicatorDocument, ECEAgeBand, ECEAgeBandDocument } from './schemas/ontology.schema';
import { ECEObservation, ECEObservationDocument } from './schemas/observation.schema';
import { ECEDevelopmentProfile, ECEDevelopmentProfileDocument } from './schemas/development-profile.schema';
import { ECEPortfolioEntry, ECEPortfolioEntryDocument } from './schemas/portfolio-entry.schema';
import { LearningExperience, LearningExperienceDocument } from './schemas/learning-experience.schema';
import { StudentAttendance, StudentAttendanceDocument } from '../students/schemas/student-supporting.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { EmailService } from '../email/email.service';

const DEFAULT_DOMAINS: { name: string; canonicalKey: string; skills: string[] }[] = [
  { name: 'Physical Development', canonicalKey: 'physical', skills: ['Gross Motor Control', 'Fine Motor Control', 'Self-Care'] },
  { name: 'Cognitive Development', canonicalKey: 'cognitive', skills: ['Problem Solving', 'Classification & Sequencing', 'Early Mathematical Thinking'] },
  { name: 'Language & Communication', canonicalKey: 'language', skills: ['Listening & Speaking', 'Vocabulary', 'Early Literacy'] },
  { name: 'Social Development', canonicalKey: 'social', skills: ['Cooperation & Sharing', 'Turn-Taking', 'Relationships'] },
  { name: 'Emotional Development', canonicalKey: 'emotional', skills: ['Self-Regulation', 'Confidence & Independence', 'Expression of Feelings'] },
  { name: 'Creative Development', canonicalKey: 'creative', skills: ['Art & Craft', 'Music & Movement', 'Imaginative Play'] },
  { name: 'Executive Function', canonicalKey: 'executive_function', skills: ['Attention Control', 'Task Persistence', 'Impulse Control'] },
  { name: 'Practical Life / Independence', canonicalKey: 'practical_life', skills: ['Personal Care', 'Care of Environment', 'Grace & Courtesy'] },
];

@Injectable()
export class EceService {
  constructor(
    @InjectModel(ECEFramework.name) private frameworkModel: Model<ECEFrameworkDocument>,
    @InjectModel(ECEDomain.name) private domainModel: Model<ECEDomainDocument>,
    @InjectModel(ECESkill.name) private skillModel: Model<ECESkillDocument>,
    @InjectModel(ECEIndicator.name) private indicatorModel: Model<ECEIndicatorDocument>,
    @InjectModel(ECEAgeBand.name) private ageBandModel: Model<ECEAgeBandDocument>,
    @InjectModel(ECEObservation.name) private observationModel: Model<ECEObservationDocument>,
    @InjectModel(ECEDevelopmentProfile.name) private profileModel: Model<ECEDevelopmentProfileDocument>,
    @InjectModel(ECEPortfolioEntry.name) private portfolioModel: Model<ECEPortfolioEntryDocument>,
    @InjectModel(LearningExperience.name) private experienceModel: Model<LearningExperienceDocument>,
    @InjectModel(StudentAttendance.name) private attendanceModel: Model<StudentAttendanceDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    private emailService: EmailService,
  ) {}

  // ── Framework ──────────────────────────────────────────────
  async getFrameworks(schoolSlug: string) {
    return this.frameworkModel.find({ schoolSlug, isActive: true }).lean();
  }

  async createFramework(schoolSlug: string, dto: any) {
    return this.frameworkModel.create({ ...dto, schoolSlug });
  }

  async updateFramework(schoolSlug: string, id: string, dto: any) {
    const fw = await this.frameworkModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!fw) throw new NotFoundException('Framework not found');
    return fw;
  }

  // ── Domain / Skill / Indicator / AgeBand ──────────────────
  async getDomains(schoolSlug: string) {
    return this.domainModel.find({ schoolSlug, isActive: true }).sort({ order: 1 }).lean();
  }

  async createDomain(schoolSlug: string, dto: any) {
    return this.domainModel.create({ ...dto, schoolSlug });
  }

  async updateDomain(schoolSlug: string, id: string, dto: any) {
    const d = await this.domainModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!d) throw new NotFoundException('Domain not found');
    return d;
  }

  // Seeds a genuinely usable starting ontology (8 domains + a handful of
  // real skills each) so a school never hits an empty-state dead end
  // right after enabling Early Years - matching the same
  // seed-default-then-customize pattern already proven for Period
  // Templates in Timetable.
  async seedDefaultDomains(schoolSlug: string) {
    const existing = await this.domainModel.countDocuments({ schoolSlug });
    if (existing > 0) return { message: 'Domains already exist - seed skipped', created: 0 };

    let created = 0;
    for (let i = 0; i < DEFAULT_DOMAINS.length; i++) {
      const def = DEFAULT_DOMAINS[i];
      const domain = await this.domainModel.create({
        schoolSlug, name: def.name, canonicalKey: def.canonicalKey, order: i,
      });
      for (const skillName of def.skills) {
        await this.skillModel.create({
          schoolSlug,
          domainId: domain._id,
          name: skillName,
          canonicalKey: `${def.canonicalKey}.${skillName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        });
        created++;
      }
    }
    return { message: `Seeded ${DEFAULT_DOMAINS.length} domains and ${created} skills`, created };
  }

  async getSkills(schoolSlug: string, domainId?: string) {
    const filter: any = { schoolSlug, isActive: true };
    if (domainId) filter.domainId = new Types.ObjectId(domainId);
    return this.skillModel.find(filter).lean();
  }

  async createSkill(schoolSlug: string, dto: any) {
    return this.skillModel.create({ ...dto, schoolSlug });
  }

  async updateSkill(schoolSlug: string, id: string, dto: any) {
    const s = await this.skillModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!s) throw new NotFoundException('Skill not found');
    return s;
  }

  async getIndicators(schoolSlug: string, skillId?: string) {
    const filter: any = { schoolSlug, isActive: true };
    if (skillId) filter.skillId = new Types.ObjectId(skillId);
    return this.indicatorModel.find(filter).lean();
  }

  async createIndicator(schoolSlug: string, dto: any) {
    return this.indicatorModel.create({ ...dto, schoolSlug });
  }

  async getAgeBands(schoolSlug: string) {
    return this.ageBandModel.find({ schoolSlug }).sort({ order: 1 }).lean();
  }

  async createAgeBand(schoolSlug: string, dto: any) {
    return this.ageBandModel.create({ ...dto, schoolSlug });
  }

  // ── Observations ───────────────────────────────────────────
  async getObservations(schoolSlug: string, query: any) {
    const filter: any = { schoolSlug };
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (query.skillId) filter['skillMappings.skillId'] = new Types.ObjectId(query.skillId);
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lte = new Date(query.to);
    }
    return this.observationModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async createObservation(schoolSlug: string, academicYear: string, observedById: string, observedBy: string, dto: any) {
    const observation = await this.observationModel.create({
      ...dto,
      schoolSlug,
      observedById,
      observedBy,
      academicYearLabel: academicYear,
    });
    if (dto.skillMappings?.length) {
      await this.recomputeProfile(schoolSlug, dto.studentId, academicYear);
    }
    return observation;
  }

  // Quick Observe - the core 80/20 interaction: tap child, tap skill, tap
  // level, save. Everything else defaults sensibly so this can complete
  // in a handful of taps.
  async quickObserve(schoolSlug: string, academicYear: string, observedById: string, observedBy: string, dto: any) {
    const narrative = dto.narrative || `Quick observation recorded for this skill.`;
    const observation = await this.observationModel.create({
      schoolSlug,
      studentId: dto.studentId,
      observedById,
      observedBy,
      observationType: 'spontaneous',
      narrative,
      skillMappings: [{ skillId: dto.skillId, progressionLevel: dto.progressionLevel }],
      evidence: dto.voiceNoteUrl ? [{ type: 'voice_note', url: dto.voiceNoteUrl }] : [],
      academicYearLabel: academicYear,
    });
    await this.recomputeProfile(schoolSlug, dto.studentId, academicYear);
    return observation;
  }

  // Recomputes the cached Development Profile rollup from real
  // observation data - never a live aggregation on every profile view.
  // Same reasoning as Syllabus.coveragePct elsewhere in this platform.
  private async recomputeProfile(schoolSlug: string, studentId: string, academicYear: string) {
    const observations = await this.observationModel
      .find({ schoolSlug, studentId: new Types.ObjectId(studentId), academicYearLabel: academicYear })
      .sort({ createdAt: -1 })
      .lean();

    const skillIds = [...new Set(observations.flatMap((o: any) => o.skillMappings.map((m: any) => String(m.skillId))))];
    const skills = await this.skillModel.find({ _id: { $in: skillIds } }).lean();
    const skillToDomain = new Map(skills.map((s: any) => [String(s._id), String(s.domainId)]));

    const domainData = new Map<string, { level: string; count: number; lastObservedAt: Date }>();
    for (const obs of observations) {
      for (const mapping of (obs as any).skillMappings) {
        const domainId = skillToDomain.get(String(mapping.skillId));
        if (!domainId) continue;
        const existing = domainData.get(domainId);
        if (!existing) {
          domainData.set(domainId, { level: mapping.progressionLevel, count: 1, lastObservedAt: (obs as any).createdAt });
        } else {
          existing.count++;
        }
      }
    }

    const domainSummaries = Array.from(domainData.entries()).map(([domainId, data]) => ({
      domainId: new Types.ObjectId(domainId),
      currentLevel: data.level, // most recent observation's level wins, since observations are sorted desc
      evidenceCount: data.count,
      lastObservedAt: data.lastObservedAt,
    }));

    await this.profileModel.findOneAndUpdate(
      { schoolSlug, studentId: new Types.ObjectId(studentId), academicYearLabel: academicYear },
      { $set: { domainSummaries } },
      { upsert: true, new: true },
    );
  }

  async getProfile(schoolSlug: string, studentId: string, academicYear: string) {
    const profile = await this.profileModel
      .findOne({ schoolSlug, studentId: new Types.ObjectId(studentId), academicYearLabel: academicYear })
      .lean();
    // Honest empty state - a child never observed yet gets a real, empty
    // profile shape rather than a 404 or a fabricated default level.
    return profile || { schoolSlug, studentId, academicYearLabel: academicYear, domainSummaries: [], interests: [], schemas: [] };
  }

  async updateProfileTags(schoolSlug: string, studentId: string, academicYear: string, interests?: string[], schemas?: string[]) {
    const update: any = {};
    if (interests) update.interests = interests;
    if (schemas) update.schemas = schemas;
    return this.profileModel.findOneAndUpdate(
      { schoolSlug, studentId: new Types.ObjectId(studentId), academicYearLabel: academicYear },
      { $set: update },
      { upsert: true, new: true },
    );
  }

  // ── Portfolio ──────────────────────────────────────────────
  async getPortfolio(schoolSlug: string, studentId: string) {
    return this.portfolioModel.find({ schoolSlug, studentId: new Types.ObjectId(studentId) }).sort({ createdAt: -1 }).lean();
  }

  async createPortfolioEntry(schoolSlug: string, dto: any) {
    const entry = await this.portfolioModel.create({ ...dto, schoolSlug });
    if (dto.isVisibleToFamily) {
      await this.notifyFamily(dto.studentId, entry.title, entry.narrative);
    }
    return entry;
  }

  async shareEntry(schoolSlug: string, id: string, isVisibleToFamily: boolean) {
    const entry = await this.portfolioModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { isVisibleToFamily } },
      { new: true },
    );
    if (!entry) throw new NotFoundException('Portfolio entry not found');
    if (isVisibleToFamily) {
      const notified = await this.notifyFamily(String(entry.studentId), entry.title, entry.narrative);
      return { ...entry.toObject(), familyNotified: notified };
    }
    return { ...entry.toObject(), familyNotified: false };
  }

  // Real notification via the working Email channel (SES) - honestly
  // reports whether it actually sent rather than assuming success.
  // WhatsApp can be added the same way once a real WABA account is
  // connected (WhatsAppService already exists as an honest stub for
  // exactly that, see src/email/whatsapp.service.ts), but there is
  // nothing to wire in until then.
  private async notifyFamily(studentId: string, title: string, narrative: string): Promise<boolean> {
    const student: any = await this.studentModel.findById(studentId).lean();
    if (!student?.guardians?.length) return false;
    const guardian = student.guardians.find((g: any) => g.isPrimary && g.email) || student.guardians.find((g: any) => g.email);
    if (!guardian?.email) return false;

    try {
      await this.emailService.sendEmail({
        to: guardian.email,
        subject: `Today I Discovered… — ${student.firstName}`,
        html: `
          <p>Hi ${guardian.name},</p>
          <p><strong>${title}</strong></p>
          <p>${narrative}</p>
          <p style="color:#888;font-size:12px;">Shared from ${student.firstName}'s Early Years learning journey.</p>
        `,
      });
      return true;
    } catch {
      return false;
    }
  }

  async respondToEntry(schoolSlug: string, id: string, text: string, respondedBy: string) {
    const entry = await this.portfolioModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { familyResponse: { text, respondedBy, respondedAt: new Date() } } },
      { new: true },
    );
    if (!entry) throw new NotFoundException('Portfolio entry not found');
    return entry;
  }

  // ── Learning Experience Library ────────────────────────────
  // Every activity is reusable rather than re-typed from scratch each
  // time - the institutional knowledge base the PRD calls for.
  async getExperiences(schoolSlug: string, domainId?: string) {
    const filter: any = { schoolSlug, isActive: true };
    if (domainId) filter.domainIds = new Types.ObjectId(domainId);
    return this.experienceModel.find(filter).sort({ timesUsed: -1, title: 1 }).lean();
  }

  async createExperience(schoolSlug: string, createdBy: string, dto: any) {
    return this.experienceModel.create({ ...dto, schoolSlug, createdBy });
  }

  async updateExperience(schoolSlug: string, id: string, dto: any) {
    const exp = await this.experienceModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!exp) throw new NotFoundException('Learning experience not found');
    return exp;
  }

  async deleteExperience(schoolSlug: string, id: string) {
    const exp = await this.experienceModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: { isActive: false } });
    if (!exp) throw new NotFoundException('Learning experience not found');
    return { message: 'Experience archived' };
  }

  // ── Children roster (real Student records filtered to Early Years -
  // deliberately self-contained here rather than modifying the actively
  // developed Students module for one narrow filter) ──────────
  async getChildren(schoolSlug: string) {
    return this.studentModel
      .find({ schoolSlug, programType: 'early-years', status: { $ne: 'inactive' } })
      .select('firstName lastName photo dateOfBirth currentGrade currentSection studentId')
      .sort({ firstName: 1 })
      .lean();
  }

  // ── Teacher Dashboard (every count here is a real query - no
  // fabricated or hardcoded stat) ─────────────────────────────
  async getTeacherDashboard(schoolSlug: string, observedById: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const eceStudents = await this.studentModel.find({ schoolSlug, programType: 'early-years', status: { $ne: 'inactive' } }).select('_id').lean();
    const eceStudentIds = eceStudents.map((s: any) => s._id);

    const presentToday = await this.attendanceModel.countDocuments({
      schoolSlug,
      studentId: { $in: eceStudentIds },
      date: { $gte: today, $lt: tomorrow },
      status: { $in: ['present', 'late', 'half_day'] },
    });

    const observationsToday = await this.observationModel.countDocuments({
      schoolSlug, observedById, createdAt: { $gte: today, $lt: tomorrow },
    });

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentlyObservedIds = await this.observationModel.distinct('studentId', {
      schoolSlug, createdAt: { $gte: sevenDaysAgo },
    });
    const recentlyObservedSet = new Set(recentlyObservedIds.map(String));
    const notObservedRecently = eceStudentIds.filter((id: any) => !recentlyObservedSet.has(String(id))).length;

    return {
      totalChildren: eceStudentIds.length,
      presentToday,
      observationsToday,
      notObservedInLast7Days: notObservedRecently,
    };
  }
}
