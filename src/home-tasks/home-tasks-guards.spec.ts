// B1: /home-tasks/* guards (parent/student/reseller denied in both modes; staff policy + teacher class scope under BEHAVIOUR_GUARD_MODE).
import { ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { HomeTasksController } from './home-tasks.controller';
import { HomeTasksService } from './home-tasks.service';
import { BehaviourAccessGuard } from '../behaviour/guards/behaviour-access.guard';
import { BEHAVIOUR_POLICY_KEY, BehaviourAccessContext } from '../behaviour/behaviour-access';
import { UserRole } from '../auth/roles.enum';

const proto: any = HomeTasksController.prototype;
const METHODS: Record<number, string> = { 0: 'GET', 1: 'POST', 2: 'PUT', 3: 'DELETE', 4: 'PATCH' };
const handlers = Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor' && typeof proto[n] === 'function' && Reflect.getMetadata('path', proto[n]) !== undefined);
const ctx = (h: string, user: any): any => {
  const req: any = { user, method: METHODS[Reflect.getMetadata('method', proto[h])], baseUrl: '/api/v1/home-tasks', route: { path: '/' + Reflect.getMetadata('path', proto[h]) } };
  return { getHandler: () => proto[h], getClass: () => HomeTasksController, switchToHttp: () => ({ getRequest: () => req }), __req: req };
};
const noCustomRole = { userModel: { findById: () => ({ select: () => ({ lean: () => Promise.resolve({}) }) }) } as any, roleModel: {} as any };
const guard = () => new BehaviourAccessGuard(new Reflector(), noCustomRole.roleModel, noCustomRole.userModel);
const user = (role: string) => ({ role, userId: 'u1', tenantId: 't1', schoolSlug: 'demo' });

const ORIGINAL = process.env.BEHAVIOUR_GUARD_MODE;
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
afterEach(() => { warn.mockRestore(); if (ORIGINAL === undefined) delete process.env.BEHAVIOUR_GUARD_MODE; else process.env.BEHAVIOUR_GUARD_MODE = ORIGINAL; });
const events = () => warn.mock.calls.map(c => { try { return JSON.parse(String(c[0])); } catch { return null; } }).filter(e => e?.event === 'behaviour_guard');

describe('HomeTasksController guards', () => {
  it('lists exactly the 3 staff routes, class-level guard attached, one policy per route', () => {
    expect(handlers.sort()).toEqual(['assign', 'getClassTasks', 'review']);
    expect(Reflect.getMetadata('__guards__', HomeTasksController)).toContain(BehaviourAccessGuard);
    for (const h of handlers) expect(Reflect.getMetadata(BEHAVIOUR_POLICY_KEY, proto[h])).toBeDefined();
    expect(Reflect.getMetadata(BEHAVIOUR_POLICY_KEY, proto.getClassTasks).kind).toBe('staff_read');
    expect(Reflect.getMetadata(BEHAVIOUR_POLICY_KEY, proto.assign).kind).toBe('record_write');
  });

  it.each(['log', 'enforce'])('mode=%s: parent / student / reseller tokens are 403 on every route', async (mode) => {
    process.env.BEHAVIOUR_GUARD_MODE = mode;
    for (const h of handlers) for (const role of [UserRole.PARENT, UserRole.STUDENT, UserRole.RESELLER_ADMIN, UserRole.RESELLER_SUPPORT]) {
      await expect(guard().canActivate(ctx(h, user(role)))).rejects.toThrow(ForbiddenException);
    }
  });

  it('enforce: staff roles allowed, other staff roles (finance, hr, librarian, support) denied', async () => {
    process.env.BEHAVIOUR_GUARD_MODE = 'enforce';
    for (const h of handlers) {
      for (const role of [UserRole.SUPER_ADMIN, UserRole.INSTITUTION_OWNER, UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.VICE_PRINCIPAL, UserRole.ACADEMIC_COORDINATOR, UserRole.TEACHER]) {
        await expect(guard().canActivate(ctx(h, user(role)))).resolves.toBe(true);
      }
      for (const role of [UserRole.FINANCE_MANAGER, UserRole.HR_MANAGER, UserRole.LIBRARIAN, UserRole.SUPPORT_STAFF]) {
        await expect(guard().canActivate(ctx(h, user(role)))).rejects.toThrow(ForbiddenException);
      }
    }
  });

  it('log (default): every staff role passes, would-deny is logged', async () => {
    delete process.env.BEHAVIOUR_GUARD_MODE;
    await expect(guard().canActivate(ctx('getClassTasks', user(UserRole.FINANCE_MANAGER)))).resolves.toBe(true);
    expect(events()[0]).toMatchObject({ mode: 'log', decision: 'would_deny', role: 'finance_manager', route: '/api/v1/home-tasks/class' });
  });
});

// ---- service: teacher class scoping ----
function chain(result: any) {
  const o: any = {};
  ['select', 'sort', 'limit'].forEach((m) => { o[m] = () => o; });
  o.lean = () => Promise.resolve(result);
  return o;
}
const access = (over: Partial<BehaviourAccessContext> = {}): BehaviourAccessContext => ({ mode: 'enforce', enforce: true, role: 'teacher', isTeacher: true, elevated: false, route: '/api/v1/home-tasks/class', method: 'GET', ...over });
const logMode = () => access({ mode: 'log', enforce: false });
const adminAccess = () => access({ role: 'principal', isTeacher: false, elevated: true });
const TEACHER = { userId: new Types.ObjectId().toString(), name: 'Ms Noor', role: 'teacher' } as any;
const ADMIN = { userId: new Types.ObjectId().toString(), role: 'principal' } as any;

function build(rows: any[] = [], students: any[] = [], existingTask: any = { grade: 'Grade 5', section: 'A' }, hasStaff = true) {
  const model: any = {
    find: jest.fn(() => chain(rows)), insertMany: jest.fn(async (d: any[]) => d),
    findOne: jest.fn(() => chain(existingTask)), findOneAndUpdate: jest.fn(async () => ({ _id: 't' })),
  };
  const studentModel: any = { find: jest.fn(() => chain(students)) };
  const staffModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(hasStaff ? { _id: new Types.ObjectId() } : null) })) };
  const profile = { classTeacherAssignments: [{ gradeName: 'Grade 5', sectionName: 'A' }], currentAssignments: [] };
  const teacherProfileModel: any = { findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(profile) }), lean: () => Promise.resolve(profile) })) };
  const svc = new HomeTasksService(model, studentModel, { checkFeature: jest.fn() } as any, staffModel, teacherProfileModel);
  return { svc, model, studentModel, staffModel };
}
const oid = () => new Types.ObjectId().toString();

describe('HomeTasksService teacher scoping', () => {
  it('getClassTasks: own class OK and narrowed in enforce; another class 403', async () => {
    const { svc, model } = build([{ grade: 'Grade 5', section: 'A' }]);
    await expect(svc.getClassTasks('demo', 'Grade 5', 'A', TEACHER, access())).resolves.toHaveLength(1);
    expect((model.find.mock.calls as any[][])[0][0].$and).toHaveLength(1);
    await expect(build().svc.getClassTasks('demo', 'Grade 6', 'A', TEACHER, access())).rejects.toThrow(ForbiddenException);
    await expect(build().svc.getClassTasks('demo', 'Grade 5', 'B', TEACHER, access())).rejects.toThrow(ForbiddenException);
  });

  it('getClassTasks: a whole-grade request (no section) is allowed for a teacher of any section of it, narrowed to their sections', async () => {
    const { svc, model } = build([]);
    await expect(svc.getClassTasks('demo', '5', undefined, TEACHER, access())).resolves.toEqual([]);
    expect((model.find.mock.calls as any[][])[0][0].$and[0].$or[0].grade.test('Grade 5')).toBe(true);
  });

  it('getClassTasks (log mode): nothing changes, out-of-class access only logs', async () => {
    const { svc, model } = build([{ grade: 'Grade 5', section: 'A' }, { grade: 'Grade 6', section: 'B' }]);
    await expect(svc.getClassTasks('demo', 'Grade 6', 'B', TEACHER, logMode())).resolves.toHaveLength(2);
    expect((model.find.mock.calls as any[][])[0][0].$and).toBeUndefined();
    const reasons = events().map(e => e.reason);
    expect(reasons).toContain('teacher_class_not_assigned');
    expect(reasons.some(r => r.startsWith('teacher_scope_would_narrow'))).toBe(true);
  });

  it('getClassTasks: admins / coordinators are never class-scoped (no teacher lookup)', async () => {
    const { svc, staffModel, model } = build([]);
    await svc.getClassTasks('demo', 'Grade 9', undefined, ADMIN, adminAccess());
    expect(staffModel.findOne).not.toHaveBeenCalled();
    expect((model.find.mock.calls as any[][])[0][0].$and).toBeUndefined();
  });

  it('assign: all students must be in the teacher\'s classes (enforce 403 / log passes + logs)', async () => {
    const inClass = { _id: new Types.ObjectId(), firstName: 'A', lastName: 'B', currentGrade: 'Grade 5', currentSection: 'A' };
    const outClass = { _id: new Types.ObjectId(), firstName: 'C', lastName: 'D', currentGrade: 'Grade 6', currentSection: 'A' };
    const dto: any = { studentIds: [oid()], title: 't', assignedDate: '2026-09-01' };
    await expect(build([], [inClass]).svc.assign('demo', dto, 'Ms Noor', TEACHER.userId, TEACHER, access({ method: 'POST' }))).resolves.toEqual({ assigned: 1 });
    await expect(build([], [inClass, outClass]).svc.assign('demo', dto, 'Ms Noor', TEACHER.userId, TEACHER, access({ method: 'POST' }))).rejects.toThrow(ForbiddenException);
    await expect(build([], [inClass, outClass]).svc.assign('demo', dto, 'Ms Noor', TEACHER.userId, TEACHER, { ...logMode(), method: 'POST' })).resolves.toEqual({ assigned: 2 });
    expect(events().some(e => e.reason === 'teacher_student_outside_classes' && e.mode === 'log')).toBe(true);
  });

  it('review: a task of another class is 403 for a teacher in enforce; own class and admins are fine', async () => {
    const dto: any = { reviewRating: 4 };
    await expect(build([], [], { grade: 'Grade 6', section: 'A' }).svc.review('demo', oid(), dto, TEACHER, access({ method: 'PATCH' }))).rejects.toThrow(ForbiddenException);
    await expect(build([], [], { grade: 'Grade 5', section: 'A' }).svc.review('demo', oid(), dto, TEACHER, access({ method: 'PATCH' }))).resolves.toBeDefined();
    await expect(build([], [], { grade: 'Grade 6', section: 'A' }).svc.review('demo', oid(), dto, ADMIN, adminAccess())).resolves.toBeDefined();
  });

  it('a teacher with no Staff record: enforce 403, log mode allows and logs', async () => {
    await expect(build([], [], undefined, false).svc.getClassTasks('demo', 'Grade 5', 'A', TEACHER, access())).rejects.toThrow(ForbiddenException);
    await expect(build([], [], undefined, false).svc.getClassTasks('demo', 'Grade 5', 'A', TEACHER, logMode())).resolves.toBeDefined();
  });

  it('existing 3-argument construction (no scope models) still works unscoped', async () => {
    const model: any = { find: jest.fn(() => chain([])), insertMany: jest.fn(async (d: any[]) => d) };
    const svc = new HomeTasksService(model, { find: jest.fn(() => chain([])) } as any, { checkFeature: jest.fn() } as any);
    await expect(svc.getClassTasks('demo', 'Grade 5', 'A', TEACHER, access())).resolves.toEqual([]);
  });
});
