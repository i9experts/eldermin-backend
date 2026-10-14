import { ConflictException, ForbiddenException } from '@nestjs/common';
import { APPROVAL_OVERRIDE_ROLES } from '../../auth/role-sets';

/** Names are free text on these records: compare trimmed and case-insensitive. */
export const sameName = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export const roleOf = (user: any): string => String(user?.role || user?.primaryRole || '');
export const isOverrideRole = (user: any) => (APPROVAL_OVERRIDE_ROLES as string[]).includes(roleOf(user));

/**
 * No self-approval (same rule the leave decision has, hr.service.ts: super_admin and the owner are exempt): the person who raised a
 * request cannot decide it. `requesterId` / `requesterName` are whatever the record stores.
 */
export function assertNotSelfApproval(user: any, requester: { id?: any; name?: string | null }, what: string): void {
  if (isOverrideRole(user)) return;
  const mine = user?.userId ? String(user.userId) : '';
  if ((mine && requester.id && String(requester.id) === mine) || sameName(user?.name, requester.name)) {
    throw new ForbiddenException(`You cannot approve or reject your own ${what}.`);
  }
}

export function assertStillOpen(status: string, open: string[], what: string): void {
  if (!open.includes(status)) throw new ConflictException(`This ${what} has already been ${status}.`);
}
