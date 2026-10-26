import { StudentsService } from './students.service';

// Regression/feature coverage for the new comprehensive student attendance
// REPORT (GET /students/attendance/report-summary) - the replacement for
// Student Management → Attendance's old "mark attendance again" screen,
// now reporting-only (per-student %, daily trend, at-risk list).

function makeLeanChain(result: any) {
  return { sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(result) };
}

function makeStudentModel(distinctResult: any[] = []) {
  return { find: jest.fn(() => ({ distinct: jest.fn().mockResolvedValue(distinctResult) })) };
}

function makeAttendanceModel(records: any[]) {
  return { find: jest.fn(() => makeLeanChain(records)) };
}

function makeService(studentModel: any, attendanceModel: any) {
  const n: any = {};
  return new StudentsService(studentModel, attendanceModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
}

function rec(overrides: Partial<any> = {}) {
  return {
    studentId: '6adb0cb2cc237fa999a1de70', studentName: 'Ali Khan',
    grade: 'Grade 1', section: 'A', date: new Date('2026-10-01'), status: 'present',
    ...overrides,
  };
}

describe('StudentsService.getStudentAttendanceSummaryReport', () => {
  it('computes per-student attendance rate and breakdown across the range', async () => {
    const records = [
      rec({ date: new Date('2026-10-01'), status: 'present' }),
      rec({ date: new Date('2026-10-02'), status: 'present' }),
      rec({ date: new Date('2026-10-03'), status: 'absent' }),
      rec({ date: new Date('2026-10-04'), status: 'late' }),
    ];
    const svc = makeService(makeStudentModel(), makeAttendanceModel(records));
    const result = await svc.getStudentAttendanceSummaryReport('demo-school', { from: '2026-10-01', to: '2026-10-04' });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.studentName).toBe('Ali Khan');
    expect(row.markedDays).toBe(4);
    expect(row.presentCount).toBe(2);
    expect(row.lateCount).toBe(1);
    expect(row.absentCount).toBe(1);
    expect(row.attendanceRate).toBe(75); // 3/4 present-weighted days
  });

  it('flags a student below the attendance threshold', async () => {
    const records = [
      rec({ date: new Date('2026-10-01'), status: 'absent' }),
      rec({ date: new Date('2026-10-02'), status: 'absent' }),
      rec({ date: new Date('2026-10-03'), status: 'present' }),
    ];
    const svc = makeService(makeStudentModel(), makeAttendanceModel(records));
    const result = await svc.getStudentAttendanceSummaryReport('demo-school', { threshold: 90 });

    expect(result.rows[0].belowThreshold).toBe(true);
    expect(result.atRisk).toHaveLength(1);
    expect(result.atRisk[0].studentId).toBe('6adb0cb2cc237fa999a1de70');
  });

  it('flags a same-weekday absence pattern even when the overall rate is fine', async () => {
    // 3 Mondays absent out of otherwise-present days - rate stays high but
    // the pattern itself is worth surfacing.
    const records = [
      rec({ date: new Date('2026-09-07'), status: 'absent' }), // Monday
      rec({ date: new Date('2026-09-14'), status: 'absent' }), // Monday
      rec({ date: new Date('2026-09-21'), status: 'absent' }), // Monday
      ...Array.from({ length: 20 }, (_, i) => rec({ date: new Date(2026, 8, 1 + i), status: 'present' })),
    ];
    const svc = makeService(makeStudentModel(), makeAttendanceModel(records));
    const result = await svc.getStudentAttendanceSummaryReport('demo-school', {});

    expect(result.rows[0].patternFlag).toMatch(/Monday/);
    expect(result.atRisk.some((r: any) => r.patternFlag)).toBe(true);
  });

  it('does not flag a pattern or threshold breach for a student with no concerning data', async () => {
    const records = [rec({ date: new Date('2026-10-01'), status: 'present' }), rec({ date: new Date('2026-10-02'), status: 'present' })];
    const svc = makeService(makeStudentModel(), makeAttendanceModel(records));
    const result = await svc.getStudentAttendanceSummaryReport('demo-school', {});

    expect(result.rows[0].belowThreshold).toBe(false);
    expect(result.rows[0].patternFlag).toBeNull();
    expect(result.atRisk).toHaveLength(0);
  });

  it('builds a daily trend across the whole filtered group, not per student', async () => {
    const records = [
      rec({ studentId: 's1', studentName: 'A', date: new Date('2026-10-01'), status: 'present' }),
      rec({ studentId: 's2', studentName: 'B', date: new Date('2026-10-01'), status: 'absent' }),
      rec({ studentId: 's1', studentName: 'A', date: new Date('2026-10-02'), status: 'present' }),
    ];
    const svc = makeService(makeStudentModel(), makeAttendanceModel(records));
    const result = await svc.getStudentAttendanceSummaryReport('demo-school', {});

    expect(result.trend).toHaveLength(2);
    expect(result.trend[0].date).toBe('2026-10-01');
    expect(result.trend[0].total).toBe(2);
    expect(result.trend[0].presentCount).toBe(1);
    expect(result.trend[0].absentCount).toBe(1);
    expect(result.rows).toHaveLength(2);
  });

  it('resolves campusId into a studentId filter before querying attendance (campus is not on the attendance record)', async () => {
    const studentModel = makeStudentModel(['6adb0cb2cc237fa999a1de70']);
    const attendanceModel = makeAttendanceModel([rec()]);
    const svc = makeService(studentModel, attendanceModel);

    await svc.getStudentAttendanceSummaryReport('demo-school', { campusId: 'campus-1' });

    expect(studentModel.find).toHaveBeenCalledWith({ schoolSlug: 'demo-school', campusId: 'campus-1' });
    const attFilter = attendanceModel.find.mock.calls[0][0];
    expect(attFilter.studentId).toEqual({ $in: ['6adb0cb2cc237fa999a1de70'] });
  });

  it('returns an empty-but-valid shape when there are no records in range', async () => {
    const svc = makeService(makeStudentModel(), makeAttendanceModel([]));
    const result = await svc.getStudentAttendanceSummaryReport('demo-school', { from: '2026-01-01', to: '2026-01-02' });

    expect(result.rows).toEqual([]);
    expect(result.trend).toEqual([]);
    expect(result.atRisk).toEqual([]);
    expect(result.overallRate).toBeNull();
    expect(result.total).toBe(0);
  });
});
