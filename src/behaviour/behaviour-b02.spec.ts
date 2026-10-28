// B0.2 (written, NOT yet run): Qaida / Nazra deny parent / student / reseller tokens on every route, both modes.
import { ForbiddenException, Logger } from '@nestjs/common';
import { QaidaController } from './qaida.controller';
import { NazraController } from './nazra.controller';
import { BehaviourStaffOnlyGuard } from './guards/behaviour-staff-only.guard';
import { PdfController } from '../pdf/pdf.controller';
import { UserRole } from '../auth/roles.enum';

const NON_STAFF = [UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT];
const STAFF = [
  UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.VICE_PRINCIPAL,
  UserRole.ACADEMIC_COORDINATOR, UserRole.TEACHER, UserRole.FINANCE_MANAGER, UserRole.HR_MANAGER, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF,
];

const handlersOf = (C: any) => {
  const proto = C.prototype;
  return Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor' && typeof proto[n] === 'function' && Reflect.getMetadata('path', proto[n]) !== undefined);
};
const ctx = (C: any, h: string, user: any): any => ({
  getHandler: () => C.prototype[h], getClass: () => C,
  switchToHttp: () => ({ getRequest: () => ({ user, method: 'GET', baseUrl: '/api/v1', route: { path: '/behaviour/x' } }) }),
});

const ORIGINAL = process.env.BEHAVIOUR_GUARD_MODE;
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
afterEach(() => { warn.mockRestore(); if (ORIGINAL === undefined) delete process.env.BEHAVIOUR_GUARD_MODE; else process.env.BEHAVIOUR_GUARD_MODE = ORIGINAL; });

describe.each([['Qaida', QaidaController], ['Nazra', NazraController]] as const)('%sController', (_name, C) => {
  it('is protected by BehaviourStaffOnlyGuard at class level and has all 9 routes', () => {
    expect(Reflect.getMetadata('__guards__', C)).toContain(BehaviourStaffOnlyGuard);
    expect(handlersOf(C)).toHaveLength(9);
  });

  it.each(['log', 'enforce'])('mode=%s: every route is 403 for parent / student / reseller tokens', (mode) => {
    process.env.BEHAVIOUR_GUARD_MODE = mode;
    const guard = new BehaviourStaffOnlyGuard();
    for (const h of handlersOf(C)) for (const role of NON_STAFF) {
      expect(() => guard.canActivate(ctx(C, h, { role, userId: 'u1' }))).toThrow(ForbiddenException);
    }
    const events = warn.mock.calls.map(c => JSON.parse(String(c[0]))).filter(e => e.event === 'behaviour_guard');
    expect(events.length).toBe(9 * NON_STAFF.length);
    expect(events.every(e => e.decision === 'denied' && e.reason === 'non_staff_token' && e.mode === mode)).toBe(true);
  });

  it('a primaryRole-only token and a missing user / role are denied too', () => {
    const guard = new BehaviourStaffOnlyGuard();
    expect(() => guard.canActivate(ctx(C, 'getSummary', { primaryRole: 'parent' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(C, 'getSummary', { userId: 'u1' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(C, 'getSummary', undefined))).toThrow(ForbiddenException);
  });

  it.each(['log', 'enforce'])('mode=%s: every staff role passes every route (staff behaviour unchanged, no per-route policy)', (mode) => {
    process.env.BEHAVIOUR_GUARD_MODE = mode;
    const guard = new BehaviourStaffOnlyGuard();
    for (const h of handlersOf(C)) for (const role of STAFF) expect(guard.canActivate(ctx(C, h, { role, userId: 'u1' }))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('POST /pdf/qaida-report', () => {
  const res: any = { set: jest.fn(), status: () => ({ end: jest.fn() }) };
  const pdfService: any = { generateQaidaReport: jest.fn(async () => Buffer.from('x')) };
  const ctl: any = new (PdfController as any)(pdfService);
  const req = (role: string) => ({ user: { role, userId: 'u1', schoolSlug: 'demo' }, headers: {} });

  it.each(NON_STAFF)('%s token: 403 and nothing is generated', async (role) => {
    await expect(ctl.generateQaidaReport({ studentId: 'x' }, req(role), res)).rejects.toThrow(ForbiddenException);
    expect(pdfService.generateQaidaReport).not.toHaveBeenCalled();
  });

  it('staff still generate it', async () => {
    await ctl.generateQaidaReport({ studentId: 'x' }, req('teacher'), res);
    expect(pdfService.generateQaidaReport).toHaveBeenCalledTimes(1);
  });
});
