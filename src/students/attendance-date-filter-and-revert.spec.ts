import { StudentsService } from './students.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

// Pins three fixes for the "teacher's attendance register and the admin's
// Attendance Report both show wrong/identical data regardless of the
// selected date" incident reported by a paying client:
//
// 1. AttendanceQueryDto had no `date` field — the global ValidationPipe's
//    whitelist silently stripped `?date=...` before it reached the
//    controller, so getAttendance() applied NO date filter at all and
//    returned the same (most recent) records no matter which date the
//    daily register's date picker was set to.
// 2. getStudentAttendanceSummaryReport summed every raw attendance
//    document per student with no per-calendar-day dedup, so a student
//    with more than one record on the same day (a subject-wise school's
//    multiple per-subject records, or any leftover duplicate document)
//    could show an impossible "Present: 2" for a single-day filter.
// 3. There was no way to undo a wrongly-marked attendance record.

function makeService(attendanceModel: any) {
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  return new StudentsService(n, attendanceModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
}

describe('getAttendance — `date` query param', () => {
  it('filters to exactly the requested calendar day', async () => {
    let capturedFilter: any;
    const attendanceModel: any = {
      find: jest.fn((filter: any) => {
        capturedFilter = filter;
        return { sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }) };
      }),
      countDocuments: jest.fn(async () => 0),
    };
    const svc = makeService(attendanceModel);
    await svc.getAttendance('demo-school', { date: '2026-08-03', page: 1, limit: 20 } as any);

    expect(capturedFilter.date.$gte).toBeInstanceOf(Date);
    expect(capturedFilter.date.$lt).toBeInstanceOf(Date);
    // Exactly a 24h window, not an unbounded/missing filter.
    expect(capturedFilter.date.$lt.getTime() - capturedFilter.date.$gte.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('produces a DIFFERENT filter for a different date — the exact regression that made every date look identical', async () => {
    const capturedFilters: any[] = [];
    const attendanceModel: any = {
      find: jest.fn((filter: any) => {
        capturedFilters.push(filter);
        return { sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }) };
      }),
      countDocuments: jest.fn(async () => 0),
    };
    const svc = makeService(attendanceModel);
    await svc.getAttendance('demo-school', { date: '2026-08-03', page: 1, limit: 20 } as any);
    await svc.getAttendance('demo-school', { date: '2026-11-12', page: 1, limit: 20 } as any);

    expect(capturedFilters[0].date.$gte.getTime()).not.toBe(capturedFilters[1].date.$gte.getTime());
  });

  it('applies no date filter when no date/from/to/month is given (unchanged default behaviour)', async () => {
    let capturedFilter: any;
    const attendanceModel: any = {
      find: jest.fn((filter: any) => {
        capturedFilter = filter;
        return { sort: () => ({ skip: () => ({ limit: () => Promise.resolve([]) }) }) };
      }),
      countDocuments: jest.fn(async () => 0),
    };
    const svc = makeService(attendanceModel);
    await svc.getAttendance('demo-school', { page: 1, limit: 20 } as any);

    expect(capturedFilter.date).toBeUndefined();
  });
});

describe('getStudentAttendanceSummaryReport — per-day dedup', () => {
  const REC = {
    studentId: 's1', studentName: 'Abd-ur-Rehman Ali', grade: 'KG', section: 'A',
  };

  it('collapses multiple same-day records for a student into one, keeping the latest update', async () => {
    const records = [
      { ...REC, date: new Date('2026-08-03'), status: 'present', updatedAt: new Date('2026-08-03T08:00:00Z') },
      { ...REC, date: new Date('2026-08-03'), status: 'absent', updatedAt: new Date('2026-08-03T09:00:00Z') },
    ];
    const attendanceModel: any = { find: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve(records) }) })) };
    const svc = makeService(attendanceModel);
    const result = await svc.getStudentAttendanceSummaryReport('demo-school', { from: '2026-08-03', to: '2026-08-03' });

    expect(result.rows).toHaveLength(1);
    // A single calendar day can never produce presentCount + absentCount > 1.
    expect(result.rows[0].presentCount + result.rows[0].absentCount).toBe(1);
    expect(result.rows[0].markedDays).toBe(1);
    // The later-updated record (absent) wins.
    expect(result.rows[0].absentCount).toBe(1);
    expect(result.rows[0].presentCount).toBe(0);
  });

  it('does not collapse records on genuinely different days', async () => {
    const records = [
      { ...REC, date: new Date('2026-08-03'), status: 'present', updatedAt: new Date('2026-08-03T08:00:00Z') },
      { ...REC, date: new Date('2026-08-04'), status: 'absent', updatedAt: new Date('2026-08-04T08:00:00Z') },
    ];
    const attendanceModel: any = { find: jest.fn(() => ({ sort: () => ({ lean: () => Promise.resolve(records) }) })) };
    const svc = makeService(attendanceModel);
    const result = await svc.getStudentAttendanceSummaryReport('demo-school', { from: '2026-08-03', to: '2026-08-04' });

    expect(result.rows[0].markedDays).toBe(2);
    expect(result.rows[0].presentCount).toBe(1);
    expect(result.rows[0].absentCount).toBe(1);
  });
});

describe('revertAttendance', () => {
  const ATT_ID = '6adb0cb2cc237fa999a1de70';

  function recordDoc(overrides: any = {}) {
    return {
      _id: ATT_ID, schoolSlug: 'demo-school', studentId: 's1', grade: 'KG', section: 'A',
      date: new Date('2026-08-03'), status: 'absent',
      deleteOne: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('deletes the record when found and the caller is in scope', async () => {
    const record = recordDoc();
    const attendanceModel: any = { findOne: jest.fn().mockResolvedValue(record) };
    const svc = makeService(attendanceModel);

    const result = await svc.revertAttendance(ATT_ID, 'demo-school', { role: 'admin' } as any);

    expect(attendanceModel.findOne).toHaveBeenCalledWith({ _id: ATT_ID, schoolSlug: 'demo-school' });
    expect(record.deleteOne).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('throws NotFoundException when the record does not exist (or belongs to another school)', async () => {
    const attendanceModel: any = { findOne: jest.fn().mockResolvedValue(null) };
    const svc = makeService(attendanceModel);

    await expect(svc.revertAttendance(ATT_ID, 'demo-school', { role: 'admin' } as any))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks a class teacher from reverting a record outside their own assigned class', async () => {
    const record = recordDoc({ grade: 'Grade 5', section: 'B' });
    const attendanceModel: any = { findOne: jest.fn().mockResolvedValue(record) };
    const svc = makeService(attendanceModel);
    const teacher = { role: 'teacher', classTeacherOfGradeName: 'KG', classTeacherOfSectionName: 'A' } as any;

    await expect(svc.revertAttendance(ATT_ID, 'demo-school', teacher)).rejects.toBeInstanceOf(ForbiddenException);
    expect(record.deleteOne).not.toHaveBeenCalled();
  });
});
