// Pure date-math for counting the number of days a leave application spans.
// Kept separate from HrService so the two counting modes (plain inclusive
// calendar days vs. working-days-only) can be unit-tested without a
// database, and so the "must match today's exact behaviour when the new
// flag is off" requirement is enforced by a real test rather than by eye.
//
// Historically createLeaveApplication counted every calendar day inclusive
// of both endpoints (Math.ceil(diff/86400000)+1). Some schools want a leave
// application to only count working days (e.g. a Fri-Mon leave is 2 days,
// not 4, if Sat/Sun aren't working days) - that's opt-in per LeavePolicy via
// `excludeWeekends`, default false, so every existing policy/school keeps
// today's exact inclusive-day-count behaviour unless they explicitly turn
// it on.

/** Lowercase 3-letter day codes, matching AttendanceSettings.workingDays
 *  ('mon'..'sun'), for the day-of-week index (0=Sun..6=Sat) JS Date gives.
 *  Exported so other callers (e.g. the Attendance-Leave sync in
 *  HrService.syncAttendanceForApprovedLeave) can use the exact same
 *  day-of-week -> code mapping without redefining it. */
export const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Counts the number of days between fromDate and toDate, inclusive of both
 * endpoints.
 *
 * - excludeWeekends=false (default): pure inclusive calendar days - exactly
 *   today's existing behaviour, Math.ceil(diff/1 day)+1.
 * - excludeWeekends=true: only days whose day-of-week is in `workingDays`
 *   are counted. `workingDays` defaults to Mon-Fri (the same default
 *   AttendanceSettings.workingDays ships with) when not supplied, so a
 *   school with no custom Attendance Settings still gets the conventional
 *   Sat/Sun weekend excluded.
 *
 * Dates are walked in UTC calendar days to avoid DST/local-offset drift
 * affecting which day-of-week a boundary date lands on.
 */
export function countLeaveDays(
  fromDate: Date | string,
  toDate: Date | string,
  excludeWeekends = false,
  workingDays: string[] = ['mon', 'tue', 'wed', 'thu', 'fri'],
): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (!excludeWeekends) {
    return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  const workingSet = new Set(workingDays.map((d) => d.toLowerCase()));
  const fromUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());

  let count = 0;
  for (let day = fromUtc; day <= toUtc; day += 24 * 60 * 60 * 1000) {
    const dow = DAY_CODES[new Date(day).getUTCDay()];
    if (workingSet.has(dow)) count++;
  }
  return count;
}
