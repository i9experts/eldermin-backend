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

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel(OnboardingSession.name) private sessionModel: Model<OnboardingSessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel('OrgInstitution') private institutionModel: Model<InstitutionDocument>,
    private jwtService: JwtService,
  ) {}

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

    if (step === 1) {
      if (data.country) institutionUpdates['address.country'] = data.country;
      if (data.city) institutionUpdates['address.city'] = data.city;
      if (data.currency) institutionUpdates.currency = data.currency;
      if (data.institutionType) institutionUpdates.type = data.institutionType;
      if (data.logoUrl) institutionUpdates.logoUrl = data.logoUrl;
      if (data.academicSystem) institutionUpdates.academicSystem = data.academicSystem;
    }

    if (step === 2) {
      if (data.campusType === 'multi') institutionUpdates['settings.isMultiCampus'] = true;
    }

    if (step === 3) {
      if (data.academicYearStart) institutionUpdates.academicYearStart = data.academicYearStart;
      if (data.academicYearEnd) institutionUpdates.academicYearEnd = data.academicYearEnd;
    }

    if (step === 4) {
      if (data.userRoles) tenantUpdates.enabledRoles = data.userRoles;
    }

    if (step === 5) {
      if (data.selectedModules) tenantUpdates.activeModules = data.selectedModules;
      if (data.selectedBundle) tenantUpdates.plan = data.selectedBundle;
    }

    if (step === 6) {
      if (data.feeFrequency) institutionUpdates.feeFrequency = data.feeFrequency;
      if (data.bankAccount) institutionUpdates.bankAccount = data.bankAccount;
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
