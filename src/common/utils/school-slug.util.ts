import { ForbiddenException } from '@nestjs/common';

/**
 * The school for an authenticated request comes from the signed login token,
 * never from the x-school-slug header (any logged-in user could otherwise
 * name another school). Only a platform super_admin whose token carries no
 * school may pick one by header. Throws 403 when no school can be resolved.
 */
export function schoolSlugOf(req: any): string {
  const fromToken = req?.user?.schoolSlug;
  if (fromToken) return fromToken;
  const header = req?.headers?.['x-school-slug'];
  if (req?.user?.role === 'super_admin' && header) return header;
  throw new ForbiddenException('No school context on this account.');
}
