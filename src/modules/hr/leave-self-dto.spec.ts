import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Types } from 'mongoose';
import { HrService } from './hr.service';
import { CreateSelfLeaveDto } from './dto/self-leave.dto';

// Same options as main.ts
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false });
const run = (body: any) => pipe.transform(body, { type: 'body', metatype: CreateSelfLeaveDto });
const ok = { leaveType: 'casual', fromDate: '2026-10-20', toDate: '2026-10-21', reason: 'Family event' };
async function messages(body: any): Promise<string[]> {
  try { await run(body); } catch (e: any) { expect(e).toBeInstanceOf(BadRequestException); return e.getResponse().message; }
  return [];
}

describe('POST /hr/leave/self validation (DTO)', () => {
  it('the app request is accepted', async () => {
    const r: any = await run({ ...ok, isHalfDay: false });
    expect(r).toMatchObject(ok);
  });
  it('the web request (totalDays, half day with session) is accepted', async () => {
    await expect(run({ ...ok, totalDays: 2, isHalfDay: true, halfDaySession: 'morning' })).resolves.toBeDefined();
  });
  it('single-day leave (toDate == fromDate) is accepted', async () => {
    await expect(run({ ...ok, toDate: ok.fromDate })).resolves.toBeDefined();
  });
  it('identity / approval fields are stripped by the whitelist', async () => {
    const r: any = await run({ ...ok, staffId: 'x', status: 'approved', approvedBy: 'y', tenantId: 'z' });
    expect(r.staffId).toBeUndefined(); expect(r.status).toBeUndefined(); expect(r.approvedBy).toBeUndefined(); expect(r.tenantId).toBeUndefined();
  });
  it('empty body -> 400 listing every required field', async () => {
    const m = (await messages({})).join(' | ');
    expect(m).toMatch(/leaveType must be one of/);
    expect(m).toMatch(/fromDate must be a valid date/);
    expect(m).toMatch(/toDate must be a valid date/);
    expect(m).toMatch(/reason is required/);
  });
  it.each([
    [{ ...ok, reason: undefined }, 'reason is required'],
    [{ ...ok, reason: '   ' }, 'reason is required'],
    [{ ...ok, leaveType: 'holiday' }, 'leaveType must be one of'],
    [{ ...ok, fromDate: 'not a date' }, 'fromDate must be a valid date'],
    [{ ...ok, toDate: '2026-13-45' }, 'toDate must be a valid date'],
    [{ ...ok, fromDate: '2026-10-22', toDate: '2026-10-21' }, 'toDate must not be before fromDate'],
    [{ ...ok, halfDaySession: 'noon' }, 'halfDaySession must be morning or afternoon'],
    [{ ...ok, isHalfDay: 'yes' }, 'isHalfDay must be true or false'],
  ])('%j -> 400 "%s"', async (body: any, text: string) => {
    expect((await messages(body)).join(' | ')).toContain(text);
  });
});

describe('HrService.updateLeaveStatus approverName', () => {
  const TENANT = new Types.ObjectId().toString();
  const APPROVER = new Types.ObjectId().toString();
  const LEAVE_ID = new Types.ObjectId();
  function make() {
    const existing: any = { _id: LEAVE_ID, staffId: new Types.ObjectId(), leaveType: 'casual', status: 'pending', totalDays: 1, fromDate: new Date('2026-10-10'), toDate: new Date('2026-10-10') };
    const leaveApplicationModel: any = {
      findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(existing) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.resolve({ ...existing }) }),
    };
    const staffModel: any = { findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) }) };
    const args: any[] = Array.from({ length: 42 }, () => ({}));
    args[0] = staffModel; args[2] = leaveApplicationModel; args[7] = { deleteMany: jest.fn() }; args[8] = { updateOne: jest.fn() };
    args.push(undefined);
    const service = new (HrService as any)(...args) as HrService;
    jest.spyOn(service as any, 'syncAttendanceForApprovedLeave').mockResolvedValue(undefined);
    return { service, leaveApplicationModel };
  }
  it.each(['approved', 'rejected'])('%s stores approverName from the token', async (status) => {
    const { service, leaveApplicationModel } = make();
    await service.updateLeaveStatus(TENANT, String(LEAVE_ID), status, APPROVER, 'n', 'hr_manager', 'Hina HR');
    const $set = leaveApplicationModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect($set).toMatchObject({ status, approverName: 'Hina HR', approverNote: 'n' });
    expect($set.approvedBy).toBeDefined();
  });
  it('without a name the $set is exactly as before (no approverName key)', async () => {
    const { service, leaveApplicationModel } = make();
    await service.updateLeaveStatus(TENANT, String(LEAVE_ID), 'approved', APPROVER, 'n', 'admin');
    expect(Object.keys(leaveApplicationModel.findOneAndUpdate.mock.calls[0][1].$set).sort()).toEqual(['approvedAt', 'approvedBy', 'approverNote', 'status']);
  });
});

describe('HrController.createMyLeave is bound to the DTO (so the global pipe validates it)', () => {
  it('param type metadata is CreateSelfLeaveDto', () => {
    const { HrController } = require('./hr.controller');
    const types = Reflect.getMetadata('design:paramtypes', HrController.prototype, 'createMyLeave');
    expect(types[1]).toBe(CreateSelfLeaveDto);
  });
});
