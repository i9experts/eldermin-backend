import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PhoneOtp, PhoneOtpDocument } from './schemas/phone-otp.schema';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';
import { Student, StudentDocument } from '../students/schemas/student.schema';
import { Tenant, TenantDocument } from '../modules/organization/schemas/tenant.schema';
import { WhatsAppService } from '../email/whatsapp.service';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 45;

@Injectable()
export class ParentAuthService {
  private logger = new Logger('ParentAuthService');

  constructor(
    @InjectModel(PhoneOtp.name) private otpModel: Model<PhoneOtpDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    private jwtService: JwtService,
    private whatsAppService: WhatsAppService,
  ) {}

  private normalizePhone(raw: string): string {
    const digits = raw.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
    if (digits.startsWith('92')) return `+${digits}`;
    return `+${digits}`;
  }

  private async resolveSchoolForPhone(phone: string): Promise<{ schoolSlug: string; existingUser: UserDocument | null }> {
    const existingUser = await this.userModel.findOne({ phone });
    if (existingUser) {
      const tenant = await this.tenantModel.findById(existingUser.tenantId).lean();
      return { schoolSlug: (tenant as any)?.slug, existingUser };
    }

    const student = await this.studentModel.findOne({ 'guardians.phone': phone }).select('schoolSlug').lean();
    if (!student) {
      throw new NotFoundException("No student record found with this WhatsApp number. Please contact your school to have it registered against your child's profile first.");
    }
    return { schoolSlug: (student as any).schoolSlug, existingUser: null };
  }

  async requestOtp(rawPhone: string) {
    const phone = this.normalizePhone(rawPhone);
    const { schoolSlug } = await this.resolveSchoolForPhone(phone);

    const recent = await this.otpModel.findOne({ phone }).sort({ createdAt: -1 }).lean();
    if (recent && Date.now() - new Date((recent as any).createdAt).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      const waitSeconds = RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - new Date((recent as any).createdAt).getTime()) / 1000);
      throw new BadRequestException(`Please wait ${waitSeconds} more second(s) before requesting another code.`);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    const result = await this.whatsAppService.sendTemplateMessage(phone, 'parent_login_otp', { code });

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
    const phone = this.normalizePhone(rawPhone);
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
    const matchingStudents = await this.studentModel.find({ 'guardians.phone': phone }).lean();
    if (matchingStudents.length === 0) {
      throw new NotFoundException('No student record found with this WhatsApp number.');
    }
    const schoolSlug = (matchingStudents[0] as any).schoolSlug;
    const tenant = await this.tenantModel.findOne({ slug: schoolSlug }).lean();
    if (!tenant) throw new NotFoundException('School configuration not found for this number.');

    const studentIds = matchingStudents.map((s: any) => s._id);
    let user = await this.userModel.findOne({ phone });

    if (!user) {
      const primaryGuardian = (matchingStudents[0] as any).guardians?.find((g: any) => g.phone === phone);
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

    const payload = {
      sub: (user._id as any).toString(),
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
}
