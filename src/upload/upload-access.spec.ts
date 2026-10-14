import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UploadController, UPLOAD_FOLDER_PATTERN, assertKeyBelongsToSchool } from './upload.controller';
import { EceController } from '../ece/ece.controller';
import { RolesGuard } from '../auth/roles.guard';
import { ROLES_KEY } from '../auth/decorators';
import { ROLES_OR_MODULE_KEY } from '../roles/decorators/roles-or-module-manage.decorator';
import { NON_STAFF_ROLES, SCHOOL_STAFF_ROLES, STAFF_WRITE_ROLES } from '../auth/role-sets';

// D9. Callers proven by grep before this change: web FileUpload/homework/procurement/id-card/ECE pages (staff pages) and the
// teacher app's homework upload; the parent app has no /upload or /ece call. So only parent/student/reseller are blocked.
const guard = new RolesGuard(new Reflector());
const check = (cls: any, handler: any, role: string) => guard.canActivate({
  getHandler: () => handler, getClass: () => cls,
  switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
} as any);

describe('/upload is staff-only (D9)', () => {
  const proto: any = UploadController.prototype;
  const handlers = ['uploadSingle', 'uploadMultiple', 'deleteFile', 'getSignedUrl'];
  it('class-level guard = every role except parent/student/reseller', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UploadController)).toEqual(SCHOOL_STAFF_ROLES);
  });
  it.each(handlers)('%s: parent, student, reseller -> 403', (h) => {
    for (const r of NON_STAFF_ROLES) expect(() => check(UploadController, proto[h], r)).toThrow(ForbiddenException);
  });
  it.each(handlers)('%s: teacher (homework), admin, principal, librarian, support keep access', (h) => {
    for (const r of ['teacher', 'admin', 'principal', 'librarian', 'support_staff', 'academic_coordinator', 'institution_owner', 'super_admin']) expect(check(UploadController, proto[h], r)).toBe(true);
  });
  it('folder names used by every current client are valid; traversal and odd names are not', () => {
    for (const f of ['documents', 'signatures', 'inventory', 'homework-attachments', 'id-card-watermarks', 'ece-evidence']) expect(UPLOAD_FOLDER_PATTERN.test(f)).toBe(true);
    for (const f of ['..', '../x', 'a/b', '', '.hidden', 'a b', 'x'.repeat(65)]) expect(UPLOAD_FOLDER_PATTERN.test(f)).toBe(false);
  });
  it('upload with a bad folder is a 400 before any storage call', async () => {
    const svc: any = { uploadFile: jest.fn() };
    const c = new UploadController(svc);
    await expect(c.uploadSingle({} as any, '../etc', { user: { schoolSlug: 's' } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(c.uploadMultiple([] as any, 'a/b', { user: { schoolSlug: 's' } })).rejects.toBeInstanceOf(BadRequestException);
    expect(svc.uploadFile).not.toHaveBeenCalled();
  });
  it('a good folder still reaches the service with the school from the token', async () => {
    const svc: any = { uploadFile: jest.fn(async () => ({ key: 's/homework-attachments/u.pdf' })) };
    const r = await new UploadController(svc).uploadSingle({} as any, 'homework-attachments', { user: { schoolSlug: 's' } });
    expect(svc.uploadFile).toHaveBeenCalledWith({}, 'homework-attachments', 's');
    expect(r).toEqual({ success: true, data: { key: 's/homework-attachments/u.pdf' } });
  });
});

describe('file keys are school-scoped on delete and signed-url (D9)', () => {
  it('own school key passes (this is the key shape the teacher app and web send)', () => {
    expect(assertKeyBelongsToSchool('sch/homework-attachments/a.pdf', 'sch', 'teacher')).toBe('sch/homework-attachments/a.pdf');
  });
  it("another school's key, a prefix lookalike and a missing slug are 403", () => {
    expect(() => assertKeyBelongsToSchool('other/x/a.pdf', 'sch', 'admin')).toThrow(ForbiddenException);
    expect(() => assertKeyBelongsToSchool('schX/x/a.pdf', 'sch', 'admin')).toThrow(ForbiddenException);
    expect(() => assertKeyBelongsToSchool('sch/x/a.pdf', undefined, 'admin')).toThrow(ForbiddenException);
  });
  it('missing, non-string, traversal and absolute keys are 400', () => {
    for (const k of [undefined, null, '', '  ', 42, { a: 1 }, 'sch/../other/a.pdf', '/sch/x/a.pdf']) expect(() => assertKeyBelongsToSchool(k, 'sch', 'admin')).toThrow(BadRequestException);
  });
  it('platform super_admin (no school in the token) is not restricted', () => {
    expect(assertKeyBelongsToSchool('any/x/a.pdf', undefined, 'super_admin')).toBe('any/x/a.pdf');
  });
  it('delete and signed-url enforce it before touching storage', async () => {
    const svc: any = { deleteFile: jest.fn(), getSignedUrl: jest.fn(async () => 'https://signed') };
    const c = new UploadController(svc);
    const req = { user: { schoolSlug: 'sch', role: 'teacher' } };
    await expect(c.deleteFile('other/x/a.pdf', req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(c.getSignedUrl('other/x/a.pdf', req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.deleteFile).not.toHaveBeenCalled(); expect(svc.getSignedUrl).not.toHaveBeenCalled();
    await expect(c.getSignedUrl('sch/x/a.pdf', req)).resolves.toEqual({ url: 'https://signed' });
    await c.deleteFile('sch/x/a.pdf', req);
    expect(svc.deleteFile).toHaveBeenCalledWith('sch/x/a.pdf');
  });
});

describe('/ece is staff-only on every route (D9)', () => {
  const proto: any = EceController.prototype;
  const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function' && n !== 'ctx');
  it('class-level guard = SCHOOL_STAFF_ROLES and there are many handlers under it', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EceController)).toEqual(SCHOOL_STAFF_ROLES);
    expect(handlers.length).toBeGreaterThan(40);
  });
  it('no handler overrides the class guard with a wider @Roles', () => {
    for (const h of handlers) expect(Reflect.getMetadata(ROLES_KEY, proto[h])).toBeUndefined();
  });
  it('every handler: parent/student/reseller -> 403; teacher/coordinator/admin -> pass the role check', () => {
    for (const h of handlers) {
      for (const r of NON_STAFF_ROLES) expect(() => check(EceController, proto[h], r)).toThrow(ForbiddenException);
      for (const r of ['teacher', 'academic_coordinator', 'admin', 'principal']) expect(check(EceController, proto[h], r)).toBe(true);
    }
  });
  it('the five existing write guards are untouched', () => {
    const guarded = handlers.filter((h) => Reflect.getMetadata(ROLES_OR_MODULE_KEY, proto[h]));
    expect(guarded).toHaveLength(5);
    for (const h of guarded) expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, proto[h]).roles).toEqual(STAFF_WRITE_ROLES);
  });
});
