// Pure helpers: "end of a calendar day in a time zone" without a date library.

export const DEFAULT_TIMEZONE = 'Asia/Karachi'; // School.timezone default (organization.schema.ts:72)

export function validTimezone(tz?: string | null): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return DEFAULT_TIMEZONE; }
}

/** Offset (ms) of `tz` from UTC at the instant `utcMs` (positive east of UTC). */
export function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** UTC instant of local 00:00 on calendar day (y, m(1-12), d) in `tz`. */
export function zonedMidnightUtc(y: number, m: number, d: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz); // second pass handles DST transitions
  return t;
}

/**
 * The instant the given calendar day ENDS in `tz` (= local midnight starting the
 * next day). A last working day of 2026-12-31 in Asia/Karachi ends at
 * 2026-12-31T19:00:00Z.
 */
export function endOfZonedDayUtc(y: number, m: number, d: number, tz: string): number {
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return zonedMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz);
}

/** lastWorkingDay is a date-only value stored at UTC midnight; use its UTC calendar date. */
export function lastWorkingDayEndsAt(lastWorkingDay: Date | string, tz: string): number {
  const dt = new Date(lastWorkingDay);
  return endOfZonedDayUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), validTimezone(tz));
}
