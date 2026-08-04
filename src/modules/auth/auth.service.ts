import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserDocument } from '../organization/schemas/user.schema';
import { Tenant, TenantDocument } from '../organization/schemas/tenant.schema';
import { UploadService } from '../../upload/upload.service';
import { RolesService } from '../../roles/roles.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    private jwtService: JwtService,
    private uploadService: UploadService,
    private rolesService: RolesService,
    private emailService: EmailService,
  ) {}

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

    const payload = {
      sub: user._id.toString(),
      tenantId,
      institutionId: (user.institutionId || tenant?._id || user.tenantId)?.toString(),
      role,
      name,
      schoolSlug,
      activeModules,
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
    return { ...user, permissions: permissions || undefined };
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
