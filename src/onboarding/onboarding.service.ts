import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { OnboardingSession, OnboardingSessionDocument } from './schemas/onboarding-session.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { Tenant, TenantDocument } from '../modules/organization/schemas/tenant.schema';
import { Institution, InstitutionDocument } from '../modules/organization/schemas/institution.schema';
import { RegisterDto, SaveStepDto } from './dto/onboarding.dto';
import { BankAccount, BankAccountDocument } from '../finance/schemas/finance.schema';
import { Campus, CampusDocument, Grade, GradeDocument, AcademicYear, AcademicYearDocument } from '../organization/schemas/organization.schema';
import { ModulesService } from '../modules/modules.service';
import { ReportTemplate, ReportTemplateDocument } from '../modules/report-templates/schemas/report-template.schema';
import { defaultReportTemplates } from '../modules/report-templates/default-templates';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(OnboardingSession.name) private sessionModel: Model<OnboardingSessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel('OrgInstitution') private institutionModel: Model<InstitutionDocument>,
    @InjectModel('School') private schoolModel: Model<any>,
    @InjectModel(BankAccount.name) private bankAccountModel: Model<BankAccountDocument>,
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
    @InjectModel(AcademicYear.name) private academicYearModel: Model<AcademicYearDocument>,
    @InjectModel(ReportTemplate.name) private reportTemplateModel: Model<ReportTemplateDocument>,
    private jwtService: JwtService,
    private modulesService: ModulesService,
  ) {}

  // The wizard's own module list (frontend types.ts ALL_MODULES) uses
  // display names that match neither the canonical module-registry ids
  // (activeModules array, authorization checks) nor even the *other*
  // name->id dict already used by Super Admin's lead-activation flow
  // (which has its own different display names). Sending wizard names
  // straight through would silently activate modules under keys nothing
  // else recognizes.
  private readonly WIZARD_MODULE_NAME_TO_ID: Record<string, string> = {
    'Institution Setup': 'organization',
    'Governance & Compliance': 'compliance',
    'Documents & Workflow': 'documents',
    'Staff & HR': 'hr',
    'Teaching Management': 'teaching',
    'Finance': 'finance',
    'Procurement': 'procurement',
    'Campus Operations': 'campus-ops',
    'Admissions': 'admissions',
    'Curriculum Intelligence': 'curriculum',
    'Syllabus Tracking': 'syllabus',
    'Timetable Intelligence': 'timetable',
    'Library': 'library',
    'Student 360': 'students',
    'Assessment & Results': 'assessment',
    'Behaviour & Tarbiyah': 'behaviour',
    'Analytics & Intelligence': 'analytics',
  };

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 50);
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let counter = 1;
    while (await this.tenantModel.findOne({ slug })) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (existing) throw new ConflictException('An account with this email already exists.');

    const slug = await this.uniqueSlug(this.generateSlug(dto.schoolName));
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const tenant = await this.tenantModel.create({
      slug,
      displayName: dto.schoolName,
      status: 'onboarding',
      plan: 'trial',
      activeModules: ['organization'],
      billingEmail: dto.email.toLowerCase(),
      isSetupComplete: false,
    });

    const institution = await this.institutionModel.create({
      tenantId: tenant._id,
      name: dto.schoolName,
      currency: 'PKR',
      isActive: true,
    });

    await this.schoolModel.findOneAndUpdate(
      { slug },
      { $setOnInsert: { slug, name: dto.schoolName, activeModules: ['organization'] } },
      { upsert: true, new: true },
    );

    const user = await this.userModel.create({
      tenantId: tenant._id,
      institutionId: institution._id,
      email: dto.email.toLowerCase(),
      passwordHash,
      profile: { firstName: dto.firstName, lastName: dto.lastName },
      primaryRole: 'institution_owner',
      isActive: true,
    });

    const session = await this.sessionModel.create({
      userId: user._id.toString(),
      schoolSlug: slug,
      schoolName: dto.schoolName,
      currentStep: 1,
      isComplete: false,
    });

    const token = this.jwtService.sign({
      sub: user._id.toString(),
      tenantId: tenant._id.toString(),
      institutionId: institution._id.toString(),
      role: 'institution_owner',
      name: `${dto.firstName} ${dto.lastName}`,
      schoolSlug: slug,
      activeModules: ['organization'],
    });

    return {
      token,
      schoolSlug: slug,
      schoolName: dto.schoolName,
      sessionId: session._id.toString(),
      user: {
        id: user._id.toString(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: user.email,
      },
      message: 'Account created successfully. Complete onboarding to activate your school.',
    };
  }

  async saveStep(schoolSlug: string, userId: string, dto: SaveStepDto) {
    const session = await this.sessionModel.findOne({ schoolSlug, userId });
    if (!session) throw new NotFoundException('Onboarding session not found');

    const stepKey = `step${dto.step}`;
    await this.sessionModel.updateOne(
      { schoolSlug, userId },
      {
        $set: {
          [stepKey]: dto.data,
          currentStep: Math.max(session.currentStep, dto.step + 1),
        },
      },
    );

    await this.applyStepToSchool(schoolSlug, dto.step, dto.data);

    return { success: true, step: dto.step, nextStep: dto.step + 1, message: `Step ${dto.step} saved successfully` };
  }

  private async applyStepToSchool(slug: string, step: number, data: any) {
    const tenantUpdates: any = {};
    const institutionUpdates: any = {};

    const schoolUpdates: any = {};

    if (step === 1) {
      if (data.country) institutionUpdates['address.country'] = data.country;
      if (data.city) institutionUpdates['address.city'] = data.city;
      if (data.currency) institutionUpdates.currency = data.currency;
      if (data.institutionType) institutionUpdates.type = data.institutionType;
      if (data.logoUrl) institutionUpdates.logoUrl = data.logoUrl;
      if (data.academicSystem) institutionUpdates.academicSystem = data.academicSystem;

      if (data.country) schoolUpdates['address.country'] = data.country;
      if (data.city) schoolUpdates['address.city'] = data.city;
      if (data.institutionType) schoolUpdates.type = data.institutionType;
      if (data.logoUrl) schoolUpdates.logo = data.logoUrl;
      if (data.academicSystem) schoolUpdates.academicSystem = data.academicSystem;
    }

    if (step === 2) {
      if (data.campusType === 'multi') institutionUpdates['settings.isMultiCampus'] = true;
      // Previously only set a flag and threw away the actual campus list
      // the person just filled in (name/code/address/head/phone per campus).
      const campuses = Array.isArray(data.campuses) ? data.campuses : [];
      for (const c of campuses) {
        if (!c?.name) continue;
        await this.campusModel.findOneAndUpdate(
          { schoolSlug: slug, name: c.name },
          { $setOnInsert: {
            name: c.name, code: c.code || undefined, address: c.address || undefined,
            isActive: true, schoolSlug: slug,
          } },
          { upsert: true },
        );
      }
    }

    if (step === 3) {
      if (data.yearStart) institutionUpdates.academicYearStart = data.yearStart;
      if (data.yearEnd) institutionUpdates.academicYearEnd = data.yearEnd;
      // Previously only stamped two date strings on the Institution doc -
      // never created an actual AcademicYear record, nor any of the Grade
      // records for the classes the person just listed. Without a real
      // AcademicYear, every module that scopes data by year (Finance,
      // Students, Reports) silently falls back to a stale hardcoded
      // default. Without real Grades, Fee Structure/Fee Assignment have
      // nothing to match students against.
      if (data.yearStart && data.yearEnd) {
        const name = `${new Date(data.yearStart).getFullYear()}-${String(new Date(data.yearEnd).getFullYear()).slice(-2)}`;
        const existingYear = await this.academicYearModel.findOne({ schoolSlug: slug });
        if (!existingYear) {
          await this.academicYearModel.create({
            name,
            startDate: new Date(data.yearStart),
            endDate: new Date(data.yearEnd),
            terms: Array.isArray(data.terms) && data.terms.length
              ? data.terms.map((t: string) => ({ name: t, startDate: new Date(data.yearStart), endDate: new Date(data.yearEnd) }))
              : [],
            isCurrent: true,
            schoolSlug: slug,
          });
        }
      }

      if (Array.isArray(data.grades) && data.grades.length) {
        const sectionCount = Math.max(1, Number(data.sectionsPerGrade) || 1);
        const sectionNames = Array.from({ length: sectionCount }, (_, i) => String.fromCharCode(65 + i)); // A, B, C...
        await this.gradeModel.bulkWrite(
          data.grades.map((name: string, i: number) => ({
            updateOne: {
              filter: { name, schoolSlug: slug },
              update: {
                $setOnInsert: {
                  name, displayOrder: i + 1, schoolSlug: slug, isActive: true,
                  sections: sectionNames.map((s) => ({ name: s, isActive: true })),
                },
              },
              upsert: true,
            },
          })),
        );
      }
    }

    if (step === 4) {
      if (data.userRoles) tenantUpdates.enabledRoles = data.userRoles;
    }

    if (step === 5) {
      const moduleIds = Array.isArray(data.selectedModules)
        ? data.selectedModules.map((name: string) => this.WIZARD_MODULE_NAME_TO_ID[name]).filter(Boolean)
        : [];
      if (moduleIds.length > 0) {
        tenantUpdates.activeModules = moduleIds;
        await this.modulesService.bulkActivate(slug, moduleIds);
      }
      if (data.selectedBundle) tenantUpdates.plan = data.selectedBundle;
    }

    if (step === 6) {
      if (data.feeFrequency) institutionUpdates.feeFrequency = data.feeFrequency;
      if (data.bankAccount) institutionUpdates.bankAccount = data.bankAccount;
      if (data.bankAccount && data.bankAccount.bankName && data.bankAccount.accountNumber) {
        const existingBank = await this.bankAccountModel.findOne({ schoolSlug: slug });
        if (!existingBank) {
          await this.bankAccountModel.create({
            schoolSlug: slug,
            bankName: data.bankAccount.bankName,
            accountTitle: data.bankAccount.accountTitle || data.bankAccount.bankName,
            accountNumber: data.bankAccount.accountNumber,
            branchName: data.bankAccount.branchName,
            iban: data.bankAccount.iban,
            isPrimary: true,
          });
        }
      }
    }

    if (step === 7) {
      schoolUpdates.documentRequirements = data;
    }

    if (Object.keys(tenantUpdates).length > 0) {
      await this.tenantModel.updateOne({ slug }, { $set: tenantUpdates });
    }

    if (Object.keys(institutionUpdates).length > 0) {
      const tenant = await this.tenantModel.findOne({ slug });
      if (tenant) {
        await this.institutionModel.updateOne({ tenantId: tenant._id }, { $set: institutionUpdates });
      }
    }

    if (Object.keys(schoolUpdates).length > 0) {
      await this.schoolModel.updateOne({ slug }, { $set: schoolUpdates });
    }
  }

  async complete(schoolSlug: string, userId: string) {
    const session = await this.sessionModel.findOne({ schoolSlug, userId });
    if (!session) throw new NotFoundException('Onboarding session not found');

    await this.tenantModel.updateOne(
      { slug: schoolSlug },
      { $set: { status: 'active', isSetupComplete: true } },
    );

    await this.sessionModel.updateOne(
      { schoolSlug, userId },
      { $set: { isComplete: true } },
    );

    // Every school should land on an active account with a working Fee
    // Receipt and Payment Voucher already in "Report Templates" under
    // Intelligence, not an empty list they have to build from scratch on
    // day one. Idempotent per type, so re-running onboarding (or this
    // being called twice) never creates duplicates.
    for (const template of defaultReportTemplates(schoolSlug)) {
      const existing = await this.reportTemplateModel.findOne({
        schoolSlug, type: template.type, isDefault: true,
      });
      if (!existing) await this.reportTemplateModel.create(template);
    }

    return {
      success: true,
      schoolSlug,
      dashboardUrl: '/dashboard',
      message: 'School setup complete! Redirecting to your dashboard...',
    };
  }

  async getSession(schoolSlug: string, userId: string) {
    const session = await this.sessionModel.findOne({ schoolSlug, userId }).lean();
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }
}
