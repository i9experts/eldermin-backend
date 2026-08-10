import { Injectable, NotFoundException, BadRequestException, BadGatewayException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ECEFramework, ECEFrameworkDocument } from './schemas/framework.schema';
import { ECEDomain, ECEDomainDocument, ECESkill, ECESkillDocument, ECEIndicator, ECEIndicatorDocument, ECEAgeBand, ECEAgeBandDocument } from './schemas/ontology.schema';
import { ECEObservation, ECEObservationDocument } from './schemas/observation.schema';
import { ECEDevelopmentProfile, ECEDevelopmentProfileDocument } from './schemas/development-profile.schema';
import { ECEPortfolioEntry, ECEPortfolioEntryDocument } from './schemas/portfolio-entry.schema';
import { LearningExperience, LearningExperienceDocument } from './schemas/learning-experience.schema';
import { ECEWeeklyPlan, ECEWeeklyPlanDocument } from './schemas/weekly-plan.schema';
import { ECEEnvironmentArea, ECEEnvironmentAreaDocument } from './schemas/environment-area.schema';
import { ECEFrameworkMapping, ECEFrameworkMappingDocument } from './schemas/framework-mapping.schema';
import { MontessoriMaterial, MontessoriMaterialDocument } from './schemas/montessori-material.schema';
import { MontessoriWorkRecord, MontessoriWorkRecordDocument } from './schemas/montessori-work-record.schema';
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
    @InjectModel(ECEWeeklyPlan.name) private weeklyPlanModel: Model<ECEWeeklyPlanDocument>,
    @InjectModel(ECEEnvironmentArea.name) private environmentAreaModel: Model<ECEEnvironmentAreaDocument>,
    @InjectModel(ECEFrameworkMapping.name) private frameworkMappingModel: Model<ECEFrameworkMappingDocument>,
    @InjectModel(MontessoriMaterial.name) private montessoriMaterialModel: Model<MontessoriMaterialDocument>,
    @InjectModel(MontessoriWorkRecord.name) private workRecordModel: Model<MontessoriWorkRecordDocument>,
    @InjectModel(StudentAttendance.name) private attendanceModel: Model<StudentAttendanceDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    private emailService: EmailService,
    private configService: ConfigService,
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
      await this.notifyFamily(dto.studentId, entry.title, entry.narrative, entry.tryThisAtHome);
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
      const notified = await this.notifyFamily(String(entry.studentId), entry.title, entry.narrative, entry.tryThisAtHome);
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
  private async notifyFamily(studentId: string, title: string, narrative: string, tryThisAtHome?: string): Promise<boolean> {
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
          ${tryThisAtHome ? `
            <div style="background:#EBF2FA;border-radius:8px;padding:12px;margin-top:12px;">
              <p style="margin:0;font-weight:600;color:#0C447C;">Try This at Home</p>
              <p style="margin:4px 0 0;">${tryThisAtHome}</p>
            </div>
          ` : ''}
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

  // ── Weekly Provision Plan ───────────────────────────────────
  async getWeeklyPlan(schoolSlug: string, gradeLevel: string, sectionName: string | undefined, weekStartDate: string) {
    const plan = await this.weeklyPlanModel
      .findOne({ schoolSlug, gradeLevel, sectionName: sectionName || undefined, weekStartDate: new Date(weekStartDate) })
      .populate('plannedExperiences.experienceId')
      .lean();
    return plan || { schoolSlug, gradeLevel, sectionName, weekStartDate, plannedExperiences: [] };
  }

  async upsertWeeklyPlan(schoolSlug: string, createdBy: string, dto: any) {
    const filter = {
      schoolSlug, gradeLevel: dto.gradeLevel, sectionName: dto.sectionName || undefined,
      weekStartDate: new Date(dto.weekStartDate),
    };
    const existing = await this.weeklyPlanModel.findOne(filter).lean();
    const existingExperienceIds = new Set((existing?.plannedExperiences || []).map((p: any) => String(p.experienceId)));
    const newlyAddedIds = dto.plannedExperiences
      .map((p: any) => p.experienceId)
      .filter((id: string) => !existingExperienceIds.has(id));

    if (newlyAddedIds.length > 0) {
      await this.experienceModel.updateMany({ _id: { $in: newlyAddedIds } }, { $inc: { timesUsed: 1 } });
    }

    const plan = await this.weeklyPlanModel.findOneAndUpdate(
      filter,
      { $set: { plannedExperiences: dto.plannedExperiences, createdBy } },
      { upsert: true, new: true },
    );
    return plan;
  }

  // ── Environment / Provision Areas ──────────────────────────
  // ECE educators don't only plan lessons - they plan environments.
  // Same seeded-then-customize pattern as everything else in this module.
  async getEnvironmentAreas(schoolSlug: string) {
    return this.environmentAreaModel.find({ schoolSlug, isActive: true }).lean();
  }

  async createEnvironmentArea(schoolSlug: string, dto: any) {
    return this.environmentAreaModel.create({ ...dto, schoolSlug });
  }

  async updateEnvironmentArea(schoolSlug: string, id: string, dto: any) {
    const area = await this.environmentAreaModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!area) throw new NotFoundException('Environment area not found');
    return area;
  }

  async logSafetyCheck(schoolSlug: string, id: string, checkedBy: string) {
    const area = await this.environmentAreaModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { lastSafetyCheckDate: new Date(), lastSafetyCheckBy: checkedBy } },
      { new: true },
    );
    if (!area) throw new NotFoundException('Environment area not found');
    return area;
  }

  async addEnvironmentObservation(schoolSlug: string, id: string, note: string) {
    const area = await this.environmentAreaModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $push: { teacherObservations: `${new Date().toLocaleDateString()}: ${note}` } },
      { new: true },
    );
    if (!area) throw new NotFoundException('Environment area not found');
    return area;
  }

  async seedDefaultEnvironmentAreas(schoolSlug: string) {
    const existing = await this.environmentAreaModel.countDocuments({ schoolSlug });
    if (existing > 0) return { message: 'Environment areas already exist - seed skipped', created: 0 };

    const defaults = [
      'Practical Life Area', 'Sensorial Area', 'Language Area', 'Maths Area', 'Reading Corner',
      'Construction', 'Role Play', 'Creative Area', 'Outdoor Area', 'Quiet Area',
    ];
    for (const name of defaults) {
      await this.environmentAreaModel.create({ schoolSlug, name });
    }
    return { message: `Seeded ${defaults.length} environment areas`, created: defaults.length };
  }

  // ── Framework Mapping ───────────────────────────────────────
  // The join layer that lets each framework a school runs label and
  // group the same canonical Skill differently, without ever duplicating
  // the Skill itself (PRD §6.2). Built in V1, unused until now - this
  // closes that gap.
  async getFrameworkMappings(schoolSlug: string, frameworkId: string) {
    return this.frameworkMappingModel.find({ schoolSlug, frameworkId: new Types.ObjectId(frameworkId) }).lean();
  }

  async createFrameworkMapping(schoolSlug: string, dto: any) {
    return this.frameworkMappingModel.create({ ...dto, schoolSlug });
  }

  async updateFrameworkMapping(schoolSlug: string, id: string, dto: any) {
    const mapping = await this.frameworkMappingModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: dto }, { new: true });
    if (!mapping) throw new NotFoundException('Framework mapping not found');
    return mapping;
  }

  async deleteFrameworkMapping(schoolSlug: string, id: string) {
    const mapping = await this.frameworkMappingModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!mapping) throw new NotFoundException('Framework mapping not found');
    return { message: 'Mapping removed' };
  }

  // ── Montessori Materials & Work Records ────────────────────
  async getMontessoriMaterials(schoolSlug: string, area?: string) {
    const filter: any = { schoolSlug, isActive: true };
    if (area) filter.area = area;
    return this.montessoriMaterialModel.find(filter).sort({ area: 1, name: 1 }).lean();
  }

  async createMontessoriMaterial(schoolSlug: string, dto: any) {
    return this.montessoriMaterialModel.create({ ...dto, schoolSlug });
  }

  async seedClassicMontessoriMaterials(schoolSlug: string) {
    const existing = await this.montessoriMaterialModel.countDocuments({ schoolSlug });
    if (existing > 0) return { message: 'Materials already exist - seed skipped', created: 0 };

    const classics = [
      { name: 'Pink Tower', area: 'sensorial', ageRangeLabel: '2.5-4', directAim: 'Visual discrimination of dimension', indirectAim: 'Mathematical preparation', controlOfError: 'Visual - a cube out of sequence is immediately obvious' },
      { name: 'Brown Stair', area: 'sensorial', ageRangeLabel: '3-4', directAim: 'Visual discrimination of thickness', indirectAim: 'Mathematical preparation', controlOfError: 'Visual and muscular' },
      { name: 'Knobbed Cylinders', area: 'sensorial', ageRangeLabel: '2.5-3.5', directAim: 'Visual discrimination of size, development of fine motor pincer grip', indirectAim: 'Preparation for writing', controlOfError: 'Each cylinder has exactly one correct hole' },
      { name: 'Sandpaper Letters', area: 'language', ageRangeLabel: '3.5-5', directAim: 'Muscular memory of letter shapes, sound-symbol association', indirectAim: 'Preparation for writing and reading', controlOfError: 'Texture guides the finger along the correct stroke' },
      { name: 'Number Rods', area: 'mathematics', ageRangeLabel: '3.5-5', directAim: 'Association of quantity with length, counting 1-10', indirectAim: 'Preparation for arithmetic', controlOfError: 'Visual - rods placed in sequence form a clear staircase' },
      { name: 'Golden Beads', area: 'mathematics', ageRangeLabel: '4-6', directAim: 'Understanding of the decimal system (units, tens, hundreds, thousands)', indirectAim: 'Preparation for the four operations', controlOfError: 'Physical quantity makes an incorrect exchange obvious' },
    ];
    for (const m of classics) {
      await this.montessoriMaterialModel.create({ ...m, schoolSlug });
    }
    return { message: `Seeded ${classics.length} classic materials`, created: classics.length };
  }

  async getWorkRecords(schoolSlug: string, studentId: string) {
    return this.workRecordModel.find({ schoolSlug, studentId: new Types.ObjectId(studentId) }).populate('materialId').lean();
  }

  // Upserts (one record per child+material) - logging a presentation for
  // a material a child has already started just advances/updates the
  // same record and increments practiceCount, rather than creating
  // duplicate rows every time a Directress logs the same material again.
  async upsertWorkRecord(schoolSlug: string, presentedBy: string, dto: any) {
    const existing = await this.workRecordModel.findOne({
      schoolSlug, studentId: new Types.ObjectId(dto.studentId), materialId: new Types.ObjectId(dto.materialId),
    });

    if (existing) {
      existing.status = dto.status;
      existing.practiceCount += 1;
      if (dto.note) existing.observationNotes.push(`${new Date().toLocaleDateString()}: ${dto.note}`);
      await existing.save();
      return existing;
    }

    return this.workRecordModel.create({
      schoolSlug,
      studentId: dto.studentId,
      materialId: dto.materialId,
      status: dto.status,
      presentationDate: new Date(),
      practiceCount: 1,
      observationNotes: dto.note ? [`${new Date().toLocaleDateString()}: ${dto.note}`] : [],
      presentedBy,
    });
  }

  // ── AI Observation Assistant & Quality Checker ──────────────
  // AI assists professional judgement, never replaces it - both methods
  // return suggestions the teacher must explicitly Accept/Edit/Reject;
  // neither one writes anything to the database itself. Same secure
  // server-side proxy pattern already used by AnalyticsService - the API
  // key never reaches the browser.
  private async callClaude(systemPrompt: string, userMessage: string, maxTokens: number): Promise<string> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new InternalServerErrorException('AI assistance is not configured on this server.');

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
    } catch {
      throw new BadGatewayException('Could not reach the AI assistance service.');
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new BadGatewayException(`AI request failed (${response.status}): ${errBody.slice(0, 200)}`);
    }

    const result = await response.json();
    const textBlock = (result?.content || []).find((b: any) => b.type === 'text');
    return textBlock?.text || '';
  }

  async suggestObservationMappings(schoolSlug: string, narrative: string) {
    const domains = await this.domainModel.find({ schoolSlug, isActive: true }).lean();
    const skills = await this.skillModel.find({ schoolSlug, isActive: true }).lean();
    const domainNameById = new Map(domains.map((d: any) => [String(d._id), d.name]));

    // The model is given the REAL skill list and instructed to only
    // return skillIds from it - never allowed to invent a skill that
    // doesn't exist in this school's actual ontology.
    const skillCatalog = skills.map((s: any) => ({
      skillId: String(s._id), skillName: s.name, domainName: domainNameById.get(String(s.domainId)) || 'Unknown',
    }));

    if (skillCatalog.length === 0) {
      return { suggestions: [], suggestedNextStep: null, note: 'No skills configured yet for this school - add some in Settings first.' };
    }

    const systemPrompt = `You are assisting an Early Years educator in mapping a real classroom observation to their school's developmental skill catalog.
Return ONLY a JSON object, no markdown, no preamble:
{
  "suggestions": [{ "skillId": string (MUST be one of the provided skillIds, never invented), "reasoning": string (1 sentence, why this skill fits) }],
  "suggestedNextStep": string or null (a concrete, specific activity to offer next based on what was observed)
}
Suggest at most 4 skills. Only suggest skills that are genuinely, specifically evidenced by the observation - do not pad the list. If nothing in the catalog fits well, return an empty suggestions array rather than forcing a weak match.
You are assisting professional judgement, not replacing it - the educator will review, edit, and decide, so favor precision over volume.`;

    const userMessage = `Skill catalog:\n${JSON.stringify(skillCatalog)}\n\nObservation:\n"${narrative}"`;
    const text = await this.callClaude(systemPrompt, userMessage, 600);

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      const validSkillIds = new Set(skillCatalog.map((s) => s.skillId));
      // Defensive re-validation - even though the prompt instructs the
      // model to only use real skillIds, never trust an LLM's output as
      // structurally guaranteed. Anything not in the real catalog is
      // dropped rather than surfaced.
      const suggestions = (parsed.suggestions || [])
        .filter((s: any) => validSkillIds.has(s.skillId))
        .map((s: any) => {
          const catalogEntry = skillCatalog.find((c) => c.skillId === s.skillId)!;
          return { skillId: s.skillId, skillName: catalogEntry.skillName, domainName: catalogEntry.domainName, reasoning: s.reasoning };
        });
      return { suggestions, suggestedNextStep: parsed.suggestedNextStep || null };
    } catch {
      return { suggestions: [], suggestedNextStep: null, note: 'Could not parse a suggestion this time - try rephrasing or map manually.' };
    }
  }

  async checkObservationQuality(narrative: string) {
    if (!narrative || narrative.trim().length < 3) {
      return { isVague: false, feedback: null };
    }

    const systemPrompt = `You review Early Childhood Education observation notes for specificity, the way NAEYC-aligned practice expects: authentic, concrete, evidence-based documentation rather than vague summary judgements.
Return ONLY a JSON object, no markdown, no preamble:
{
  "isVague": boolean,
  "feedback": string or null (if vague: a short, specific, constructive prompt asking what the child actually did - never harsh, never a lecture),
  "example": string or null (if vague: ONE brief example of what a more specific version might look like, invented as illustration only - not a claim about what actually happened)
}
Vague examples: "Ahmed was good today", "Fatima did well", "Great session". Specific examples: "Fatima independently counted eight beads and matched them with numeral 8", "Ahmed used a tripod grip independently while cutting along a curved line".
Be lenient - only flag genuinely vague notes, not notes that are simply brief but concrete.`;

    const text = await this.callClaude(systemPrompt, `Observation note:\n"${narrative}"`, 250);
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return { isVague: false, feedback: null };
    }
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

  // ── "My Learning Journey" year-end portfolio PDF ────────────
  // Built with pdf-lib rather than the Puppeteer/Report-Template engine -
  // deliberately self-contained rather than coupling this module to
  // actively-evolving shared infrastructure, matching the same
  // Railway-safe, no-Chrome-dependency pattern already proven for every
  // other PDF in this app before Puppeteer was fixed. Photo embedding is
  // a known, deliberate V2 gap - narrative and evidence captions render;
  // images themselves don't yet.
  private wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = trial;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  async generateLearningJourneyPdf(schoolSlug: string, studentId: string, academicYear: string): Promise<Buffer> {
    const student: any = await this.studentModel.findOne({ _id: studentId, schoolSlug }).lean();
    if (!student) throw new NotFoundException('Student not found');

    const domains = await this.domainModel.find({ schoolSlug, isActive: true }).sort({ order: 1 }).lean();
    const profile = await this.getProfile(schoolSlug, studentId, academicYear);
    const domainSummaries: any[] = (profile as any).domainSummaries || [];
    const domainMap = new Map(domains.map((d: any) => [String(d._id), d.name]));

    const entries = await this.portfolioModel
      .find({ schoolSlug, studentId: new Types.ObjectId(studentId), isVisibleToFamily: true })
      .sort({ createdAt: 1 })
      .lean();

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.05, 0.27, 0.49);
    const gray = rgb(0.45, 0.45, 0.45);
    const black = rgb(0.1, 0.1, 0.1);
    const pageW = 595, pageH = 842, margin = 50;

    // Cover page
    const cover = pdfDoc.addPage([pageW, pageH]);
    cover.drawText('My Learning Journey', { x: margin, y: pageH - 200, size: 28, font: bold, color: navy });
    cover.drawText(`${student.firstName} ${student.lastName}`, { x: margin, y: pageH - 240, size: 18, font: bold, color: black });
    cover.drawText(`${student.currentGrade || ''}${student.currentSection ? ' - ' + student.currentSection : ''}`, { x: margin, y: pageH - 265, size: 12, font, color: gray });
    cover.drawText(`Academic Year ${academicYear}`, { x: margin, y: pageH - 285, size: 12, font, color: gray });

    // Development summary page
    const summaryPage = pdfDoc.addPage([pageW, pageH]);
    summaryPage.drawText('Development Summary', { x: margin, y: pageH - margin, size: 18, font: bold, color: navy });
    let y = pageH - margin - 40;
    for (const domain of domains as any[]) {
      const summary = domainSummaries.find((s: any) => String(s.domainId) === String(domain._id));
      summaryPage.drawText(domain.name, { x: margin, y, size: 11, font: bold, color: black });
      summaryPage.drawText(
        summary ? `${summary.currentLevel} (${summary.evidenceCount} observation${summary.evidenceCount !== 1 ? 's' : ''})` : 'Not yet observed',
        { x: margin + 220, y, size: 11, font, color: summary ? navy : gray },
      );
      y -= 24;
    }

    // Portfolio entries
    if (entries.length === 0) {
      const empty = pdfDoc.addPage([pageW, pageH]);
      empty.drawText('No shared portfolio entries yet for this academic year.', { x: margin, y: pageH - margin - 40, size: 12, font, color: gray });
    }

    let page = pdfDoc.addPage([pageW, pageH]);
    page.drawText('Learning Journey', { x: margin, y: pageH - margin, size: 18, font: bold, color: navy });
    y = pageH - margin - 45;

    for (const entry of entries as any[]) {
      const blockLines = [
        { text: entry.title, font: bold, size: 13, color: black },
        { text: new Date(entry.createdAt).toLocaleDateString(), font, size: 9, color: gray },
        ...this.wrapText(entry.narrative, font, 11, pageW - margin * 2).map((l) => ({ text: l, font, size: 11, color: black })),
        ...(entry.tryThisAtHome
          ? [{ text: 'Try This at Home: ' + entry.tryThisAtHome, font, size: 10, color: navy }]
          : []),
      ];
      const blockHeight = blockLines.length * 16 + 20;

      if (y - blockHeight < margin) {
        page = pdfDoc.addPage([pageW, pageH]);
        y = pageH - margin;
      }

      for (const line of blockLines) {
        page.drawText(line.text, { x: margin, y, size: line.size, font: line.font, color: line.color });
        y -= 16;
      }
      y -= 14; // gap between entries
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  // ── Coordinator / Principal Insights ────────────────────────
  // The one dashboard nobody above a single teacher has had until now.
  // Deliberately scoped to what's genuinely computable from real data -
  // "Evidence Quality" (is a narrative actually specific vs vague) is NOT
  // included here, since judging that honestly needs the AI Quality
  // Checker from the V2.5 roadmap, not a keyword heuristic pretending to
  // be real analysis.
  async getCoordinatorInsights(schoolSlug: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);

    const children = await this.studentModel
      .find({ schoolSlug, programType: 'early-years', status: { $ne: 'inactive' } })
      .select('_id firstName lastName currentGrade currentSection')
      .lean();
    const childIds = children.map((c: any) => c._id);
    const totalChildren = children.length;

    // ── Observation coverage ──
    const observedLast7 = await this.observationModel.distinct('studentId', { schoolSlug, createdAt: { $gte: sevenDaysAgo } });
    const observedLast30 = await this.observationModel.distinct('studentId', { schoolSlug, createdAt: { $gte: thirtyDaysAgo } });
    const observedLast7Set = new Set(observedLast7.map(String));
    const neverObserved7 = children.filter((c: any) => !observedLast7Set.has(String(c._id)));

    // ── Domain coverage - are children getting balanced attention across
    // domains, or is one domain doing all the work? ──
    const domains = await this.domainModel.find({ schoolSlug, isActive: true }).sort({ order: 1 }).lean();
    const recentObservations = await this.observationModel
      .find({ schoolSlug, createdAt: { $gte: thirtyDaysAgo } })
      .select('skillMappings')
      .lean();
    const skillIds = [...new Set(recentObservations.flatMap((o: any) => o.skillMappings.map((m: any) => String(m.skillId))))];
    const skills = await this.skillModel.find({ _id: { $in: skillIds } }).lean();
    const skillToDomain = new Map(skills.map((s: any) => [String(s._id), String(s.domainId)]));
    const domainCounts = new Map<string, number>();
    for (const obs of recentObservations as any[]) {
      for (const m of obs.skillMappings) {
        const domainId = skillToDomain.get(String(m.skillId));
        if (domainId) domainCounts.set(domainId, (domainCounts.get(domainId) || 0) + 1);
      }
    }
    const domainCoverage = domains.map((d: any) => ({
      domainId: d._id, domainName: d.name, observationCount: domainCounts.get(String(d._id)) || 0,
    }));

    // ── Environment quality - which areas are stale ──
    const areas = await this.environmentAreaModel.find({ schoolSlug, isActive: true }).lean();
    const staleAreas = areas.filter((a: any) => {
      const rotationStale = !a.rotationDate || (now.getTime() - new Date(a.rotationDate).getTime()) / 86400000 > 21;
      const safetyStale = !a.lastSafetyCheckDate || (now.getTime() - new Date(a.lastSafetyCheckDate).getTime()) / 86400000 > 30;
      return rotationStale || safetyStale;
    }).map((a: any) => ({ _id: a._id, name: a.name }));

    // ── Family engagement - of what's shared, how much gets a response? ──
    const sharedCount = await this.portfolioModel.countDocuments({ schoolSlug, isVisibleToFamily: true });
    const respondedCount = await this.portfolioModel.countDocuments({ schoolSlug, isVisibleToFamily: true, familyResponse: { $ne: null } });

    // ── Educator workload - who's actively observing, who's behind ──
    const workloadAgg = await this.observationModel.aggregate([
      { $match: { schoolSlug, createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: '$observedBy', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return {
      totalChildren,
      observedLast7Days: observedLast7.length,
      observedLast30Days: observedLast30.length,
      neverObservedLast7Days: neverObserved7.map((c: any) => ({ _id: c._id, name: `${c.firstName} ${c.lastName}` })),
      domainCoverage,
      staleEnvironmentAreas: staleAreas,
      familyEngagement: {
        sharedCount,
        respondedCount,
        responseRate: sharedCount > 0 ? Math.round((respondedCount / sharedCount) * 100) : null,
      },
      educatorWorkload: workloadAgg.map((w: any) => ({ teacherName: w._id, observationsLast7Days: w.count })),
    };
  }
}
