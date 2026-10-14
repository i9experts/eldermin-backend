import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './decorators';

export const SCHOOL_SLUG_KEY = 'schoolSlug';

@Injectable()
export class SchoolGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return true; // Let JwtAuthGuard handle unauthenticated requests

    // Super admins bypass school-level restrictions
    const userRole = user.role || user.primaryRole;
    if (userRole === 'super_admin') return true;

    const requestSlug =
      request.params?.schoolSlug ||
      request.query?.schoolSlug ||
      request.headers?.['x-school-slug'];

    // If no school slug in the request, skip this guard
    if (!requestSlug) return true;

    const userSchoolSlug = user.schoolSlug;

    // A non-super_admin token with no school cannot name one (was allowed
    // "for backwards compat", which let a school-less token pick any school).
    if (!userSchoolSlug) {
      throw new ForbiddenException('Access denied. No school context on this account.');
    }

    if (userSchoolSlug !== requestSlug) {
      throw new ForbiddenException(
        `Access denied. You do not have access to school: ${requestSlug}`,
      );
    }

    return true;
  }
}
