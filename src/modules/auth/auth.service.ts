import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserDocument } from '../organization/schemas/user.schema';
import { Tenant, TenantDocument } from '../organization/schemas/tenant.schema';
import { Staff, StaffDocument } from '../hr/schemas/staff.schema';
import { Campus, CampusDocument } from '../../organization/schemas/organization.schema';
import { TeacherProfile, TeacherProfileDocument } from '../teaching/schemas/teacher-profile.schema';
import { UploadService } from '../../upload/upload.service';
import { RolesService } from '../../roles/roles.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(Staff.name) private staffModel: Model<StaffDocument>,
    @InjectModel(Campus.name) private campusModel: Model<CampusDocument>,
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    private jwtService: JwtService,
    private uploadService: UploadService,
    private rolesService: RolesService,
    private emailService: EmailService,
  ) {}

  /** Looks up everything needed for campus/department/class-teacher
   * scoping - shared by login (embeds it into the JWT payload) and
   * getMe (so the frontend can actually see this about itself; without
   * this, campusId/department/classTeacherOfGradeName were only ever on
   * the JWT and getMe never surfaced them, leaving the frontend with no
   * way to know its own scope at all despite the backend enforcing it). */
  private async resolveScopeFieldsForUser(userId: any, schoolSlug?: string | null) {
    const staffRecord = await this.staffModel.findOne({ userId }).select('supervisedClusterIds isBoardLevel campusId department').lean();
    const supervisedClusterIds = staffRecord?.supervisedClusterIds?.map((id: any) => id.toString()) || undefined;
    const isBoardLevel = staffRecord?.isBoardLevel || undefined;
    let campusId = staffRecord?.campusId?.toString() || undefined;
    const department = staffRecord?.department || undefined;

    let classTeacherOfGradeId: string | undefined;
    let classTeacherOfGradeName: string | undefined;
    let classTeacherOfSectionName: string | undefined;
    if (staffRecord) {
      const teacherProfile = await this.teacherProfileModel
        .findOne({ staffId: (staffRecord as any)._id, isClassTeacher: true })
        .select('classTeacherOfGradeId classTeacherOfGradeName classTeacherOfSectionName')
        .lean();
      classTeacherOfGradeId = teacherProfile?.classTeacherOfGradeId || undefined;
      classTeacherOfGradeName = teacherProfile?.classTeacherOfGradeName || undefined;
      classTeacherOfSectionName = teacherProfile?.classTeacherOfSectionName || undefined;
    }

    if (!campusId && schoolSlug) {
      const campuses = await this.campusModel.find({ schoolSlug, isActive: true }).select('_id').limit(2).lean();
      if (campuses.length === 1) campusId = String(campuses[0]._id);
    }

    return { campusId, department, supervisedClusterIds, isBoardLevel, classTeacherOfGradeId, classTeacherOfGradeName, classTeacherOfSectionName };
  }

  async login(email: string, password: string, slug?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = { email: email.toLowerCase().trim(), isActive: true };
    if (slug) query.schoolSlug = slug.toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user: any = await this.userModel.findOne(query).lean();
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Support both passwordHash (new schema) and password (legacy)
    const hash = user.passwordHash || user.password;
    if (!hash) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // Try to resolve tenant — fall back gracefully if none exists yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tenant: any = null;
    const slugToUse = slug || user.schoolSlug;
    if (user.tenantId) {
      tenant = await this.tenantModel.findById(user.tenantId).lean();
    } else if (slugToUse) {
      tenant = await this.tenantModel.findOne({ slug: slugToUse }).lean();
    }
    if (tenant?.status === 'suspended') throw new ForbiddenException('Account suspended');

    const tenantId = tenant?._id?.toString() || user.tenantId?.toString() || slugToUse || user._id.toString();

    await this.userModel.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

    const role = user.primaryRole || user.role;
    const name = user.name || `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim();
    const activeModules = tenant?.activeModules || ['organization'];

    const schoolSlug = tenant?.slug || slugToUse || null;
    const permissions = await this.rolesService.getPermissionsForUser(user._id.toString());

    // Cluster/region scoping (large multi-campus networks only) - most
    // users have no Staff record with this set, in which case both
    // fields are simply absent from the token and every existing
    // permission check continues to work exactly as before.
    // Also carries campus/department scoping for the campus- and
    // department-level access model - the JWT strategy already reads
    // payload.campusId, but until now nothing ever put it on the
    // payload, so every logged-in user's campusId was silently
    // undefined regardless of their actual Staff assignment.
    const scopeFields = await this.resolveScopeFieldsForUser(user._id, schoolSlug);
    const { supervisedClusterIds, isBoardLevel, department, classTeacherOfGradeId, classTeacherOfGradeName, classTeacherOfSectionName } = scopeFields;
    const campusId = scopeFields.campusId;

    const payload = {
      sub: user._id.toString(),
      tenantId,
      institutionId: (user.institutionId || tenant?._id || user.tenantId)?.toString(),
      role,
      name,
      schoolSlug,
      activeModules,
      supervisedClusterIds,
      isBoardLevel,
      campusId,
      department,
      classTeacherOfGradeId,
      classTeacherOfGradeName,
      classTeacherOfSectionName,
      // Real parent/student ownership scoping - see assertStudentAccess
      // in scope.util.ts. Absent for every other role, exactly as
      // campusId/department are absent for roles they don't apply to.
      guardianOfStudentIds: user.guardianOfStudentIds?.map((id: any) => id.toString()) || undefined,
      linkedStudentId: user.linkedStudentId?.toString() || undefined,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user._id,
        name,
        email: user.email,
        role,
        avatarUrl: user.profile?.avatarUrl || null,
        // Present only when a school-defined custom role is assigned — the
        // frontend falls back to its existing standard-role matrix when
        // this is absent, so every account without one keeps working
        // exactly as it always has.
        permissions: permissions || undefined,
        // Same scope fields as the JWT payload above - the frontend's
        // standard login flow reads this response's user object
        // directly and never calls getMe, so without these being here
        // too, a freshly-logged-in user's own campus/class-teacher
        // scope would be invisible to the frontend until their next
        // page reload happened to trigger a getMe call somewhere.
        campusId,
        department,
        classTeacherOfGradeId,
        classTeacherOfGradeName,
        classTeacherOfSectionName,
      },
      institution: {
        name: tenant?.displayName || slugToUse || 'Unknown',
        slug: tenant?.slug || slugToUse || null,
        plan: tenant?.plan || null,
        activeModules,
      },
    };
  }

  // Forgot password: always returns a generic success message regardless
  // of whether the email matched anything (never leak which emails exist
  // in the system). Stores only a HASH of the reset token - same reason
  // we never store plain passwords - so a database read alone can't be
  // used to reset someone's account.
  async forgotPassword(email: string) {
    const genericResult = { message: 'If an account exists with that email, a reset link has been sent.' };
    const user: any = await this.userModel.findOne({ email: email.toLowerCase().trim(), isActive: true });
    if (!user) return genericResult;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userModel.findByIdAndUpdate(user._id, {
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: expires,
    });

    const resetUrl = `https://app.eldermin.com/reset-password?token=${rawToken}`;
    const name = user.name || user.profile?.firstName || 'there';
    try {
      await this.emailService.sendEmail({
        to: user.email,
        subject: 'Reset your Eldermin password',
        html: `
          <p>Hi ${name},</p>
          <p>We received a request to reset your Eldermin password. This link is valid for 1 hour:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you didn't request this, you can safely ignore this email - your password won't change.</p>
        `,
      });
    } catch (err: any) {
      // Don't let an email-delivery failure leak whether the account
      // exists, or block the response - the token is already saved, so a
      // resend/support flow can still recover it if needed.
    }

    return genericResult;
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const user = await this.userModel.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) throw new UnauthorizedException('This reset link is invalid or has expired');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userModel.findByIdAndUpdate(user._id, {
      $set: { passwordHash },
      $unset: { resetPasswordTokenHash: '', resetPasswordExpires: '' },
    });
    return { message: 'Password updated - you can now sign in with your new password.' };
  }

  async getMe(userId: string, tenantId: string) {
    const user: any = await this.userModel
      .findOne({ _id: userId, tenantId, isActive: true })
      .select('-passwordHash').lean();
    if (!user) throw new UnauthorizedException('User not found');
    const permissions = await this.rolesService.getPermissionsForUser(userId);
    // Self-healing single-campus fallback isn't critical here (unlike
    // login) - getMe only runs after a successful login, by which point
    // campusId should already be correctly set from their Staff record.
    // User has no schoolSlug field to look this up by anyway.
    const scopeFields = await this.resolveScopeFieldsForUser(userId, undefined);
    return { ...user, permissions: permissions || undefined, ...scopeFields };
  }

  async uploadAvatar(userId: string, tenantId: string, file: Express.Multer.File) {
    const { url } = await this.uploadService.uploadFile(file, 'avatars', tenantId);
    const user = await this.userModel.findOneAndUpdate(
      { _id: userId, tenantId },
      { $set: { 'profile.avatarUrl': url } },
      { new: true },
    ).select('-passwordHash');
    if (!user) throw new UnauthorizedException('User not found');
    return { avatarUrl: url };
  }
}
