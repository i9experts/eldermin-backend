import { Types } from 'mongoose';
import { ParentPortalService } from './parent-portal.service';

const oid = () => new Types.ObjectId();
const T1 = oid(); const T2 = oid(); const CAMPUS_A = oid(); const CAMPUS_B = oid();

/** Minimal service double: only the collaborators notifyLeaveRecipients touches. */
function build(opts: { profiles: any[]; staff: Record<string, any>; admins?: any[] }) {
  const created: any[] = [];
  const profileFind = jest.fn((q: any) => ({ toArray: async () => opts.profiles.filter((p) => q.tenantId.$in.some((x: any) => String(x) === String(p.tenantId)) && p.isClassTeacher) }));
  const s: any = Object.create(ParentPortalService.prototype);
  s.reportCardModel = { db: { collection: () => ({ find: profileFind }) } };
  s.staffModel = { findOne: jest.fn((q: any) => ({ select: () => ({ lean: async () => {
    const st = opts.staff[String(q._id)];
    return st && String(st.tenantId) === String(q.tenantId.$in[1]) && st.isActive !== false ? st : null;
  } }) })) };
  s.userModel = { find: jest.fn((q: any) => ({ select: () => ({ limit: () => ({ lean: async () => (opts.admins || []).filter((u) => String(u.tenantId) === String(q.tenantId.$in[1])) }) }) })) };
  s.notificationModel = { create: jest.fn(async (d: any) => { created.push(d); return d; }) };
  return { s: s as ParentPortalService, created, profileFind };
}
const leave = { _id: oid(), studentName: 'Kid' };
const data = { fromDate: '2026-10-29', toDate: '2026-10-29', reason: 'sick' };
const student = (extra: any = {}) => ({ tenantId: T1, currentGrade: 'Grade 6', currentSection: 'A', campusId: CAMPUS_A, ...extra });
const profile = (tenantId: any, staffId: any, extra: any = {}) => ({ tenantId, staffId, isClassTeacher: true, classTeacherAssignments: [{ gradeName: 'Grade 6', sectionName: 'A' }], ...extra });

describe('student leave routing (R1): scoped to the student\'s school', () => {
  it('a class teacher of the SAME grade/section in ANOTHER school is never notified; the student school\'s admins are', async () => {
    const otherTeacher = oid(); const otherUser = oid(); const adminUser = oid();
    const { s, created } = build({
      profiles: [profile(T2, otherTeacher)],
      staff: { [String(otherTeacher)]: { tenantId: T2, userId: otherUser } },
      admins: [{ _id: adminUser, tenantId: T1 }, { _id: oid(), tenantId: T2 }],
    });
    await s.notifyLeaveRecipients(student(), leave, 'demo', data, { tenantId: String(T1) } as any);
    expect(created.map((c) => String(c.recipientUserId))).toEqual([String(adminUser)]);
    expect(created.some((c) => String(c.recipientUserId) === String(otherUser))).toBe(false);
    expect(created[0].title).toMatch(/no class teacher/i);
  });
  it('the school\'s own class teacher is notified (and only them, no admin fan-out)', async () => {
    const t = oid(); const u = oid();
    const { s, created } = build({ profiles: [profile(T2, oid()), profile(T1, t)], staff: { [String(t)]: { tenantId: T1, userId: u } }, admins: [{ _id: oid(), tenantId: T1 }] });
    await s.notifyLeaveRecipients(student(), leave, 'demo', data, undefined);
    expect(created).toHaveLength(1);
    expect(String(created[0].recipientUserId)).toBe(String(u));
    expect(created[0].title).toBe('New leave request');
  });
  it('legacy singular class-teacher fields are still honoured', async () => {
    const t = oid(); const u = oid();
    const { s, created } = build({ profiles: [{ tenantId: T1, staffId: t, isClassTeacher: true, classTeacherOfGradeName: 'Grade 6', classTeacherOfSectionName: 'A' }], staff: { [String(t)]: { tenantId: T1, userId: u } } });
    await s.notifyLeaveRecipients(student(), leave, 'demo', data, undefined);
    expect(String(created[0].recipientUserId)).toBe(String(u));
  });
  it('campus: a class teacher of another campus of the same school is skipped; a campus-less profile still matches', async () => {
    const tB = oid(); const uB = oid(); const tN = oid(); const uN = oid();
    const { s, created } = build({
      profiles: [profile(T1, tB, { campusId: CAMPUS_B }), profile(T1, tN)],
      staff: { [String(tB)]: { tenantId: T1, userId: uB }, [String(tN)]: { tenantId: T1, userId: uN } },
    });
    await s.notifyLeaveRecipients(student(), leave, 'demo', data, undefined);
    expect(created.map((c) => String(c.recipientUserId))).toEqual([String(uN)]);
  });
  it('a deactivated class teacher is skipped and the next candidate (or the admins) is used', async () => {
    const t = oid(); const adminUser = oid();
    const { s, created } = build({ profiles: [profile(T1, t)], staff: { [String(t)]: { tenantId: T1, userId: oid(), isActive: false } }, admins: [{ _id: adminUser, tenantId: T1 }] });
    await s.notifyLeaveRecipients(student(), leave, 'demo', data, undefined);
    expect(created.map((c) => String(c.recipientUserId))).toEqual([String(adminUser)]);
  });
  it('no class teacher and no admins in the school -> nobody is notified (and nothing throws)', async () => {
    const { s, created } = build({ profiles: [profile(T2, oid())], staff: {}, admins: [{ _id: oid(), tenantId: T2 }] });
    await s.notifyLeaveRecipients(student(), leave, 'demo', data, undefined);
    expect(created).toHaveLength(0);
  });
  it('the school cannot be determined -> nobody is notified (never guess across schools)', async () => {
    const { s, created, profileFind } = build({ profiles: [profile(T1, oid())], staff: {} });
    await s.notifyLeaveRecipients({ currentGrade: 'Grade 6', currentSection: 'A' }, leave, 'demo', data, undefined);
    expect(created).toHaveLength(0);
    expect(profileFind).not.toHaveBeenCalled();
  });
});
