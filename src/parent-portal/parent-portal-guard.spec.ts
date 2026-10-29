import * as fs from 'fs';
import * as path from 'path';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { NON_STAFF_ROLES } from '../auth/admin-role-sets';
import { assertStudentAccess } from '../auth/scope.util';
import { ROLES_OR_MODULE_KEY } from '../roles/decorators/roles-or-module-manage.decorator';
import { ParentPortalController, PARENT_PORTAL_STAFF_ROLES } from './parent-portal.controller';
import { ParentPortalService } from './parent-portal.service';

const proto: any = ParentPortalController.prototype;
const routeNames = (): string[] =>
  Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function' && Reflect.getMetadata('path', proto[n]) !== undefined);

// The six school-side routes (five when the branch was cut; getConsentRequestResults was added on main since): they keep their own method-level @Roles.
const CONSENT = ['listConsentRequests', 'createConsentRequest', 'closeConsentRequest', 'getConsentRequestResults'];
const LINK = ['linkGuardian', 'unlinkGuardian'];
const STAFF_ROUTES = [...CONSENT, ...LINK];

const ctxFor = (handlerName: string, role: string) => ({
  getHandler: () => proto[handlerName],
  getClass: () => ParentPortalController,
  switchToHttp: () => ({ getRequest: () => ({ user: { role, schoolSlug: 'school-a', tenantId: 't-a' } }) }),
}) as any;
const guard = new RolesGuard(new Reflector());
const passes = (handlerName: string, role: string) => {
  try { return guard.canActivate(ctxFor(handlerName, role)) === true; } catch { return false; }
};

describe('parent-portal: parent-only by default', () => {
  it('the class carries @Roles(PARENT)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ParentPortalController)).toEqual([UserRole.PARENT]);
  });

  it('exactly the six school-side routes carry their own method-level @Roles; every other route inherits the class default', () => {
    const own = routeNames().filter((n) => Reflect.getMetadata(ROLES_KEY, proto[n]) !== undefined).sort();
    expect(own).toEqual([...STAFF_ROUTES].sort());
    expect(routeNames().length).toBeGreaterThanOrEqual(40);
  });

  it('the consent-admin set has no parent, student or reseller role; link/unlink use the staff set (no non-staff role)', () => {
    for (const n of CONSENT) {
      const roles: UserRole[] = Reflect.getMetadata(ROLES_KEY, proto[n]);
      for (const r of NON_STAFF_ROLES) expect(roles).not.toContain(r);
      expect(roles).toEqual(expect.arrayContaining([UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.INSTITUTION_OWNER]));
    }
    for (const n of LINK) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[n])).toEqual(PARENT_PORTAL_STAFF_ROLES);
      expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, proto[n])).toBeDefined(); // the real decision is still RolesOrModuleManage
    }
    for (const r of NON_STAFF_ROLES) expect(PARENT_PORTAL_STAFF_ROLES).not.toContain(r);
  });

  describe('method-level @Roles overrides the class default under RolesGuard (roles.guard.ts:19-22 uses getAllAndOverride([handler, class]))', () => {
    it('an admin passes consent-requests although the class says PARENT; the same admin fails a parent route', () => {
      expect(passes('listConsentRequests', UserRole.ADMIN)).toBe(true);
      expect(passes('getStudentProfile', UserRole.ADMIN)).toBe(false);
    });
    it('a parent fails the consent-admin routes although the class says PARENT', () => {
      for (const n of CONSENT) expect(passes(n, UserRole.PARENT)).toBe(false);
    });
  });

  describe('parent routes', () => {
    const parentRoutes = routeNames().filter((n) => !STAFF_ROUTES.includes(n));
    it('every parent route passes for a parent', () => {
      for (const n of parentRoutes) expect(passes(n, UserRole.PARENT)).toBe(true);
    });
    it.each([
      UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT, UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER,
      UserRole.PRINCIPAL, UserRole.ADMIN, UserRole.TEACHER, UserRole.FINANCE_MANAGER, UserRole.HR_MANAGER, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF, 'unknown_role',
    ])('every parent route is refused for %s', (role) => {
      for (const n of parentRoutes) expect(passes(n, role)).toBe(false);
    });
  });

  describe('school-side routes', () => {
    it.each([UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.VICE_PRINCIPAL, UserRole.ACADEMIC_COORDINATOR, UserRole.INSTITUTION_OWNER, UserRole.SUPER_ADMIN])(
      'consent routes allow %s', (role) => { for (const n of CONSENT) expect(passes(n, role)).toBe(true); });
    it.each([UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT, UserRole.TEACHER, UserRole.LIBRARIAN])(
      'consent routes refuse %s', (role) => { for (const n of CONSENT) expect(passes(n, role)).toBe(false); });
    it.each([UserRole.ADMIN, UserRole.TEACHER, UserRole.INSTITUTION_OWNER, UserRole.SUPER_ADMIN, UserRole.SUPPORT_STAFF])(
      'link/unlink reach RolesOrModuleManage for staff role %s (it decides after this guard)', (role) => { for (const n of LINK) expect(passes(n, role)).toBe(true); });
    it.each([UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT])(
      'link/unlink refuse %s', (role) => { for (const n of LINK) expect(passes(n, role)).toBe(false); });
  });
});

describe('guardian-link ownership on every route that takes a student id', () => {
  const mine = 'a'.repeat(24), other = 'b'.repeat(24);
  const parent = (ids: string[]) => ({ role: 'parent', guardianOfStudentIds: ids } as any);

  it('a parent reaches only their own linked children', () => {
    expect(() => assertStudentAccess(parent([mine]), mine)).not.toThrow();
    expect(() => assertStudentAccess(parent([mine]), other)).toThrow(ForbiddenException);
    expect(() => assertStudentAccess(parent([]), mine)).toThrow(ForbiddenException);
    expect(() => assertStudentAccess({ role: 'parent' } as any, mine)).toThrow(ForbiddenException);
  });

  it('every ParentPortalService / HomeTasksService method that takes a studentId checks ownership first (source scan)', () => {
    const NOT_PARENT_METHODS = [
      'linkGuardianToStudents', 'unlinkGuardianFromStudent', 'createConsentRequest', 'checkFeatureSuspended',
      // LMS Phase 4 forum helpers - private, always called from a public
      // method (listCourseForumThreads etc.) that already ran
      // assertStudentAccess before reaching either of these.
      'assertStudentCanAccessCourse', 'studentDisplayName',
    ];
    const files = [
      path.join(__dirname, 'parent-portal.service.ts'),
      path.join(__dirname, '..', 'home-tasks', 'home-tasks.service.ts'),
    ];
    const missing: string[] = [];
    let checked = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const chunk of src.split(/\n  (?:async |private async )/).slice(1)) {
        const m = chunk.match(/^(\w+)\(([^)]*)\)/);
        if (!m || !/studentId/.test(m[2]) || NOT_PARENT_METHODS.includes(m[1])) continue;
        checked++;
        // the check must come before the first model/db access
        const firstAccess = chunk.search(/this\.\w+Model|this\.\w+\.(?:find|get|check)|\.collection\(/);
        const check = chunk.indexOf('assertStudentAccess');
        if (check < 0 || (firstAccess >= 0 && check > firstAccess)) missing.push(`${path.basename(f)}:${m[1]}`);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(30);
    expect(missing).toEqual([]);
  });

  it('the diary PDF route checks ownership BEFORE the feature-suspended lookup', async () => {
    const service: any = { checkFeatureSuspended: jest.fn(), downloadClassDiaryPdf: jest.fn() };
    const controller = new ParentPortalController(service, {} as any);
    const req = { user: { role: 'parent', guardianOfStudentIds: [mine], schoolSlug: 's', tenantId: 't' }, headers: {} };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn(), end: jest.fn() };
    await expect(controller.downloadClassDiaryPdf(other, 'd1', req, res)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.checkFeatureSuspended).not.toHaveBeenCalled();
    expect(service.downloadClassDiaryPdf).not.toHaveBeenCalled();
  });

  describe('same school only (getStudentProfile)', () => {
    const makeService = (found: any) => {
      const studentModel: any = { findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(found) }) })) };
      const svc: any = Object.create(ParentPortalService.prototype);
      svc.studentModel = studentModel;
      svc.reportCardModel = { db: { collection: () => ({ find: () => ({ project: () => ({ toArray: () => Promise.resolve([]) }) }) }) } };
      return { svc, studentModel };
    };
    it('looks the child up by id AND the caller\'s school: a linked id that lives in another school is a 404', async () => {
      const { svc, studentModel } = makeService(null);
      await expect(svc.getStudentProfile(mine, parent([mine]), 'school-a')).rejects.toBeInstanceOf(NotFoundException);
      expect(studentModel.findOne).toHaveBeenCalledWith({ _id: mine, schoolSlug: 'school-a' });
    });
    it('an unlinked child never reaches the database', async () => {
      const { svc, studentModel } = makeService({ firstName: 'x' });
      await expect(svc.getStudentProfile(other, parent([mine]), 'school-a')).rejects.toBeInstanceOf(ForbiddenException);
      expect(studentModel.findOne).not.toHaveBeenCalled();
    });
    it('a linked child in the caller\'s school is returned', async () => {
      const { svc } = makeService({ firstName: 'Ayesha', photo: null });
      await expect(svc.getStudentProfile(mine, parent([mine]), 'school-a')).resolves.toMatchObject({ firstName: 'Ayesha' });
    });
  });
});
