// Pure helpers for the Attendance Compliance overlay - split out so the
// actual rate/threshold math has a small unit-testable surface, same
// rationale as data-privacy.util.ts/pr-number.util.ts.

/** Default statutory/institutional attendance-rate thresholds, mirroring
 *  common real-world minimums (not arbitrary) - a school can override
 *  these per-school via AttendanceComplianceSettings. */
export const DEFAULT_MIN_STUDENT_ATTENDANCE_PERCENT = 90;
export const DEFAULT_MIN_STAFF_ATTENDANCE_PERCENT = 95;

/** Default lookback window when the caller doesn't supply from/to. */
export const DEFAULT_WINDOW_DAYS = 30;

export function defaultWindow(now: Date = new Date()): { from: Date; to: Date } {
  const to = new Date(now.getTime());
  const from = new Date(now.getTime());
  from.setDate(from.getDate() - DEFAULT_WINDOW_DAYS);
  return { from, to };
}

/** A single day's weight toward "present" for the statutory attendance
 *  rate (0 = absent, 0.5 = half day, 1 = fully present). Records that
 *  are not real school-attendance days at all (holiday) are excluded
 *  from the rate entirely by the caller before this ever runs - this
 *  function only scores days that DO count toward the denominator.
 *  On-leave/medical/sick-leave count as an excused reason but still
 *  count against the statutory attendance RATE - the same standard
 *  ministries/inspectorates apply, since the point of this rate is
 *  "how often is this person actually present", not "was there a good
 *  reason for the absence". */
export function studentDayWeight(status: string): number {
  switch (status) {
    case 'present':
    case 'late':
      return 1;
    case 'half_day_am':
    case 'half_day_pm':
      return 0.5;
    case 'absent':
    case 'on_leave':
    case 'medical':
    default:
      return 0;
  }
}

export function staffDayWeight(status: string): number {
  switch (status) {
    case 'present':
    case 'late':
    case 'remote':
    case 'extra_day':
      return 1;
    case 'half_day':
      return 0.5;
    case 'absent':
    case 'on_leave':
    case 'sick_leave':
    default:
      return 0;
  }
}

/** Statuses that are not real school/work days at all (holiday, weekend)
 *  and should be excluded from the rate's denominator entirely. */
export const STUDENT_NON_SCHOOL_DAY_STATUSES = new Set(['holiday']);
export const STAFF_NON_WORK_DAY_STATUSES = new Set(['holiday', 'weekend']);

/** Computes an attendance rate (0-100) from a list of day statuses,
 *  given a per-status weight function and the set of statuses to
 *  exclude from the denominator. Returns null (not 0) when there is no
 *  countable data - "no data" and "0% attendance" must never be
 *  conflated. */
export function computeAttendanceRate(
  statuses: string[],
  weightFn: (status: string) => number,
  excluded: Set<string>,
): number | null {
  const countable = statuses.filter((s) => !excluded.has(s));
  if (countable.length === 0) return null;
  const total = countable.reduce((sum, s) => sum + weightFn(s), 0);
  return Math.round((total / countable.length) * 1000) / 10; // one decimal place
}

/** Whether a computed rate falls below a given threshold. null rates
 *  (no data) are never flagged as below-threshold. */
export function isBelowThreshold(rate: number | null, thresholdPercent: number): boolean {
  if (rate === null) return false;
  return rate < thresholdPercent;
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface WeekdayPatternResult {
  byWeekday: { weekday: string; absentCount: number }[];
  patternFlag: string | null;
}

/** Same-weekday absence pattern: 3+ absences with at least half of them
 *  falling on one weekday is worth flagging even if the raw rate itself
 *  is still above threshold. Shared by the class-wide Attendance Report
 *  (StudentsService.getStudentAttendanceSummaryReport) and the Student
 *  360 attendance insights, so "which weekday" means the same thing
 *  everywhere. `records` should already be countable-only (the caller
 *  has excluded STUDENT_NON_SCHOOL_DAY_STATUSES). */
export function computeWeekdayAbsencePattern(records: { date: Date | string; status: string }[]): WeekdayPatternResult {
  const weekdayAbsences: Record<number, number> = {};
  let totalAbsences = 0;
  for (const r of records) {
    if (studentDayWeight(r.status) === 0 && !STUDENT_NON_SCHOOL_DAY_STATUSES.has(r.status)) {
      const wd = new Date(r.date).getDay();
      weekdayAbsences[wd] = (weekdayAbsences[wd] || 0) + 1;
      totalAbsences++;
    }
  }
  let patternFlag: string | null = null;
  if (totalAbsences >= 3) {
    const [topDay, topCount] = Object.entries(weekdayAbsences).sort((a, b) => b[1] - a[1])[0] || [];
    if (topDay !== undefined && (topCount as number) >= 3 && (topCount as number) / totalAbsences >= 0.5) {
      patternFlag = `Frequently absent on ${WEEKDAY_NAMES[Number(topDay)]}s`;
    }
  }
  const byWeekday = WEEKDAY_NAMES.map((name, i) => ({ weekday: name, absentCount: weekdayAbsences[i] || 0 }));
  return { byWeekday, patternFlag };
}

export interface StreakResult {
  type: 'present' | 'absent';
  count: number;
  from: Date;
  to: Date;
}

/** Longest/current consecutive-MARKED-day streaks (present-like vs
 *  absent-like), over a date-ascending-sorted list of countable records
 *  (the caller has already excluded non-school-day statuses). "Consecutive"
 *  means consecutive marked school days, not consecutive calendar days -
 *  weekends/holidays are never marked at all, so this is the right notion
 *  of a streak for attendance. Half-day counts as present-like (weight >
 *  0) since the student did show up. */
export function computeAttendanceStreaks(
  sortedRecords: { date: Date | string; status: string }[],
): { current: StreakResult | null; longestPresent: StreakResult | null; longestAbsent: StreakResult | null } {
  const runs: StreakResult[] = [];
  let curType: 'present' | 'absent' | null = null;
  let curCount = 0;
  let curStart: Date | string | null = null;
  let prevDate: Date | string | null = null;

  for (const r of sortedRecords) {
    const type: 'present' | 'absent' = studentDayWeight(r.status) > 0 ? 'present' : 'absent';
    if (type === curType) {
      curCount++;
    } else {
      if (curType && curStart !== null && prevDate !== null) {
        runs.push({ type: curType, count: curCount, from: new Date(curStart), to: new Date(prevDate) });
      }
      curType = type; curCount = 1; curStart = r.date;
    }
    prevDate = r.date;
  }
  if (curType && curStart !== null && prevDate !== null) {
    runs.push({ type: curType, count: curCount, from: new Date(curStart), to: new Date(prevDate) });
  }

  const current = runs.length ? runs[runs.length - 1] : null;
  const longestPresent = runs.filter((r) => r.type === 'present').sort((a, b) => b.count - a.count)[0] || null;
  const longestAbsent = runs.filter((r) => r.type === 'absent').sort((a, b) => b.count - a.count)[0] || null;
  return { current, longestPresent, longestAbsent };
}
