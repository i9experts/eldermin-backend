import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { HrService } from './hr.service';
import { UserRole } from '../../auth/roles.enum';
import { PERMISSIONS_MATRIX } from '../../auth/permissions.matrix';
import { PERMISSION_KEY } from '../../auth/decorators';
import { ROLES_KEY } from '../../auth/decorators';
import { ROLES_OR_MODULE_KEY } from '../../roles/decorators/roles-or-module-manage.decorator';
import { HrController } from './hr.controller';

const T = new Types.ObjectId().toHexString();
const U = new Types.ObjectId().toHexString();
const STAFF_ID = 's1';

function svc(overrides: Partial<any> = {}) {
  const s: any = Object.create(HrService.prototype);
  s.staffModel = { findOne: jest.fn(() => Promise.resolve({ _id: STAFF_ID, tenantId: T, userId: U, firstName: 'A', lastName: 'B', employeeId: 'E1' })) };
  s.staffAttendanceModel = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })) };
  s.attendanceCorrectionModel = {
    find: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve([]) }) })),
    create: jest.fn(async (doc: any) => doc),
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
    findOneAndUpdate: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
  };
  s.markStaffAttendance = jest.fn(async () => ({ message: 'ok' }));
  s.getStaffAttendance = jest.fn(async () => []);
  Object.assign(s, overrides);
  return s as HrService;
}

describe('attendance:self self-service ownership', () => {
  it('createMyAttendanceCorrectionRequest always uses the server-resolved staff record, ignoring a forged staffId', async () => {
    const s = svc();
    const result: any = await (s as any).createMyAttendanceCorrectionRequest(T, T, U, {
      attendanceDate: '2026-10-20', requestedStatus: 'present', reason: 'forgot to tap in',
      staffId: 'FORGED', status: 'approved',
    });
    expect(result.staffId).toBe(STAFF_ID);
    expect(result.staffName).toBe('A B');
    expect(result.status).toBe('pending'); // forged "approved" is never trusted
  });

  it('snapshots the current StaffAttendance record (if any) for the reviewer, without using it to decide the outcome', async () => {
    const s = svc({
      staffAttendanceModel: { findOne: jest.fn(() => ({ lean: () => Promise.resolve({ status: 'absent', checkInTime: null, checkOutTime: null }) })) },
    });
    const result: any = await (s as any).createMyAttendanceCorrectionRequest(T, T, U, {
      attendanceDate: '2026-10-20', requestedStatus: 'present', requestedCheckInTime: '08:00', reason: 'forgot to tap in',
    });
    expect(result.currentStatus).toBe('absent');
    expect(result.requestedStatus).toBe('present');
  });

  it('getMyAttendanceCorrectionRequests scopes the query to the caller\'s own resolved staffId', async () => {
    const find = jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve([{ _id: 'r1' }]) }) }));
    const s = svc({ attendanceCorrectionModel: { find } });
    await (s as any).getMyAttendanceCorrectionRequests(T, U);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ staffId: STAFF_ID }));
  });

  it('getMyAttendance delegates to getStaffAttendance scoped to the caller\'s own staffId', async () => {
    const s = svc();
    await (s as any).getMyAttendance(T, U, { month: 10, year: 2026 });
    expect(s.getStaffAttendance).toHaveBeenCalledWith(T, expect.objectContaining({ staffId: STAFF_ID, month: 10, year: 2026 }));
  });
});

describe('reviewAttendanceCorrectionRequest', () => {
  const pending = { _id: 'req1', tenantId: T, institutionId: T, staffId: STAFF_ID, status: 'pending', attendanceDate: new Date('2026-10-20'), requestedStatus: 'present', requestedCheckInTime: '08:00', requestedCheckOutTime: '15:00' };

  it('approving applies the correction via markStaffAttendance and marks the request approved', async () => {
    const s = svc({
      attendanceCorrectionModel: {
        findOne: jest.fn(() => ({ lean: () => Promise.resolve(pending) })),
        findOneAndUpdate: jest.fn(() => ({ lean: () => Promise.resolve({ ...pending, status: 'approved' }) })),
      },
    });
    const result: any = await (s as any).reviewAttendanceCorrectionRequest(T, 'req1', 'approved', 'reviewer1', 'Principal Name', 'looks right');
    expect(result.status).toBe('approved');
    expect(s.markStaffAttendance).toHaveBeenCalledWith(T, T, [expect.objectContaining({
      staffId: STAFF_ID, date: '2026-10-20', status: 'present', checkInTime: '08:00', checkOutTime: '15:00',
    })]);
  });

  it('rejecting never touches StaffAttendance', async () => {
    const s = svc({
      attendanceCorrectionModel: {
        findOne: jest.fn(() => ({ lean: () => Promise.resolve(pending) })),
        findOneAndUpdate: jest.fn(() => ({ lean: () => Promise.resolve({ ...pending, status: 'rejected' }) })),
      },
    });
    const result: any = await (s as any).reviewAttendanceCorrectionRequest(T, 'req1', 'rejected', 'reviewer1', 'Principal Name');
    expect(result.status).toBe('rejected');
    expect(s.markStaffAttendance).not.toHaveBeenCalled();
  });

  it('404s on an unknown request id', async () => {
    const s = svc({ attendanceCorrectionModel: { findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })) } });
    await expect((s as any).reviewAttendanceCorrectionRequest(T, 'missing', 'approved', 'reviewer1', 'Name')).rejects.toThrow(NotFoundException);
  });

  it('refuses to re-review an already-decided request', async () => {
    const s = svc({ attendanceCorrectionModel: { findOne: jest.fn(() => ({ lean: () => Promise.resolve({ ...pending, status: 'approved' }) })) } });
    await expect((s as any).reviewAttendanceCorrectionRequest(T, 'req1', 'rejected', 'reviewer1', 'Name')).rejects.toThrow(BadRequestException);
  });
});

describe('attendance:self permission wiring', () => {
  it('is granted to TEACHER, matching leave:self scope', () => {
    expect(PERMISSIONS_MATRIX[UserRole.TEACHER]).toContain('attendance:self');
  });

  it.each(['getMyAttendance', 'getMyAttendanceCorrectionRequests', 'createMyAttendanceCorrectionRequest'])(
    'HrController.%s carries only the attendance:self permission, no role-based guard',
    (fn) => {
      expect(Reflect.getMetadata(ROLES_KEY, HrController.prototype[fn as keyof HrController])).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_OR_MODULE_KEY, HrController.prototype[fn as keyof HrController])).toBeUndefined();
      expect(Reflect.getMetadata(PERMISSION_KEY, HrController.prototype[fn as keyof HrController])).toBe('attendance:self');
    },
  );
});
