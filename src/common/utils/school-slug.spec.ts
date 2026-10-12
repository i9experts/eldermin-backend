import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { schoolSlugOf } from './school-slug.util';
import { SchoolGuard } from '../../auth/school.guard';
import { PdfController } from '../../pdf/pdf.controller';
import { InstitutionSetupController } from '../../organization/institution-setup.controller';

describe('schoolSlugOf', () => {
  it('JWT school wins over a foreign header', () => {
    expect(schoolSlugOf({ user: { schoolSlug: 'mine', role: 'admin' }, headers: { 'x-school-slug': 'victim' } })).toBe('mine');
  });
  it('school-less non-super_admin cannot choose by header; super_admin can', () => {
    expect(() => schoolSlugOf({ user: { role: 'admin' }, headers: { 'x-school-slug': 'victim' } })).toThrow(ForbiddenException);
    expect(schoolSlugOf({ user: { role: 'super_admin' }, headers: { 'x-school-slug': 'x' } })).toBe('x');
  });
});

describe('pdf routes ignore a foreign x-school-slug', () => {
  it('every handler resolves the school from the token', async () => {
    const seen: string[] = [];
    const svc: any = new Proxy({}, { get: () => (slug: string) => { seen.push(slug); return Promise.resolve(Buffer.from('x')); } });
    const ctrl: any = new PdfController(svc);
    const res: any = { set: () => undefined, status: () => ({ end: () => undefined }), end: () => undefined, send: () => undefined, json: () => undefined };
    const req = { user: { schoolSlug: 'mine', userId: 'u', role: 'admin' }, headers: { 'x-school-slug': 'victim' } };
    const names = Object.getOwnPropertyNames(PdfController.prototype).filter(n => n !== 'constructor');
    for (const n of names) { try { await ctrl[n]({ studentId: 's', academicYear: 'y' }, req, res); } catch { /* shape errors irrelevant */ } }
    expect(names.length).toBeGreaterThan(5);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(s => s === 'mine')).toBe(true);
  });
});

describe('SchoolGuard', () => {
  const guard = new SchoolGuard(new Reflector());
  const ctx = (user: any, headers: any): any => ({ getHandler: () => function h() {}, getClass: () => class C {}, switchToHttp: () => ({ getRequest: () => ({ user, headers, params: {}, query: {} }) }) });
  it('cross-tenant header -> 403', () => expect(() => guard.canActivate(ctx({ role: 'admin', schoolSlug: 'mine' }, { 'x-school-slug': 'victim' }))).toThrow(ForbiddenException));
  it('matching header ok; no header ok', () => {
    expect(guard.canActivate(ctx({ role: 'admin', schoolSlug: 'mine' }, { 'x-school-slug': 'mine' }))).toBe(true);
    expect(guard.canActivate(ctx({ role: 'admin', schoolSlug: 'mine' }, {}))).toBe(true);
  });
  it('school-less non-super_admin naming a school -> 403 (was allowed); super_admin allowed', () => {
    expect(() => guard.canActivate(ctx({ role: 'admin' }, { 'x-school-slug': 'victim' }))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx({ role: 'super_admin' }, { 'x-school-slug': 'victim' }))).toBe(true);
  });
});

describe('institution-setup ctx', () => {
  it('uses the token school, ignores header', async () => {
    let slug = '';
    const svc: any = new Proxy({}, { get: () => (s: string) => { slug = s; return []; } });
    const c: any = new InstitutionSetupController(svc);
    await c.getBoardMembers({ user: { schoolSlug: 'mine', tenantId: 't' }, headers: { 'x-school-slug': 'victim' } });
    expect(slug).toBe('mine');
    expect(() => c.ctx({ user: { tenantId: 't' }, headers: { 'x-school-slug': 'victim' } })).toThrow(ForbiddenException);
  });
});
