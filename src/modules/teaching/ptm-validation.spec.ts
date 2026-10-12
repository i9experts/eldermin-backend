import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PTMService } from './ptm.service';
import { PTMController } from './ptm.controller';
import { assertValidDate } from '../../common/utils/object-id.util';
import { StaffPortalService } from '../../staff-portal/staff-portal.service';

const oid = () => new Types.ObjectId().toString();
const chain = (v: any) => { const c: any = { select: () => c, sort: () => c, limit: () => c, lean: () => Promise.resolve(v) }; return c; };

function make() {
  const saved: any[] = [];
  function PtmModel(this: any, d: any) { Object.assign(this, d); this.save = jest.fn(async () => { saved.push(this); return this; }); }
  (PtmModel as any).find = jest.fn(() => chain([]));
  const studentModel: any = { findById: jest.fn(() => chain({ _id: 's', firstName: 'A', lastName: 'B', guardians: [] })) };
  const staffModel: any = { findById: jest.fn(() => chain({ firstName: 'T', lastName: 'T' })), db: { collection: () => ({ findOne: async () => null }) } };
  const emailService: any = { sendEmail: jest.fn(async () => ({ sent: false })) };
  const service = new PTMService(PtmModel as any, studentModel, staffModel, emailService, undefined, undefined);
  jest.spyOn(service as any, 'notifyGuardians').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'notifyTeacher').mockResolvedValue(undefined);
  return { service, PtmModel, saved, studentModel };
}
const admin = { role: 'admin', userId: oid(), campusId: oid() };
const good = { studentId: oid(), teacherId: oid(), scheduledDate: '2026-10-20', startTime: '10:00', endTime: '10:15' };

describe('PTM create validation (400 instead of 500)', () => {
  it('valid body still creates a meeting (admin)', async () => {
    const m = make();
    await expect(m.service.createMeeting('t', 'i', good, 'Admin', undefined, admin as any)).resolves.toBeDefined();
    expect(m.saved.length).toBeGreaterThan(0); // saved (twice: create + notification status)
  });
  it.each([
    [{ ...good, scheduledDate: 'not a date' }, 'scheduledDate must be a valid date'],
    [{ ...good, scheduledDate: undefined }, 'scheduledDate is required'],
    [{ ...good, scheduledDate: '' }, 'scheduledDate is required'],
    [{ ...good, scheduledDate: { a: 1 } }, 'scheduledDate must be a valid date'],
    [{ ...good, studentId: 'abc' }, 'Invalid student id'],
    [{ ...good, studentId: undefined }, 'Invalid student id'],
    [{ ...good, teacherId: 'abc' }, 'Invalid teacher id'],
  ])('%j -> 400 %s, nothing saved', async (body: any, text: string) => {
    const m = make();
    await expect(m.service.createMeeting('t', 'i', body, 'Admin', undefined, admin as any)).rejects.toThrow(text);
    await expect(m.service.createMeeting('t', 'i', body, 'Admin', undefined, admin as any)).rejects.toThrow(BadRequestException);
    expect(m.saved).toHaveLength(0);
    expect(m.studentModel.findById).not.toHaveBeenCalled();
  });
});

describe('PTM list / upcoming validation', () => {
  it('valid filters still query (admin)', async () => {
    const m = make();
    await expect(m.service.getMeetings('t', { teacherId: oid(), studentId: oid(), from: '2026-10-01', to: '2026-10-31' }, admin as any)).resolves.toEqual([]);
  });
  it.each([
    [{ teacherId: 'abc' }, 'Invalid teacher id'],
    [{ studentId: 'abc' }, 'Invalid student id'],
    [{ from: 'x' }, 'from must be a valid date'],
    [{ to: 'x' }, 'to must be a valid date'],
  ])('%j -> 400', async (q: any, text: string) => {
    const m = make();
    await expect(m.service.getMeetings('t', q, admin as any)).rejects.toThrow(text);
  });
  it('upcoming/mine with a bad teacherId -> 400', async () => {
    const m = make();
    await expect(m.service.getUpcomingForTeacher('abc', 't')).rejects.toThrow('Invalid teacher id');
  });
  it('controller path (teacherId=abc) -> 400', async () => {
    const m = make();
    const ctl = new PTMController(m.service);
    await expect(ctl.getMeetings({ user: { ...admin, tenantId: 't' } }, { teacherId: 'abc' })).rejects.toThrow(BadRequestException);
  });
});

describe('assertValidDate', () => {
  it.each(['2026-10-20', '2026-10-20T10:00:00Z', new Date(), 0])('accepts %s', (v: any) => { expect(() => assertValidDate(v, 'd', true)).not.toThrow(); });
  it('optional: absent ok, junk rejected', () => {
    expect(() => assertValidDate(undefined, 'd')).not.toThrow();
    expect(() => assertValidDate('zzz', 'd')).toThrow(BadRequestException);
  });
});

describe('notification read with a malformed id', () => {
  it('-> 400 for the caller, the notification model is never queried', async () => {
    const notificationModel: any = { findOneAndUpdate: jest.fn() };
    const noop: any = {};
    const service = new StaffPortalService(noop, noop, noop, noop, noop, noop, noop, notificationModel, noop, noop, noop, noop, noop, noop);
    await expect(service.markNotificationRead({ userId: oid(), tenantId: 't', schoolSlug: 's' } as any, 'not-an-id')).rejects.toThrow('Invalid notification id');
    expect(notificationModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('a valid id still marks read', async () => {
    const doc = { _id: 'x', isRead: true };
    const notificationModel: any = { findOneAndUpdate: jest.fn(async () => doc) };
    const noop: any = {};
    const service = new StaffPortalService(noop, noop, noop, noop, noop, noop, noop, notificationModel, noop, noop, noop, noop, noop, noop);
    await expect(service.markNotificationRead({ userId: oid(), tenantId: 't', schoolSlug: 's' } as any, oid())).resolves.toBe(doc);
  });
});
