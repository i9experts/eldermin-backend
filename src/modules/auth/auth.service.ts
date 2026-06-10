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

  async login(email: string, password: string, slug: string) {
    const tenant = await this.tenantModel.findOne({ slug: slug.toLowerCase() }).lean();
    if (!tenant) throw new UnauthorizedException('Institution not found');
    if (tenant.status === 'suspended') throw new ForbiddenException('Account suspended');

    const user = await this.userModel.findOne({
      tenantId: tenant._id,
      email: email.toLowerCase().trim(),
      isActive: true,
    }).lean();
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.userModel.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

    const payload = {
      sub: user._id.toString(),
      tenantId: tenant._id.toString(),
      institutionId: user.institutionId?.toString(),
      role: user.primaryRole,
      activeModules: tenant.activeModules || ['organization'],
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user._id,
        name: `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim(),
        email: user.email,
        role: user.primaryRole,
        avatarUrl: user.profile?.avatarUrl || null,
      },
      institution: {
        name: tenant.displayName,
        slug: tenant.slug,
        plan: tenant.plan,
        activeModules: tenant.activeModules,
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
