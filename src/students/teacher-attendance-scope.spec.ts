import { ForbiddenException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { TeacherAttendanceScopeService, classTeacherClassesOf, hasClassTeacherClaims, teacherScopeGuardMode } from './teacher-attendance-scope.service';

const ENV = 'TEACHER_SCOPE_GUARD_MODE';
let warn: jest.SpyInstance;
beforeEach(() => { delete process.env[ENV]; warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
afterEach(() => { warn.mockRestore(); delete process.env[ENV]; });
const lines = () => warn.mock.calls.map((c) => { try { return JSON.parse(String(c[0])); } catch { return null; } }).filter((x) => x?.event === 'teacher_scope_guard');

function svc(opts: { staff?: any; profile?: any }) {
  const staffModel: any = { findOne: jest.fn(() => ({ lean: async () => opts.staff ?? null })) };
  const profileModel: any = { findOne: jest.fn(() => ({ select: () => ({ lean: async () => opts.profile ?? null }) })) };
  return { s: new TeacherAttendanceScopeService(staffModel, profileModel), staffModel, profileModel };
}
const uid = new Types.ObjectId().toHexString();
const teacher = (extra: any = {}) => ({ userId: uid, role: 'teacher', name: 'T', tenantId: 't', schoolSlug: 's', ...extra });
const staff = { _id: new Types.ObjectId(), firstName: 'A', lastName: 'B' };
const rec = (grade: string, section?: string) => ({ grade, section });

describe('teacher attendance scope (R1 item 2): only the class teacher marks, and only their own class', () => {
  it('mode defaults to log; only the exact word enforce enforces', () => {
    expect(teacherScopeGuardMode()).toBe('log');
    process.env[ENV] = 'enforce'; expect(teacherScopeGuardMode()).toBe('enforce');
    process.env[ENV] = 'yes'; expect(teacherScopeGuardMode()).toBe('log');
  });
  it('helpers: claims shapes and class-teacher classes (subject assignments never count)', () => {
    expect(hasClassTeacherClaims({ classTeacherAssignments: [{ gradeName: 'G5' }] })).toBe(true);
    expect(hasClassTeacherClaims({ classTeacherOfGradeName: 'G5' })).toBe(true);
    expect(hasClassTeacherClaims({ classTeacherAssignments: [] })).toBe(false);
    expect(classTeacherClassesOf({ isClassTeacher: true, classTeacherOfGradeName: 'Grade 5', classTeacherOfSectionName: 'A', currentAssignments: [{ gradeLevel: 'Grade 6', sectionName: 'B' }] })).toEqual([{ grade: 'Grade 5', section: 'A' }]);
    expect(classTeacherClassesOf({ isClassTeacher: false, classTeacherOfGradeName: 'Grade 5' })).toEqual([]);
    expect(classTeacherClassesOf({ currentAssignments: [{ gradeLevel: 'Grade 6' }] })).toEqual([]);
  });
  it('a subject teacher (no class-teacher claims, not a class teacher in the DB) marking ANY class: ENFORCE 403 / LOG proceeds with a would_deny line', async () => {
    const { s } = svc({ staff, profile: { isClassTeacher: false, currentAssignments: [{ gradeLevel: 'Grade 6', sectionName: 'A', subjectName: 'Maths' }] } });
    process.env[ENV] = 'enforce';
    await expect(s.assertMayMark(teacher(), [rec('Grade 6', 'A')], 'POST /students/attendance/bulk')).rejects.toBeInstanceOf(ForbiddenException);
    expect(lines()[0]).toMatchObject({ mode: 'enforce', decision: 'denied', reason: 'teacher_not_class_teacher', route: 'POST /students/attendance/bulk' });
    delete process.env[ENV];
    await expect(s.assertMayMark(teacher(), [rec('Grade 6', 'A')], 'r')).resolves.toBeUndefined();
    expect(lines().pop()).toMatchObject({ mode: 'log', decision: 'would_deny' });
  });
  it('a teacher with no Staff row is not a class teacher (would-deny, never a crash)', async () => {
    const { s } = svc({ staff: null });
    process.env[ENV] = 'enforce';
    await expect(s.assertMayMark(teacher(), [rec('Grade 5', 'A')], 'r')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('a class teacher whose TOKEN predates the assignment is allowed for exactly their classes (DB truth) and refused elsewhere', async () => {
    const { s } = svc({ staff, profile: { isClassTeacher: true, classTeacherOfGradeName: 'Grade 5', classTeacherOfSectionName: 'A' } });
    process.env[ENV] = 'enforce';
    await expect(s.assertMayMark(teacher(), [rec('Grade 5', 'A'), rec('Grade 5', 'A')], 'r')).resolves.toBeUndefined();
    await expect(s.assertMayMark(teacher(), [rec('Grade 5', 'A'), rec('Grade 6', 'A')], 'r')).rejects.toBeInstanceOf(ForbiddenException);
    expect(lines().pop()).toMatchObject({ reason: 'teacher_marks_other_class' });
  });
  it('a token WITH class-teacher claims, and every non-teacher role, is not evaluated here (no DB read)', async () => {
    const { s, staffModel } = svc({});
    process.env[ENV] = 'enforce';
    await expect(s.assertMayMark(teacher({ classTeacherAssignments: [{ gradeName: 'Grade 5', sectionName: 'A' }] }), [rec('Grade 9')], 'r')).resolves.toBeUndefined();
    for (const role of ['principal', 'admin', 'academic_coordinator', 'vice_principal', 'institution_owner', 'super_admin', 'support_staff']) {
      await expect(s.assertMayMark({ userId: uid, role }, [rec('Grade 9')], 'r')).resolves.toBeUndefined();
    }
    expect(staffModel.findOne).not.toHaveBeenCalled();
    expect(lines()).toHaveLength(0);
  });
  it('revert by id (no records) only requires being a class teacher', async () => {
    const yes = svc({ staff, profile: { classTeacherAssignments: [{ gradeName: 'Grade 5', sectionName: 'A' }] } });
    const no = svc({ staff, profile: {} });
    process.env[ENV] = 'enforce';
    await expect(yes.s.assertMayMark(teacher(), [], 'DELETE')).resolves.toBeUndefined();
    await expect(no.s.assertMayMark(teacher(), [], 'DELETE')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
