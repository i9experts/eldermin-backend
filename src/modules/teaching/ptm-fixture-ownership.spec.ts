import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PTMService } from './ptm.service';
import { SubstitutionService } from './substitution.service';
import { PTMController } from './ptm.controller';
import { SubstitutionController } from './substitution.controller';

// Fakes only (no DB).
const oid = () => new Types.ObjectId();
const MY_USER = oid().toString();
const MY_STAFF = oid();
const OTHER_STAFF = oid();
const TENANT = 't1';
const chain = (v: any) => { const c: any = { select: () => c, lean: () => Promise.resolve(v) }; return c; };
const notForbidden = (p: Promise<any>) => p.then(() => undefined, (e) => { expect(e).not.toBeInstanceOf(ForbiddenException); });
const teacher = { userId: MY_USER, role: 'teacher', name: 'Ms Me' };

function makePtm(meetingTeacher: any) {
  const meetingId = oid();
  const doc: any = {
    _id: meetingId, teacherId: meetingTeacher, studentId: oid(), status: 'requested', actionItems: [], scheduledDate: new Date(),
    save: jest.fn(async function (this: any) { return this; }),
  };
  const ptmModel: any = {
    findOne: jest.fn((f: any) => { const c: any = chain(doc); c.then = (r: any, j: any) => Promise.resolve(doc).then(r, j); return c; }),
    findOneAndUpdate: jest.fn(async () => doc),
  };
  const staffModel: any = { findOne: jest.fn(() => chain({ _id: MY_STAFF, firstName: 'Ms', lastName: 'Me' })), db: { collection: () => ({ findOne: async () => null }) } };
  const profileModel: any = { findOne: jest.fn(() => chain(null)) };
  const service = new PTMService(ptmModel, {} as any, staffModel, {} as any, undefined, profileModel);
  jest.spyOn(service as any, 'notifyGuardians').mockResolvedValue(undefined);
  return { service, ptmModel, doc, id: String(meetingId) };
}

describe('PTM ownership for the teacher role', () => {
  describe.each([
    ['confirm', (s: PTMService, id: string, u: any) => s.confirmMeeting(id, TENANT, u), 'findOneAndUpdate'],
    ['cancel', (s: PTMService, id: string, u: any) => s.cancelMeeting(id, TENANT, 'r', 'n', u), 'findOneAndUpdate'],
    ['action item', (s: PTMService, id: string, u: any) => s.updateActionItem(id, 'x', TENANT, 'done', u), 'findOne'],
  ])('%s', (_n, call) => {
    it("another teacher's meeting -> 403 and nothing is changed", async () => {
      const m = makePtm(OTHER_STAFF);
      await expect(call(m.service, m.id, teacher)).rejects.toThrow(ForbiddenException);
      expect(m.ptmModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(m.doc.save).not.toHaveBeenCalled();
    });
    it('own meeting (Staff id) is allowed past the ownership check', async () => {
      const m = makePtm(MY_STAFF);
      await notForbidden(call(m.service, m.id, teacher));
    });
    it.each(['admin', 'principal', 'institution_owner', 'academic_coordinator'])('%s is unchanged (no ownership check)', async (role) => {
      const m = makePtm(OTHER_STAFF);
      await notForbidden(call(m.service, m.id, { userId: MY_USER, role }));
    });
    it('malformed id -> 400', async () => {
      const m = makePtm(MY_STAFF);
      await expect(call(m.service, 'nope', teacher)).rejects.toThrow(BadRequestException);
    });
  });

  it('own meeting confirm succeeds', async () => {
    const m = makePtm(MY_STAFF);
    await expect(m.service.confirmMeeting(m.id, TENANT, teacher)).resolves.toBe(m.doc);
  });
  it('own meeting cancel succeeds', async () => {
    const m = makePtm(MY_STAFF);
    await expect(m.service.cancelMeeting(m.id, TENANT, 'r', 'n', teacher)).resolves.toBe(m.doc);
  });
  it('legacy call without a user (no ownership check) still works', async () => {
    const m = makePtm(OTHER_STAFF);
    await expect(m.service.confirmMeeting(m.id, TENANT)).resolves.toBe(m.doc);
  });
  it('outcome and reschedule were already owner-only (still 403)', async () => {
    const m = makePtm(OTHER_STAFF);
    await expect(m.service.recordOutcome(m.id, TENANT, { parentAttended: true }, teacher)).rejects.toThrow(ForbiddenException);
    await expect(m.service.reschedule(m.id, TENANT, { scheduledDate: '2026-10-20' }, teacher)).rejects.toThrow(ForbiddenException);
  });
  it('controller hands req.user to confirm / cancel / action-items', async () => {
    const m = makePtm(OTHER_STAFF);
    const ctl = new PTMController(m.service);
    const req = { user: { ...teacher, tenantId: TENANT } };
    await expect(ctl.confirm(m.id, req)).rejects.toThrow(ForbiddenException);
    await expect(ctl.cancel(m.id, { reason: 'x' }, req)).rejects.toThrow(ForbiddenException);
    await expect(ctl.updateActionItem(m.id, 'a', { status: 'done' }, req)).rejects.toThrow(ForbiddenException);
  });
  it('cancel with no body does not crash', async () => {
    const m = makePtm(MY_STAFF);
    const ctl = new PTMController(m.service);
    await expect(ctl.cancel(m.id, undefined as any, { user: { ...teacher, tenantId: TENANT } })).resolves.toBeDefined();
  });
});

function makeSub(substitute: any) {
  const fixtureId = oid();
  const doc: any = { _id: fixtureId, substituteTeacherId: substitute, status: 'assigned' };
  const substitutionModel: any = {
    findOne: jest.fn(() => chain(doc)),
    findOneAndUpdate: jest.fn(async () => ({ ...doc, status: 'completed' })),
  };
  const staffModel: any = { findOne: jest.fn(() => chain({ _id: MY_STAFF, firstName: 'Ms', lastName: 'Me' })) };
  const profileModel: any = { findOne: jest.fn(() => chain(null)) };
  const service = new SubstitutionService(substitutionModel, {} as any, profileModel, staffModel, {} as any);
  return { service, substitutionModel, id: String(fixtureId) };
}

describe('Fixture complete ownership for the teacher role', () => {
  it('the assigned substitute can complete', async () => {
    const m = makeSub(MY_STAFF);
    await expect(m.service.completeFixture(m.id, TENANT, teacher)).resolves.toMatchObject({ status: 'completed' });
  });
  it('an uninvolved teacher -> 403 and nothing updated', async () => {
    const m = makeSub(OTHER_STAFF);
    await expect(m.service.completeFixture(m.id, TENANT, teacher)).rejects.toThrow(ForbiddenException);
    expect(m.substitutionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('the ORIGINAL (absent) teacher who is not the substitute -> 403', async () => {
    const m = makeSub(OTHER_STAFF);
    m.substitutionModel.findOne = jest.fn(() => chain({ substituteTeacherId: OTHER_STAFF, originalTeacherId: MY_STAFF }));
    await expect(m.service.completeFixture(m.id, TENANT, teacher)).rejects.toThrow(ForbiddenException);
  });
  it('an open fixture with no substitute -> 403 for a teacher', async () => {
    const m = makeSub(null);
    await expect(m.service.completeFixture(m.id, TENANT, teacher)).rejects.toThrow(ForbiddenException);
  });
  it('unknown fixture -> 404 for a teacher', async () => {
    const m = makeSub(MY_STAFF);
    m.substitutionModel.findOne = jest.fn(() => chain(null));
    await expect(m.service.completeFixture(m.id, TENANT, teacher)).rejects.toThrow(NotFoundException);
  });
  it.each(['admin', 'principal', 'institution_owner', 'academic_coordinator'])('%s: unchanged, can complete any assigned fixture', async (role) => {
    const m = makeSub(OTHER_STAFF);
    await expect(m.service.completeFixture(m.id, TENANT, { userId: MY_USER, role } as any)).resolves.toMatchObject({ status: 'completed' });
  });
  it('malformed id -> 400 (was a CastError 500) for every role', async () => {
    const m = makeSub(MY_STAFF);
    await expect(m.service.completeFixture('nope', TENANT, teacher)).rejects.toThrow(BadRequestException);
    await expect(m.service.completeFixture('nope', TENANT, { role: 'admin' } as any)).rejects.toThrow(BadRequestException);
  });
  it('controller hands req.user through', async () => {
    const m = makeSub(OTHER_STAFF);
    const ctl = new SubstitutionController(m.service);
    await expect(ctl.complete(m.id, { user: { ...teacher, tenantId: TENANT } })).rejects.toThrow(ForbiddenException);
  });
});
