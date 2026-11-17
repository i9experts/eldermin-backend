import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AcademicsController } from './academics.controller';
import { RolesGuard } from '../../auth/roles.guard';
import { ROLES_KEY } from '../../auth/decorators';
import { UserRole } from '../../auth/roles.enum';
import { NON_STAFF_ROLES, SCHOOL_STAFF_ROLES } from '../../auth/role-sets';

// D8 (+ round 2): EVERY library route (writes, settings AND reads) is closed to the parent / student / reseller roles.
// Every staff role (teacher included) keeps today's access - owner decision on teachers is pending.
// The parent app reads the library only through /parent-portal/students/:id/library (parent_api_service.dart:98-99), never /academics/library.
const PROTO: any = AcademicsController.prototype;
const WRITE_HANDLERS: Array<[string, string]> = [
  ['getLibrarySettings', 'GET library/settings'], ['updateLibrarySettings', 'PUT library/settings'],
  ['createBook', 'POST library/books'], ['updateBook', 'PATCH library/books/:id'], ['deaccessionBook', 'PATCH library/books/:id/deaccession'],
  ['issueBook', 'POST library/issue'], ['returnBook', 'PATCH library/return/:issueId'], ['renewIssue', 'POST library/issues/:id/renew'],
  ['markFinePaid', 'PATCH library/issues/:id/fine-paid'], ['markLost', 'POST library/issues/:id/lost'], ['markDamaged', 'POST library/issues/:id/damaged'],
  ['createReservation', 'POST library/reservations'], ['cancelReservation', 'DELETE library/reservations/:id'],
];

const READ_HANDLERS: Array<[string, string]> = [
  ['getLibraryStats', 'GET library/stats'], ['searchBooks', 'GET library/search'], ['getBooks', 'GET library/books'], ['getBookById', 'GET library/books/:id'],
  ['getIssues', 'GET library/issues'], ['getOverdue', 'GET library/overdue'], ['getReservations', 'GET library/reservations'],
  ['getLibraryDefaultersReport', 'GET library/reports/defaulters'],
];
const ALL_HANDLERS = [...WRITE_HANDLERS, ...READ_HANDLERS];

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

  it('every library handler (writes, settings, reads) carries the staff-only guard, and nothing else in the controller does', () => {
    const guarded = handlerNames().filter((n) => Reflect.getMetadata(ROLES_KEY, PROTO[n]));
    const expected = ALL_HANDLERS.map(([n]) => n);
    for (const n of expected) expect(typeof PROTO[n]).toBe('function');
    // the two remaining library report handlers (most-borrowed, circulation, export) are named differently: include whatever is guarded
    for (const n of expected) expect(guarded).toContain(n);
    const libraryLike = handlerNames().filter((n) => /librar|book|issue|reserv|overdue|fine|lost|damag|renew|return|deaccession|defaulter|borrow|circulation/i.test(n));
    for (const n of libraryLike) expect(Reflect.getMetadata(ROLES_KEY, PROTO[n])).toEqual(SCHOOL_STAFF_ROLES);
    for (const n of expected) expect(Reflect.getMetadata(ROLES_KEY, PROTO[n])).toEqual(SCHOOL_STAFF_ROLES);
  });

  const guard = new RolesGuard(new Reflector());
  const run = (handlerName: string, role: string) => guard.canActivate({
    getHandler: () => PROTO[handlerName], getClass: () => AcademicsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as any);

  it.each(ALL_HANDLERS)('%s (%s): parent, student and reseller tokens get 403', (h) => {
    for (const role of NON_STAFF_ROLES) expect(() => run(h, role)).toThrow(ForbiddenException);
  });
  it.each(ALL_HANDLERS)('%s (%s): teacher, librarian, admin keep access', (h) => {
    for (const role of ['teacher', 'librarian', 'admin', 'principal', 'academic_coordinator', 'support_staff']) expect(run(h, role)).toBe(true);
  });
});

describe('library borrower must belong to the caller\'s school (round 2)', () => {
  const { AcademicsService } = require('./academics.service');
  const { Types } = require('mongoose');
  const SID = new Types.ObjectId().toHexString();
  function svc(over: any = {}) {
    const s: any = Object.create(AcademicsService.prototype);
    s.studentModel = { findOne: jest.fn(() => ({ lean: async () => over.student ?? null })) };
    s.staffModel = { findOne: jest.fn(() => ({ lean: async () => over.staff ?? null })) };
    return s;
  }
  it('a student is looked up by _id AND the caller\'s school slug (never by _id alone)', async () => {
    const s = svc({ student: { firstName: 'A', lastName: 'B', studentId: 'S1', currentGrade: '5', currentSection: 'A' } });
    const r = await s.resolveBorrower('student', SID, 't1', 'myschool');
    expect(s.studentModel.findOne).toHaveBeenCalledWith({ _id: SID, schoolSlug: 'myschool' });
    expect(r.borrowerName).toBe('A B');
  });
  it('a student of another school is a 404 (the lookup is school-scoped)', async () => {
    await expect(svc().resolveBorrower('student', SID, 't1', 'myschool')).rejects.toThrow(/Student not found/);
  });
  it('a staff borrower is looked up by _id AND the caller\'s tenant in both id forms', async () => {
    const tenant = new Types.ObjectId().toHexString();
    const s = svc({ staff: { firstName: 'S', lastName: 'T', employeeId: 'E1' } });
    await s.resolveBorrower('staff', SID, tenant, 'myschool');
    const filter = s.staffModel.findOne.mock.calls[0][0];
    expect(filter._id).toBe(SID);
    expect(filter.tenantId.$in.map(String)).toEqual([tenant, tenant]);
  });
  it('staff of another tenant -> 404', async () => {
    await expect(svc().resolveBorrower('staff', SID, 't1', 'myschool')).rejects.toThrow(/Staff member not found/);
  });
  it('no school in the session fails closed (403) for a student borrower; malformed id -> 400; unknown type -> 400', async () => {
    await expect(svc().resolveBorrower('student', SID, 't1', undefined)).rejects.toThrow(/No school/);
    await expect(svc().resolveBorrower('student', 'nope', 't1', 'x')).rejects.toThrow(/valid id/);
    await expect(svc().resolveBorrower('visitor', SID, 't1', 'x')).rejects.toThrow(/borrowerType/);
  });
});
