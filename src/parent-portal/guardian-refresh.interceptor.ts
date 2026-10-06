import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../modules/organization/schemas/user.schema';

/**
 * A parent's JWT carries guardianOfStudentIds as they were at login, so a
 * newly linked child stayed invisible (and an unlinked one stayed
 * accessible) until the token expired. For parent callers this re-reads the
 * list from the user record on every request and swaps it onto req.user, so
 * every existing assertStudentAccess / getGuardianStudentIds check sees the
 * current links. Deactivated accounts are rejected immediately.
 */
@Injectable()
export class GuardianRefreshInterceptor implements NestInterceptor {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (user && (user.role || user.primaryRole) === 'parent' && user.userId) {
      const fresh: any = await this.userModel.findById(user.userId).select('guardianOfStudentIds isActive').lean();
      if (!fresh || fresh.isActive === false) throw new UnauthorizedException('This account is no longer active.');
      user.guardianOfStudentIds = (fresh.guardianOfStudentIds || []).map((id: any) => String(id));
    }
    return next.handle();
  }
}
