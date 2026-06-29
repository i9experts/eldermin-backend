import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../organization/schemas/user.schema';
import { Tenant, TenantDocument } from '../organization/schemas/tenant.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    private jwtService: JwtService,
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

    const payload = {
      sub: user._id.toString(),
      tenantId,
      institutionId: user.institutionId?.toString(),
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
      },
      institution: {
        name: tenant?.displayName || slugToUse || 'Unknown',
        slug: tenant?.slug || slugToUse || null,
        plan: tenant?.plan || null,
        activeModules,
      },
    };
  }

  async getMe(userId: string, tenantId: string) {
    const user = await this.userModel
      .findOne({ _id: userId, tenantId, isActive: true })
      .select('-passwordHash').lean();
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }
}
