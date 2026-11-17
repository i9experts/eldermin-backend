import { BadRequestException } from '@nestjs/common';
import { StudentsService } from './students.service';

// Pins the new "master school days" gate: a school admin configures
// AcademicYear.workingDays (which weekdays count as school days) and
// publishes holidays via the School Calendar module (CalendarEvent, type
// holiday/public_holiday) - markAttendance/bulkMarkAttendance must reject
// a date that falls outside either, but only once an admin has actually
// configured workingDays (a school that never touches this setting sees
// unchanged, ungated behavior).

function makeService({ year, holiday }: { year?: any; holiday?: any } = {}) {
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  const academicYearModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(year ?? null) })) };
  const calendarEventModel: any = { findOne: jest.fn(() => ({ lean: () => Promise.resolve(holiday ?? null) })) };
  const attendanceModel: any = {
    findOneAndUpdate: jest.fn(async (_f: any, update: any) => ({ _id: 'a1', ...update.$set })),
    bulkWrite: jest.fn(async (ops: any[]) => ({ modifiedCount: 0, upsertedCount: ops.length })),
    db: { collection: () => ({}) },
  };
  const svc = new StudentsService(
    n, attendanceModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n,
    academicYearModel, calendarEventModel, n,
  );
  return { svc, academicYearModel, calendarEventModel };
}

describe('StudentsService.checkSchoolDay', () => {
  it('is not gated (valid, configured: false) when no AcademicYear covers the date', async () => {
    const { svc } = makeService({ year: null });
    const result = await svc.checkSchoolDay('demo-school', '2026-02-14');
    expect(result).toEqual({ valid: true, configured: false });
  });

  it('is not gated when the covering AcademicYear has no workingDays set', async () => {
    const { svc } = makeService({ year: { workingDays: [] } });
    const result = await svc.checkSchoolDay('demo-school', '2026-02-14');
    expect(result.valid).toBe(true);
    expect(result.configured).toBe(false);
  });

  it('rejects a weekday not in the configured workingDays', async () => {
    // 2026-02-14 is a Saturday
    const { svc } = makeService({ year: { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] } });
    const result = await svc.checkSchoolDay('demo-school', '2026-02-14');
    expect(result.valid).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.reason).toMatch(/weekend|non-school/);
  });

  it('accepts a weekday that is in the configured workingDays with no holiday', async () => {
    // 2026-02-16 is a Monday
    const { svc } = makeService({ year: { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] }, holiday: null });
    const result = await svc.checkSchoolDay('demo-school', '2026-02-16');
    expect(result).toEqual({ valid: true, configured: true });
  });

  it('rejects a working weekday that falls under a published holiday', async () => {
    const { svc } = makeService({
      year: { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      holiday: { title: 'Eid-ul-Fitr' },
    });
    const result = await svc.checkSchoolDay('demo-school', '2026-02-16');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Eid-ul-Fitr');
  });
});

describe('StudentsService.markAttendance / bulkMarkAttendance gating', () => {
  it('markAttendance throws BadRequestException on an invalid school day', async () => {
    const { svc } = makeService({ year: { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] } });
    await expect(svc.markAttendance({
      studentId: '507f1f77bcf86cd799439011', studentName: 'A', grade: 'Grade 1',
      date: '2026-02-14', status: 'present', schoolSlug: 'demo-school',
    } as any)).rejects.toThrow(BadRequestException);
  });

  it('bulkMarkAttendance throws BadRequestException if any date in the batch is invalid', async () => {
    const { svc } = makeService({ year: { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] } });
    await expect(svc.bulkMarkAttendance({
      schoolSlug: 'demo-school', academicYear: '2026-27',
      records: [
        { studentId: '507f1f77bcf86cd799439011', studentName: 'A', grade: 'Grade 1', date: '2026-02-16', status: 'present' } as any,
        { studentId: '507f1f77bcf86cd799439012', studentName: 'B', grade: 'Grade 1', date: '2026-02-14', status: 'present' } as any,
      ],
    } as any)).rejects.toThrow(BadRequestException);
  });

  it('bulkMarkAttendance succeeds when every date in the batch is valid', async () => {
    const { svc } = makeService({ year: { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] } });
    const result = await svc.bulkMarkAttendance({
      schoolSlug: 'demo-school', academicYear: '2026-27',
      records: [
        { studentId: '507f1f77bcf86cd799439011', studentName: 'A', grade: 'Grade 1', date: '2026-02-16', status: 'present' } as any,
      ],
    } as any);
    expect((result as any).upsertedCount).toBe(1);
  });
});
