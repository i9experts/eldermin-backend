import { Types } from 'mongoose';

// node-zklib has no published types and is required (not imported) inside
// hr.service.ts - mocking it this way (a jest.fn() constructor returning a
// shared, per-test-reconfigurable instance) keeps these tests off any real
// network socket while exercising the real punch-grouping/matching logic.
const mockZkInstance = {
  createSocket: jest.fn(),
  getAttendances: jest.fn(),
  disconnect: jest.fn().mockResolvedValue(undefined),
};
jest.mock('node-zklib', () => jest.fn().mockImplementation(() => mockZkInstance));

import { HrService } from './hr.service';

// HrService has 45 injected deps before the optional notifier - see the
// comment in hr-notify-hooks.spec.ts. Only the models syncBiometricAttendance
// actually touches are given real mocks; the rest are `{}` placeholders.
const STAFF_MODEL_IDX = 0;
const STAFF_ATTENDANCE_MODEL_IDX = 7;
const BIOMETRIC_CONFIG_MODEL_IDX = 24;

const TENANT = new Types.ObjectId().toString();
const INSTITUTION = new Types.ObjectId().toString();
const STAFF_A = new Types.ObjectId();
const STAFF_B = new Types.ObjectId();

function make(opts: {
  staff?: any[];
  existingAttendance?: any[];
  config?: any;
} = {}) {
  const staff = opts.staff ?? [
    { _id: STAFF_A, deviceEnrollmentId: '101', shiftId: null, shiftIds: [] },
    { _id: STAFF_B, deviceEnrollmentId: '102', shiftId: null, shiftIds: [] },
  ];
  const existingAttendance = opts.existingAttendance ?? [];
  const config = 'config' in opts ? opts.config : {
    _id: new Types.ObjectId(), tenantId: TENANT, deviceIp: '203.0.113.5', devicePort: 4370,
  };

  const bulkWrite = jest.fn().mockResolvedValue({});
  const staffAttendanceModel: any = {
    find: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(existingAttendance) }) }),
    bulkWrite,
  };
  const staffModel: any = {
    find: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(staff) }) }),
  };
  const biometricConfigUpdateOne = jest.fn().mockResolvedValue({});
  const biometricConfigModel: any = {
    findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(config) }),
    updateOne: biometricConfigUpdateOne,
  };

  const args: any[] = Array.from({ length: 45 }, () => ({}));
  args[STAFF_MODEL_IDX] = staffModel;
  args[STAFF_ATTENDANCE_MODEL_IDX] = staffAttendanceModel;
  args[BIOMETRIC_CONFIG_MODEL_IDX] = biometricConfigModel;
  const service = new (HrService as any)(...args) as HrService;
  return { service, bulkWrite, biometricConfigUpdateOne, staffAttendanceModel };
}

describe('HrService.syncBiometricAttendance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockZkInstance.createSocket.mockResolvedValue(undefined);
    mockZkInstance.disconnect.mockResolvedValue(undefined);
  });

  it('derives checkInTime from the earliest punch and checkOutTime from the latest, per staff per day', async () => {
    mockZkInstance.getAttendances.mockResolvedValue({
      data: [
        { deviceUserId: '101', recordTime: new Date('2026-10-19T08:05:00.000Z') },
        { deviceUserId: '101', recordTime: new Date('2026-10-19T16:30:00.000Z') },
        { deviceUserId: '101', recordTime: new Date('2026-10-19T12:00:00.000Z') }, // middling punch (e.g. lunch) - ignored
      ],
    });
    const { service, bulkWrite } = make();

    const result = await service.syncBiometricAttendance(TENANT, INSTITUTION);

    expect(result.synced).toBe(1);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const op = bulkWrite.mock.calls[0][0][0].updateOne;
    expect(op.update.$set.checkInTime).toBe('08:05');
    expect(op.update.$set.checkOutTime).toBe('16:30');
    expect(op.update.$set.source).toBe('biometric');
  });

  it('treats a single punch in a day as check-in only, with no fabricated checkout', async () => {
    mockZkInstance.getAttendances.mockResolvedValue({
      data: [{ deviceUserId: '101', recordTime: new Date('2026-10-19T08:05:00.000Z') }],
    });
    const { service, bulkWrite } = make();

    await service.syncBiometricAttendance(TENANT, INSTITUTION);

    const op = bulkWrite.mock.calls[0][0][0].updateOne;
    expect(op.update.$set.checkInTime).toBe('08:05');
    expect(op.update.$set.checkOutTime).toBe('');
  });

  it('reports a device user ID with no matching staff member as unmatched, without syncing it', async () => {
    mockZkInstance.getAttendances.mockResolvedValue({
      data: [{ deviceUserId: '999', recordTime: new Date('2026-10-19T08:05:00.000Z') }],
    });
    const { service, bulkWrite, biometricConfigUpdateOne } = make();

    const result = await service.syncBiometricAttendance(TENANT, INSTITUTION);

    expect(result.synced).toBe(0);
    expect(result.unmatchedDeviceIds).toEqual(['999']);
    expect(bulkWrite).not.toHaveBeenCalled();
    const setCall = biometricConfigUpdateOne.mock.calls.find((c: any) => c[1].$set.lastSyncUnmatchedIds);
    expect(setCall[1].$set.lastSyncUnmatchedIds).toEqual(['999']);
  });

  it('does not overwrite a record a human already manually corrected', async () => {
    mockZkInstance.getAttendances.mockResolvedValue({
      data: [
        { deviceUserId: '101', recordTime: new Date('2026-10-19T08:05:00.000Z') },
        { deviceUserId: '102', recordTime: new Date('2026-10-19T08:10:00.000Z') },
      ],
    });
    const { service, bulkWrite } = make({
      existingAttendance: [
        { staffId: STAFF_A, date: new Date('2026-10-19'), source: 'manual' },
      ],
    });

    const result = await service.syncBiometricAttendance(TENANT, INSTITUTION);

    // Only staff B's record (no protecting manual entry) gets written.
    expect(result.synced).toBe(1);
    const ops = bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(1);
    expect(String(ops[0].updateOne.filter.staffId)).toBe(String(STAFF_B));
  });

  it('does update a record it previously wrote itself (source: biometric)', async () => {
    mockZkInstance.getAttendances.mockResolvedValue({
      data: [{ deviceUserId: '101', recordTime: new Date('2026-10-19T08:05:00.000Z') }],
    });
    const { service, bulkWrite } = make({
      existingAttendance: [
        { staffId: STAFF_A, date: new Date('2026-10-19'), source: 'biometric' },
      ],
    });

    const result = await service.syncBiometricAttendance(TENANT, INSTITUTION);

    expect(result.synced).toBe(1);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
  });

  it('surfaces a connection failure as a clear error instead of throwing unhandled', async () => {
    mockZkInstance.createSocket.mockRejectedValue(new Error('ECONNREFUSED'));
    const { service, biometricConfigUpdateOne } = make();

    await expect(service.syncBiometricAttendance(TENANT, INSTITUTION)).rejects.toThrow(/Could not connect to device/);
    const setCall = biometricConfigUpdateOne.mock.calls.find((c: any) => c[1].$set.lastSyncError);
    expect(setCall[1].$set.isConnected).toBe(false);
    expect(setCall[1].$set.lastSyncError).toMatch(/ECONNREFUSED/);
  });

  it('throws when the device is not configured yet', async () => {
    const { service } = make({ config: null });
    await expect(service.syncBiometricAttendance(TENANT, INSTITUTION)).rejects.toThrow(/not configured/);
  });
});
