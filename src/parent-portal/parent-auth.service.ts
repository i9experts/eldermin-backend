import { schoolSuspendedException } from '../common/constants/school-suspended';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PhoneOtp, PhoneOtpDocument } from './schemas/phone-otp.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Tenant, TenantDocument } from '../modules/organization/schemas/tenant.schema';
import { InstitutionDocument } from '../modules/organization/schemas/institution.schema';
import { ParentLead, ParentLeadDocument } from '../leads/schemas/parent-lead.schema';
import { WhatsAppService } from '../email/whatsapp.service';
import { normalizePhone, phoneMatchRegex } from '../common/utils/phone.util';
import { GeocodingService } from '../leads/geocoding.service';
import { RegisterParentLeadDto, LoginParentLeadDto } from './dto/parent-lead-auth.dto';
import { UsageLog, UsageLogDocument } from '../super-admin/schemas/super-admin.schema';
import { recordLoginUsage } from '../common/utils/usage-log.util';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 45;

// Play Store closed-testing reviewer account: fixed OTP so reviewers can log
// in without receiving a real WhatsApp message. Remove once review is done.
const REVIEWER_TEST_PHONE = '+923172573105';
const REVIEWER_TEST_OTP = '123456';

const NO_STUDENT_RECORD_MESSAGE = "No student record found with this WhatsApp number. Please contact your school to have it registered against your child's profile first.";

@Injectable()
export class ParentAuthService {
  private logger = new Logger('ParentAuthService');

  constructor(
    @InjectModel(PhoneOtp.name) private otpModel: Model<PhoneOtpDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel('OrgInstitution') private institutionModel: Model<InstitutionDocument>,
    @InjectModel(ParentLead.name) private parentLeadModel: Model<ParentLeadDocument>,
    @InjectModel(UsageLog.name) private usageLogModel: Model<UsageLogDocument>,
    private jwtService: JwtService,
    private whatsAppService: WhatsAppService,
    private geocodingService: GeocodingService,
  ) {}

  private async resolveSchoolForPhone(phone: string): Promise<{ schoolSlug: string; existingUser: UserDocument | null }> {
    const existingUser = await this.userModel.findOne({ phone });
    // A deactivated account answers exactly like an unknown number (never reveals status).
    if (existingUser && existingUser.isActive === false) throw new NotFoundException(NO_STUDENT_RECORD_MESSAGE);
    if (existingUser) {
      const tenant = await this.tenantModel.findById(existingUser.tenantId).lean();
      return { schoolSlug: (tenant as any)?.slug, existingUser };
    }

    // Guardian phones can be saved to the dashboard in any of the common
    // local formats, and a record created before every write path
    // normalized on save can still have punctuation (dashes/spaces) baked
    // into the stored string itself (see phone.util.ts) - match on the
    // digits alone so a guardian added before write-side normalization
    // existed can still log in without needing a data fix.
    const student = await this.studentModel
      .findOne({ 'guardians.phone': phoneMatchRegex(phone) })
      .select('schoolSlug')
      .lean();
    if (!student) {
      throw new NotFoundException(NO_STUDENT_RECORD_MESSAGE);
    }
    return { schoolSlug: (student as any).schoolSlug, existingUser: null };
  }

  /** Suspended school: no OTP is sent and no session is issued (message intentionally reveals school status only). */
  private async assertSchoolNotSuspended(schoolSlug?: string) {
    if (!schoolSlug) return;
    const tenant: any = await this.tenantModel.findOne({ slug: schoolSlug }).select('status').lean();
    if (tenant?.status === 'suspended') throw schoolSuspendedException();
  }

  async requestOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    const { schoolSlug } = await this.resolveSchoolForPhone(phone);
    await this.assertSchoolNotSuspended(schoolSlug);

    const recent = await this.otpModel.findOne({ phone }).sort({ createdAt: -1 }).lean();
    if (recent && Date.now() - new Date((recent as any).createdAt).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      const waitSeconds = RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - new Date((recent as any).createdAt).getTime()) / 1000);
      throw new BadRequestException(`Please wait ${waitSeconds} more second(s) before requesting another code.`);
    }

    const isReviewerTestPhone = phone === REVIEWER_TEST_PHONE;
    const code = isReviewerTestPhone ? REVIEWER_TEST_OTP : String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const result = isReviewerTestPhone
      ? { sent: true, reason: undefined }
      : await this.whatsAppService.sendTemplateMessage(phone, 'parent_login_otp', { code }, { isAuthTemplate: true });

    await this.otpModel.create({
      phone, codeHash, expiresAt, attempts: 0,
      sendStatus: result.sent ? 'sent' : 'failed',
      sendReason: result.reason,
    });

    this.logger.log(`OTP requested for ${phone} (school: ${schoolSlug}) - send status: ${result.sent ? 'sent' : `failed: ${result.reason}`}`);

    return {
      phone,
      sent: result.sent,
      reason: result.reason,
      expiresInMinutes: OTP_TTL_MINUTES,
      devCode: process.env.PARENT_OTP_DEV_MODE === 'true' ? code : undefined,
    };
  }

  async verifyOtp(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    const otp = await this.otpModel.findOne({ phone, consumedAt: null }).sort({ createdAt: -1 });
    if (!otp) throw new BadRequestException('No pending verification code for this number. Request a new one.');
    if (otp.expiresAt < new Date()) throw new BadRequestException('This code has expired. Request a new one.');
    if (otp.attempts >= MAX_ATTEMPTS) throw new ForbiddenException('Too many incorrect attempts. Request a new code.');

    const valid = await bcrypt.compare(code, otp.codeHash);
    if (!valid) {
      otp.attempts += 1;
      await otp.save();
      throw new BadRequestException(`Incorrect code. ${MAX_ATTEMPTS - otp.attempts} attempt(s) remaining.`);
    }

    otp.consumedAt = new Date();
    await otp.save();

    return this.issueSessionForPhone(phone);
  }

  private async issueSessionForPhone(phone: string) {
    const matchRegex = phoneMatchRegex(phone);
    const matchingStudents = await this.studentModel.find({ 'guardians.phone': matchRegex }).lean();
    if (matchingStudents.length === 0) {
      throw new NotFoundException('No student record found with this WhatsApp number.');
    }
    const schoolSlug = (matchingStudents[0] as any).schoolSlug;
    const tenant = await this.tenantModel.findOne({ slug: schoolSlug }).lean();
    if (!tenant) throw new NotFoundException('School configuration not found for this number.');
    if ((tenant as any).status === 'suspended') throw schoolSuspendedException();

    const studentIds = matchingStudents.map((s: any) => s._id);
    let user = await this.userModel.findOne({ phone });
    // Deactivated login: no session, same generic answer as an unknown number (S1).
    if (user && user.isActive === false) throw new NotFoundException(NO_STUDENT_RECORD_MESSAGE);

    if (!user) {
      const primaryGuardian = (matchingStudents[0] as any).guardians?.find((g: any) => matchRegex?.test(g.phone || ''));
      const placeholderPasswordHash = await bcrypt.hash(`otp-only-${Date.now()}-${Math.random()}`, 10);
      user = await this.userModel.create({
        tenantId: (tenant as any)._id,
        institutionId: (tenant as any)._id,
        email: primaryGuardian?.email || `${phone.replace(/\D/g, '')}@parent.eldermin.local`,
        phone,
        passwordHash: placeholderPasswordHash,
        profile: {
          firstName: primaryGuardian?.name?.split(' ')?.[0] || 'Parent',
          lastName: primaryGuardian?.name?.split(' ')?.slice(1)?.join(' ') || '',
        },
        primaryRole: 'parent',
        isActive: true,
        guardianOfStudentIds: studentIds,
      });
    } else {
      const existingIds = (user.guardianOfStudentIds || []).map(String);
      const allIds = Array.from(new Set([...existingIds, ...studentIds.map(String)]));
      user.guardianOfStudentIds = allIds.map((id) => new Types.ObjectId(id));
      user.lastLoginAt = new Date();
      await user.save();
    }

    await recordLoginUsage(this.usageLogModel, schoolSlug);

    const payload = {
      sub: (user._id as any).toString(),
      tv: Number.isInteger((user as any).tokenVersion) ? (user as any).tokenVersion : 0, // S3
      tenantId: (tenant as any)._id.toString(),
      institutionId: ((user.institutionId as any) || (tenant as any)._id).toString(),
      role: 'parent',
      name: `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim() || 'Parent',
      schoolSlug,
      activeModules: (tenant as any).activeModules || ['organization'],
      guardianOfStudentIds: (user.guardianOfStudentIds || []).map((id) => id.toString()),
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user._id, name: payload.name, phone: user.phone, email: user.email,
        role: 'parent', guardianOfStudentIds: payload.guardianOfStudentIds,
      },
    };
  }

  // ── Parent Leads (self-serve signup, school not necessarily onboarded) ──
  //
  // A ParentLead is NOT a tenant-scoped User/Guardian - it's a prospective
  // parent who may belong to no Eldermin school at all yet. It therefore
  // carries its own lightweight JWT (role: 'parent_lead', sub: lead id) that
  // is verified directly by ParentLeadAuthGuard rather than going through
  // the main JwtStrategy/AuthStateService pipeline, which hard-requires a
  // matching User document and would reject every lead token outright.

  /** Best-effort match against a real Institution by name - exact,
   * case-insensitive, whitespace-trimmed. Deliberately NOT fuzzy: a
   * wrong auto-link would show a parent fake "your school is on Eldermin"
   * data, which is worse than leaving a close-but-not-exact name unlinked. */
  private async matchInstitution(schoolNameRaw: string): Promise<Types.ObjectId | null> {
    const trimmed = schoolNameRaw.trim();
    if (!trimmed) return null;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = await this.institutionModel
      .findOne({ name: new RegExp(`^${escaped}$`, 'i') })
      .select('_id')
      .lean();
    return match ? (match as any)._id : null;
  }

  private signLeadToken(lead: ParentLeadDocument) {
    return this.jwtService.sign({
      sub: (lead._id as any).toString(),
      role: 'parent_lead',
      email: lead.email,
    });
  }

  private serializeLead(lead: ParentLeadDocument) {
    return {
      id: lead._id,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      schoolNameRaw: lead.schoolNameRaw,
      isSchoolOnboarded: !!lead.matchedInstitutionId,
      location: lead.location,
      children: lead.children,
    };
  }

  async registerLead(dto: RegisterParentLeadDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.parentLeadModel.findOne({ email }).lean();
    if (existing) throw new ConflictException('An account with this email already exists. Please sign in instead.');

    const [passwordHash, matchedInstitutionId, geo] = await Promise.all([
      bcrypt.hash(dto.password, 10),
      this.matchInstitution(dto.schoolName),
      (dto.lat !== undefined && dto.lng !== undefined)
        ? this.geocodingService.reverseGeocode(dto.lat, dto.lng)
        : Promise.resolve({}),
    ]);

    const lead = await this.parentLeadModel.create({
      fullName: dto.fullName.trim(),
      email,
      phone: dto.phone ? normalizePhone(dto.phone) : undefined,
      passwordHash,
      schoolNameRaw: dto.schoolName.trim(),
      matchedInstitutionId,
      location: {
        lat: dto.lat, lng: dto.lng,
        country: (geo as any).country, city: (geo as any).city, district: (geo as any).district,
      },
      children: dto.children || [],
      source: 'parent-app-signup',
    });

    this.logger.log(`Parent lead registered: ${email} (school: "${dto.schoolName}", matched: ${matchedInstitutionId ? 'yes' : 'no'})`);

    return { accessToken: this.signLeadToken(lead), user: this.serializeLead(lead) };
  }

  async loginLead(dto: LoginParentLeadDto) {
    const email = dto.email.trim().toLowerCase();
    const lead = await this.parentLeadModel.findOne({ email });
    // Same generic message whether the email doesn't exist or the password
    // is wrong, so a login attempt can't be used to enumerate registered emails.
    const genericError = () => new UnauthorizedException('Incorrect email or password.');
    if (!lead) throw genericError();

    const valid = await bcrypt.compare(dto.password, lead.passwordHash);
    if (!valid) throw genericError();

    lead.lastLoginAt = new Date();
    await lead.save();

    return { accessToken: this.signLeadToken(lead), user: this.serializeLead(lead) };
  }
}
