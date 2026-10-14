import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AcademicsController } from './academics.controller';
import { RolesGuard } from '../../auth/roles.guard';
import { ROLES_KEY } from '../../auth/decorators';
import { UserRole } from '../../auth/roles.enum';
import { NON_STAFF_ROLES, SCHOOL_STAFF_ROLES } from '../../auth/role-sets';

// D8: library write + settings routes are closed to the parent / student / reseller roles.
// Every staff role (teacher included) keeps today's access - owner decision on teachers is pending.
const PROTO: any = AcademicsController.prototype;
const WRITE_HANDLERS: Array<[string, string]> = [
  ['getLibrarySettings', 'GET library/settings'], ['updateLibrarySettings', 'PUT library/settings'],
  ['createBook', 'POST library/books'], ['updateBook', 'PATCH library/books/:id'], ['deaccessionBook', 'PATCH library/books/:id/deaccession'],
  ['issueBook', 'POST library/issue'], ['returnBook', 'PATCH library/return/:issueId'], ['renewIssue', 'POST library/issues/:id/renew'],
  ['markFinePaid', 'PATCH library/issues/:id/fine-paid'], ['markLost', 'POST library/issues/:id/lost'], ['markDamaged', 'POST library/issues/:id/damaged'],
  ['createReservation', 'POST library/reservations'], ['cancelReservation', 'DELETE library/reservations/:id'],
];

function handlerNames(): string[] {
  return Object.getOwnPropertyNames(PROTO).filter((n) => n !== 'constructor' && typeof PROTO[n] === 'function');
}

describe('library routes: staff-only writes and settings (D8)', () => {
  it('SCHOOL_STAFF_ROLES is every role except parent, student and the reseller roles', () => {
    expect(NON_STAFF_ROLES.sort()).toEqual([UserRole.PARENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT, UserRole.STUDENT].sort());
    for (const r of Object.values(UserRole)) expect(SCHOOL_STAFF_ROLES.includes(r)).toBe(!NON_STAFF_ROLES.includes(r));
    for (const r of [UserRole.TEACHER, UserRole.LIBRARIAN, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.ACADEMIC_COORDINATOR, UserRole.SUPPORT_STAFF, UserRole.INSTITUTION_OWNER, UserRole.SUPER_ADMIN]) {
      expect(SCHOOL_STAFF_ROLES).toContain(r);
    }
  });

  it('exactly the library write/settings handlers carry the staff-only guard', () => {
    const guarded = handlerNames().filter((n) => Reflect.getMetadata(ROLES_KEY, PROTO[n]));
    const expected = WRITE_HANDLERS.map(([n]) => n);
    for (const n of expected) expect(typeof PROTO[n]).toBe('function');
    expect(guarded.sort()).toEqual(expected.sort());
    for (const n of expected) expect(Reflect.getMetadata(ROLES_KEY, PROTO[n])).toEqual(SCHOOL_STAFF_ROLES);
  });

  const guard = new RolesGuard(new Reflector());
  const run = (handlerName: string, role: string) => guard.canActivate({
    getHandler: () => PROTO[handlerName], getClass: () => AcademicsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as any);

  it.each(WRITE_HANDLERS)('%s (%s): parent, student and reseller tokens get 403', (h) => {
    for (const role of NON_STAFF_ROLES) expect(() => run(h, role)).toThrow(ForbiddenException);
  });
  it.each(WRITE_HANDLERS)('%s (%s): teacher, librarian, admin keep access', (h) => {
    for (const role of ['teacher', 'librarian', 'admin', 'principal', 'academic_coordinator', 'support_staff']) expect(run(h, role)).toBe(true);
  });
  it('reads that were open stay unchanged (not part of this approval)', () => {
    for (const n of ['getBooks', 'getIssues', 'getOverdue']) if (typeof PROTO[n] === 'function') expect(Reflect.getMetadata(ROLES_KEY, PROTO[n])).toBeUndefined();
  });
});
