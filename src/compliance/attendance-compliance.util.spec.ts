import {
  studentDayWeight, staffDayWeight, computeAttendanceRate, isBelowThreshold,
  STUDENT_NON_SCHOOL_DAY_STATUSES, STAFF_NON_WORK_DAY_STATUSES, defaultWindow,
  DEFAULT_WINDOW_DAYS, DEFAULT_MIN_STUDENT_ATTENDANCE_PERCENT, DEFAULT_MIN_STAFF_ATTENDANCE_PERCENT,
} from './attendance-compliance.util';

describe('studentDayWeight', () => {
  it('scores present/late as fully present', () => {
    expect(studentDayWeight('present')).toBe(1);
    expect(studentDayWeight('late')).toBe(1);
  });
  it('scores half days as 0.5', () => {
    expect(studentDayWeight('half_day_am')).toBe(0.5);
    expect(studentDayWeight('half_day_pm')).toBe(0.5);
  });
  it('scores absent/on_leave/medical as 0', () => {
    expect(studentDayWeight('absent')).toBe(0);
    expect(studentDayWeight('on_leave')).toBe(0);
    expect(studentDayWeight('medical')).toBe(0);
  });
});

describe('staffDayWeight', () => {
  it('scores present/late/remote/extra_day as fully present', () => {
    expect(staffDayWeight('present')).toBe(1);
    expect(staffDayWeight('late')).toBe(1);
    expect(staffDayWeight('remote')).toBe(1);
    expect(staffDayWeight('extra_day')).toBe(1);
  });
  it('scores half_day as 0.5', () => {
    expect(staffDayWeight('half_day')).toBe(0.5);
  });
  it('scores absent/on_leave/sick_leave as 0', () => {
    expect(staffDayWeight('absent')).toBe(0);
    expect(staffDayWeight('on_leave')).toBe(0);
    expect(staffDayWeight('sick_leave')).toBe(0);
  });
});

describe('computeAttendanceRate', () => {
  it('computes a simple rate excluding non-school days', () => {
    const statuses = ['present', 'present', 'absent', 'present', 'holiday'];
    const rate = computeAttendanceRate(statuses, studentDayWeight, STUDENT_NON_SCHOOL_DAY_STATUSES);
    // 4 countable days (holiday excluded), 3 present -> 75%
    expect(rate).toBe(75);
  });

  it('weighs half days correctly', () => {
    const statuses = ['present', 'half_day_am', 'absent', 'present'];
    const rate = computeAttendanceRate(statuses, studentDayWeight, STUDENT_NON_SCHOOL_DAY_STATUSES);
    // (1 + 0.5 + 0 + 1) / 4 = 0.625 -> 62.5%
    expect(rate).toBe(62.5);
  });

  it('returns null when there is no countable data', () => {
    expect(computeAttendanceRate([], studentDayWeight, STUDENT_NON_SCHOOL_DAY_STATUSES)).toBeNull();
    expect(computeAttendanceRate(['holiday', 'holiday'], studentDayWeight, STUDENT_NON_SCHOOL_DAY_STATUSES)).toBeNull();
  });

  it('excludes weekend/holiday for staff', () => {
    const statuses = ['present', 'weekend', 'holiday', 'absent'];
    const rate = computeAttendanceRate(statuses, staffDayWeight, STAFF_NON_WORK_DAY_STATUSES);
    // 2 countable (present, absent) -> 50%
    expect(rate).toBe(50);
  });
});

describe('isBelowThreshold', () => {
  it('flags a rate below the threshold', () => {
    expect(isBelowThreshold(85, 90)).toBe(true);
  });
  it('does not flag a rate at or above the threshold', () => {
    expect(isBelowThreshold(90, 90)).toBe(false);
    expect(isBelowThreshold(95, 90)).toBe(false);
  });
  it('never flags a null (no-data) rate', () => {
    expect(isBelowThreshold(null, 90)).toBe(false);
  });
});

describe('defaultWindow', () => {
  it('spans DEFAULT_WINDOW_DAYS ending at now', () => {
    const now = new Date('2026-08-30T00:00:00.000Z');
    const { from, to } = defaultWindow(now);
    expect(to.getTime()).toBe(now.getTime());
    const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000);
    expect(diffDays).toBe(DEFAULT_WINDOW_DAYS);
  });
});

describe('defaults', () => {
  it('match the statutory/institutional defaults quoted in the brief', () => {
    expect(DEFAULT_MIN_STUDENT_ATTENDANCE_PERCENT).toBe(90);
    expect(DEFAULT_MIN_STAFF_ATTENDANCE_PERCENT).toBe(95);
  });
});
