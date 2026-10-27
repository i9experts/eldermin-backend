import { StudentsService } from './students.service';

const SID = '507f1f77bcf86cd799439011';

function makeService(records: any[], classRecords: any[] = records) {
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  const attendanceModel: any = {
    find: jest.fn((filter: any) => ({
      sort: () => ({
        lean: () => Promise.resolve(filter.studentId ? records : classRecords),
      }),
      lean: () => Promise.resolve(filter.studentId ? records : classRecords),
    })),
  };
  const svc = new StudentsService(n, attendanceModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
  return svc;
}

describe('StudentsService.getStudentAttendanceInsights', () => {
  it('returns a full overview/monthlyTrend/weekdayPattern/streaks shape for a student with records', async () => {
    const records = [
      { studentId: SID, grade: 'Grade 3', section: 'A', date: new Date('2026-01-05'), status: 'present' },
      { studentId: SID, grade: 'Grade 3', section: 'A', date: new Date('2026-01-06'), status: 'present' },
      { studentId: SID, grade: 'Grade 3', section: 'A', date: new Date('2026-01-07'), status: 'absent' },
      { studentId: SID, grade: 'Grade 3', section: 'A', date: new Date('2026-02-02'), status: 'present' },
    ];
    const svc = makeService(records);
    const result = await svc.getStudentAttendanceInsights(SID, 'demo-school');

    expect(result.overview.totalDays).toBe(4);
    expect(result.overview.presentCount).toBe(3);
    expect(result.overview.absentCount).toBe(1);
    expect(result.overview.ratePercent).toBe(75);
    expect(result.monthlyTrend).toHaveLength(2);
    expect(result.monthlyTrend[0].month).toBe('2026-01');
    expect(result.weekdayPattern.byWeekday).toHaveLength(7);
    expect(result.streaks.current).not.toBeNull();
    expect(result.classComparison).not.toBeNull();
    expect(result.classComparison?.classSize).toBe(1);
  });

  it('returns null rate/overview totals and no class comparison for a student with no records at all', async () => {
    const svc = makeService([]);
    const result = await svc.getStudentAttendanceInsights(SID, 'demo-school');
    expect(result.overview.totalDays).toBe(0);
    expect(result.overview.ratePercent).toBeNull();
    expect(result.classComparison).toBeNull();
    expect(result.streaks).toEqual({ current: null, longestPresent: null, longestAbsent: null });
  });

  it('excludes holiday-status records from the countable totals', async () => {
    const records = [
      { studentId: SID, grade: 'Grade 3', date: new Date('2026-01-05'), status: 'present' },
      { studentId: SID, grade: 'Grade 3', date: new Date('2026-01-06'), status: 'holiday' },
    ];
    const svc = makeService(records);
    const result = await svc.getStudentAttendanceInsights(SID, 'demo-school');
    expect(result.overview.totalDays).toBe(1);
  });

  it('matches class comparison by grade/section even when the spelling differs from the stored record', async () => {
    const records = [
      { studentId: SID, grade: 'GRADE-3', section: 'section a', date: new Date('2026-01-05'), status: 'present' },
    ];
    const classRecords = [
      { studentId: SID, grade: 'GRADE-3', section: 'section a', date: new Date('2026-01-05'), status: 'present' },
      { studentId: 'other-student', grade: 'Grade 3', section: 'A', date: new Date('2026-01-05'), status: 'absent' },
    ];
    const svc = makeService(records, classRecords);
    const result = await svc.getStudentAttendanceInsights(SID, 'demo-school');
    expect(result.classComparison?.classSize).toBe(2);
  });
});
