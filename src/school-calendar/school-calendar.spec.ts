import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SchoolCalendarService } from './school-calendar.service';

// Fakes only (no DB).
const chain = (v: any) => {
  const c: any = { select: () => c, sort: () => c, limit: () => c, lean: () => Promise.resolve(v), then: (r: any, j: any) => Promise.resolve(v).then(r, j) };
  return c;
};

export function makeCalendar(opts: any = {}) {
  const eventModel: any = { find: jest.fn(() => chain(opts.manual ?? [])) };
  const invoiceModel: any = { find: jest.fn(() => chain(opts.invoices ?? [{ dueDate: new Date('2026-10-20T00:00:00Z'), balanceDue: 1500 }])) };
  const assessmentModel: any = { find: jest.fn(() => chain(opts.assessments ?? [])) };
  const academicYearModel: any = { find: jest.fn(() => chain([])) };
  const circularModel: any = {
    find: jest.fn(() => chain(opts.circulars ?? [])),
    findOne: jest.fn(() => chain(opts.circular ?? null)),
  };
  const ackModel: any = { findOneAndUpdate: jest.fn(async () => ({})), find: jest.fn(() => chain(opts.acks ?? [])) };
  const staffModel: any = { findOne: jest.fn(() => chain(opts.staff ?? null)), find: jest.fn(() => chain([])) };
  const userModel: any = { find: jest.fn(() => chain([])), findOne: jest.fn(() => chain(opts.userDoc ?? null)) };
  const tenantModel: any = { findOne: jest.fn(() => chain({ _id: 't1' })) };
  const noop: any = {};
  const service = new SchoolCalendarService(
    eventModel, circularModel, ackModel, invoiceModel, noop, staffModel, userModel, tenantModel, noop, assessmentModel, academicYearModel, noop,
  );
  return { service, eventModel, invoiceModel, assessmentModel, circularModel, ackModel, staffModel, userModel };
}

const range = { from: '2026-10-01', to: '2026-10-31' };

describe('SchoolCalendarService.getEvents (fee rows)', () => {
  it.each(['admin', 'principal', 'finance_manager', 'parent', 'institution_owner'])('%s still gets the fee-due rows (unchanged)', async (role) => {
    const { service, invoiceModel } = makeCalendar();
    const rows: any[] = await service.getEvents('s', range, { role });
    expect(invoiceModel.find).toHaveBeenCalled();
    const fee = rows.filter((r) => r.type === 'fee_due');
    expect(fee).toHaveLength(1);
    expect(fee[0]).toMatchObject({ source: 'finance', description: 'Total outstanding: 1500.00' });
  });

  it('no user (legacy call) keeps the fee rows', async () => {
    const { service } = makeCalendar();
    expect((await service.getEvents('s', range)).some((r: any) => r.type === 'fee_due')).toBe(true);
  });

  it('teacher: no fee rows, and the invoice collection is never read', async () => {
    const { service, invoiceModel } = makeCalendar({ manual: [{ title: 'Holiday', type: 'holiday', startDate: new Date('2026-10-10'), endDate: new Date('2026-10-10') }] });
    const rows: any[] = await service.getEvents('s', range, { role: 'teacher' });
    expect(invoiceModel.find).not.toHaveBeenCalled();
    expect(rows.some((r) => r.type === 'fee_due' || r.source === 'finance')).toBe(false);
    expect(JSON.stringify(rows)).not.toMatch(/outstanding|Fee Due/i);
    expect(rows.map((r) => r.title)).toEqual(['Holiday']);
  });

  it('teacher: manual rows carry no createdBy / schoolSlug; other roles keep them', async () => {
    const manual = [{ title: 'Holiday', type: 'holiday', createdBy: 'Admin Name', schoolSlug: 's', startDate: new Date('2026-10-10'), endDate: new Date('2026-10-10') }];
    const t: any[] = await makeCalendar({ manual }).service.getEvents('s', range, { role: 'teacher' });
    expect(t[0]).toMatchObject({ title: 'Holiday', source: 'manual' });
    expect('createdBy' in t[0]).toBe(false);
    expect('schoolSlug' in t[0]).toBe(false);
    for (const role of ['admin', 'principal', 'parent']) {
      const r: any[] = (await makeCalendar({ manual }).service.getEvents('s', range, { role })).filter((x: any) => x.source === 'manual');
      expect(r[0]).toMatchObject({ createdBy: 'Admin Name', schoolSlug: 's' });
    }
    expect(manual[0].createdBy).toBe('Admin Name'); // source row not mutated
  });

  it('teacher: a manual row typed fee_due is also dropped', async () => {
    const { service } = makeCalendar({ manual: [{ title: 'X', type: 'fee_due', startDate: new Date('2026-10-10'), endDate: new Date('2026-10-10') }] });
    expect(await service.getEvents('s', range, { role: 'teacher' })).toHaveLength(0);
  });
});

describe('SchoolCalendarService.getEvents (exam label)', () => {
  const a = (grade: string, section?: string) => ({ _id: 'e1', title: 'T', type: 'unit_test', grade, section, startDate: new Date('2026-10-10'), endDate: null, campusId: null });
  it.each([
    ['Grade 5', 'A', 'unit test — Grade 5 A'],
    ['grade 5', undefined, 'unit test — grade 5'],
    ['5', 'B', 'unit test — Grade 5 B'],
  ])('grade %s section %s -> %s', async (grade, section, expected) => {
    const { service } = makeCalendar({ assessments: [a(grade, section)] });
    const rows: any[] = await service.getEvents('s', range, { role: 'admin' });
    expect(rows.find((r) => r.type === 'exam').description).toBe(expected);
  });
});

// ─── Circulars (teacher role) ───────────────────────────────────────────────
const ME = 'a'.repeat(24);           // my user id
const MY_STAFF = 'b'.repeat(24);     // my Staff._id
const OTHER = 'c'.repeat(24);
const C1 = 'd'.repeat(24);           // my campus
const C2 = 'e'.repeat(24);
const CID = 'f'.repeat(24);           // another campus
const circ = (id: string, over: any = {}) => ({
  _id: id, title: id, body: 'b', status: 'published', requiresAcknowledgment: true, createdAt: new Date(),
  audience: { roles: ['staff'], scope: 'school', campusId: null, individualStaffIds: [], userIds: [] }, ...over,
});
const aud = (over: any) => ({ audience: { roles: ['staff'], scope: 'school', campusId: null, individualStaffIds: [], userIds: [], ...over } });
const ALL = [
  circ('staff-school'),
  circ('fee-staff', { category: 'fee' }),
  circ('draft', { status: 'draft' }),
  circ('scheduled', { status: 'scheduled' }),
  circ('parents-only', aud({ roles: ['parent'] })),
  circ('students-only', aud({ roles: ['student'] })),
  circ('staff-and-parents', aud({ roles: ['parent', 'staff'] })),
  circ('my-campus', aud({ scope: 'campus', campusId: C1 })),
  circ('other-campus', aud({ scope: 'campus', campusId: C2 })),
  circ('grade-staff', aud({ scope: 'grade' })),
  circ('indiv-me', aud({ scope: 'individual', roles: [], individualStaffIds: [MY_STAFF] })),
  circ('indiv-me-user', aud({ scope: 'individual', roles: [], userIds: [ME] })),
  circ('indiv-other', aud({ scope: 'individual', roles: [], individualStaffIds: [OTHER], userIds: [OTHER] })),
];
const teacherUser = { userId: ME, role: 'teacher', campusId: C1 };
const staffDoc = { _id: MY_STAFF, campusId: C1 };

// find() honours the status/category filter like Mongo would
function circFind(rows: any[]) {
  return jest.fn((f: any) => {
    const r = rows.filter((c) => (!f.status || c.status === f.status) && (!f.category || c.category === f.category));
    const c: any = { sort: () => c, limit: () => c, lean: () => Promise.resolve(r) };
    return c;
  });
}

describe('SchoolCalendarService circulars: teacher', () => {
  it('list: only published circulars addressed to the teacher (audience + campus)', async () => {
    const { service, circularModel } = makeCalendar({ staff: staffDoc });
    circularModel.find = circFind(ALL);
    const ids = (await service.getCirculars('s', {}, teacherUser)).map((c: any) => c._id).sort();
    expect(ids).toEqual(['grade-staff', 'indiv-me', 'indiv-me-user', 'my-campus', 'staff-and-parents', 'staff-school'].sort());
  });

  it('list: a ?status=draft query cannot widen the teacher list', async () => {
    const { service, circularModel } = makeCalendar({ staff: staffDoc });
    circularModel.find = circFind(ALL);
    const rows = await service.getCirculars('s', { status: 'draft' }, teacherUser);
    expect(rows.some((c: any) => c.status !== 'published')).toBe(false);
  });

  it('teacher with no campus anywhere (token and Staff record): every circular route -> 403 with the exact message', async () => {
    const msg = 'No campus assigned \u2014 contact your administrator';
    const u = { userId: ME, role: 'teacher' };
    const m = makeCalendar({ staff: { _id: MY_STAFF }, circular: ALL[0] });
    m.circularModel.find = circFind(ALL);
    await expect(m.service.getCirculars('s', {}, u)).rejects.toThrow(msg);
    await expect(m.service.getCircularById('s', CID, u)).rejects.toThrow(ForbiddenException);
    await expect(m.service.acknowledgeCircular('s', CID, ME, 'Me', u)).rejects.toThrow(msg);
    await expect(m.service.getAcknowledgmentStatus('s', CID, u)).rejects.toThrow(ForbiddenException);
    expect(m.ackModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('teacher whose token has no campus but whose Staff record has one still works (DB fallback)', async () => {
    const { service, circularModel } = makeCalendar({ staff: staffDoc });
    circularModel.find = circFind(ALL);
    const ids = (await service.getCirculars('s', {}, { userId: ME, role: 'teacher' })).map((c: any) => c._id);
    expect(ids).toContain('my-campus');
  });

  it.each(['admin', 'principal', 'hr_manager', 'parent'])('%s without a campus is unchanged (no 403)', async (role) => {
    const { service, circularModel } = makeCalendar({ staff: { _id: MY_STAFF } });
    circularModel.find = circFind(ALL);
    expect((await service.getCirculars('s', {}, { userId: ME, role })).length).toBe(ALL.length);
  });

  it.each(['admin', 'principal', 'hr_manager', 'parent', 'institution_owner'])('%s: list unchanged (every status and audience)', async (role) => {
    const { service, circularModel } = makeCalendar();
    circularModel.find = circFind(ALL);
    expect((await service.getCirculars('s', {}, { userId: ME, role })).length).toBe(ALL.length);
    expect((await service.getCirculars('s', { status: 'draft' }, { userId: ME, role })).map((c: any) => c._id)).toEqual(['draft']);
  });

  it('by id: draft / parent-only / other-campus / someone else\'s individual -> 404 for the teacher; staff one is readable', async () => {
    for (const id of ['draft', 'scheduled', 'parents-only', 'other-campus', 'indiv-other']) {
      const { service } = makeCalendar({ staff: staffDoc, circular: ALL.find((c) => c._id === id) });
      await expect(service.getCircularById('s', CID, teacherUser)).rejects.toThrow(NotFoundException);
    }
    const { service } = makeCalendar({ staff: staffDoc, circular: ALL[0] });
    expect((await service.getCircularById('s', CID, teacherUser) as any)._id).toBe('staff-school');
  });

  it('fee-category circular: hidden from the teacher on list, by id, acknowledge and acknowledgment-status; admin/parent/hr_manager unchanged', async () => {
    const { service, circularModel } = makeCalendar({ staff: staffDoc });
    circularModel.find = circFind(ALL);
    expect((await service.getCirculars('s', {}, teacherUser)).map((c: any) => c._id)).not.toContain('fee-staff');
    expect((await service.getCirculars('s', { category: 'fee' }, teacherUser))).toEqual([]);
    const fee = ALL.find((c) => c._id === 'fee-staff');
    const m = makeCalendar({ staff: staffDoc, circular: fee });
    await expect(m.service.getCircularById('s', CID, teacherUser)).rejects.toThrow(NotFoundException);
    await expect(m.service.getAcknowledgmentStatus('s', CID, teacherUser)).rejects.toThrow(NotFoundException);
    await expect(m.service.acknowledgeCircular('s', CID, ME, 'Me', teacherUser)).rejects.toThrow(ForbiddenException);
    expect(m.ackModel.findOneAndUpdate).not.toHaveBeenCalled();
    for (const role of ['admin', 'hr_manager', 'parent']) {
      expect((await m.service.getCircularById('s', CID, { role, userId: ME }) as any)._id).toBe('fee-staff');
      await m.service.acknowledgeCircular('s', CID, ME, 'Me', { role, userId: ME });
    }
    expect(m.ackModel.findOneAndUpdate).toHaveBeenCalledTimes(3);
  });

  it('by id: admin still reads a draft', async () => {
    const { service } = makeCalendar({ circular: ALL.find((c) => c._id === 'draft') });
    expect((await service.getCircularById('s', CID, { role: 'admin' }) as any)._id).toBe('draft');
  });

  describe('acknowledgment-status', () => {
    const run = async (user: any) => {
      const m = makeCalendar({ staff: staffDoc, circular: ALL[0], acks: [{ userId: new Types.ObjectId(ME) }] });
      jest.spyOn(m.service as any, 'resolveAudience').mockResolvedValue([
        { userId: ME, name: 'Me' }, { userId: OTHER, name: 'Colleague Name' },
      ]);
      return m.service.getAcknowledgmentStatus('s', CID, user);
    };
    it('teacher: counts only, no names', async () => {
      const r: any = await run(teacherUser);
      expect(r).toMatchObject({ requiresAcknowledgment: true, total: 2, acknowledged: 1, pending: [] });
      expect(JSON.stringify(r)).not.toContain('Colleague Name');
    });
    it.each(['admin', 'principal', 'hr_manager'])('%s: still gets the pending names', async (role) => {
      const r: any = await run({ userId: OTHER, role });
      expect(r.pending).toEqual([{ userId: OTHER, name: 'Colleague Name' }]);
    });
    it('teacher who is not a recipient -> 404', async () => {
      const m = makeCalendar({ staff: staffDoc, circular: ALL.find((c) => c._id === 'parents-only') });
      await expect(m.service.getAcknowledgmentStatus('s', CID, teacherUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('acknowledge', () => {
    it('teacher recipient: stored for the token user only', async () => {
      const m = makeCalendar({ staff: staffDoc, circular: ALL[0] });
      await m.service.acknowledgeCircular('s', CID, ME, 'Me', teacherUser);
      const [filter] = m.ackModel.findOneAndUpdate.mock.calls[0];
      expect(String(filter.userId)).toBe(ME);
    });
    it.each(['draft', 'scheduled', 'parents-only', 'other-campus', 'indiv-other'])('teacher non-recipient (%s) -> 403, nothing written', async (id) => {
      const m = makeCalendar({ staff: staffDoc, circular: ALL.find((c) => c._id === id) });
      await expect(m.service.acknowledgeCircular('s', CID, ME, 'Me', teacherUser)).rejects.toThrow(ForbiddenException);
      expect(m.ackModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
    it.each(['admin', 'parent', 'hr_manager'])('%s: acknowledge unchanged (no audience check)', async (role) => {
      const m = makeCalendar({ circular: ALL.find((c) => c._id === 'parents-only') });
      await m.service.acknowledgeCircular('s', CID, ME, 'Me', { role, userId: ME });
      expect(m.ackModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  it('controller passes req.user to every circular route', async () => {
    const m = makeCalendar({ staff: staffDoc, circular: ALL[0] });
    m.circularModel.find = circFind(ALL);
    const { SchoolCalendarController } = require('./school-calendar.controller');
    const ctl = new SchoolCalendarController(m.service);
    const req = { user: { ...teacherUser, schoolSlug: 's', name: 'Me' } };
    expect((await ctl.getCirculars(req, {})).some((c: any) => c._id === 'draft')).toBe(false);
    await expect(ctl.acknowledgeCircular({ user: { ...req.user } }, CID)).resolves.toBeDefined();
  });
});

describe('SchoolCalendarService circulars: malformed id -> 400 (every role, nothing queried)', () => {
  const BAD = ['not-an-id', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', '', 'a'.repeat(25)];
  it.each(['teacher', 'admin', 'principal', 'parent', 'hr_manager'])('%s: every :id circular route throws 400 and never touches the DB', async (role) => {
    const user = { role, userId: ME, campusId: C1 };
    for (const bad of BAD) {
      const m = makeCalendar({ staff: staffDoc });
      for (const call of [
        () => m.service.getCircularById('s', bad, user),
        () => m.service.updateCircular('s', bad, {}),
        () => m.service.deleteCircular('s', bad),
        () => m.service.publishCircular('s', bad),
        () => m.service.acknowledgeCircular('s', bad, ME, 'Me', user),
        () => m.service.getAcknowledgmentStatus('s', bad, user),
      ]) {
        await expect(call()).rejects.toThrow(BadRequestException);
      }
      expect(m.circularModel.findOne).not.toHaveBeenCalled();
    }
  });
  it('a well-formed but unknown id is still 404', async () => {
    const m = makeCalendar();
    await expect(m.service.getCircularById('s', CID, { role: 'admin' })).rejects.toThrow(NotFoundException);
  });
});
