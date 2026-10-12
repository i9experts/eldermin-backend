import { endOfZonedDayUtc, lastWorkingDayEndsAt, validTimezone, zonedMidnightUtc } from './zoned-day.util';

describe('zoned-day.util', () => {
  it('a day in Asia/Karachi (UTC+5, no DST) ends at 19:00Z the same calendar day', () => {
    expect(new Date(endOfZonedDayUtc(2026, 12, 31, 'Asia/Karachi')).toISOString()).toBe('2026-12-31T19:00:00.000Z');
  });
  it('west of UTC (America/New_York, winter UTC-5): the day ends at 05:00Z the next day', () => {
    expect(new Date(endOfZonedDayUtc(2026, 1, 15, 'America/New_York')).toISOString()).toBe('2026-01-16T05:00:00.000Z');
  });
  it('handles DST (New York spring forward 2026-03-08: local midnight after that day is UTC-4)', () => {
    expect(new Date(zonedMidnightUtc(2026, 3, 9, 'America/New_York')).toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(new Date(endOfZonedDayUtc(2026, 3, 8, 'America/New_York')).toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });
  it('month/year rollover', () => {
    expect(new Date(endOfZonedDayUtc(2026, 12, 31, 'UTC')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(new Date(endOfZonedDayUtc(2028, 2, 28, 'UTC')).toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });
  it('lastWorkingDay uses its UTC calendar date', () => {
    expect(new Date(lastWorkingDayEndsAt('2026-12-31', 'Asia/Karachi')).toISOString()).toBe('2026-12-31T19:00:00.000Z');
    expect(new Date(lastWorkingDayEndsAt(new Date('2026-12-31T00:00:00Z'), 'Asia/Karachi')).toISOString()).toBe('2026-12-31T19:00:00.000Z');
  });
  it('invalid / missing zone falls back to Asia/Karachi', () => {
    expect(validTimezone('Not/AZone')).toBe('Asia/Karachi');
    expect(validTimezone(undefined)).toBe('Asia/Karachi');
    expect(validTimezone('Europe/London')).toBe('Europe/London');
  });
});
