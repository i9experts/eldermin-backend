import { computeWeekdayAbsencePattern, computeAttendanceStreaks } from './attendance-compliance.util';

describe('computeWeekdayAbsencePattern', () => {
  it('returns no pattern flag with fewer than 3 absences', () => {
    const records = [
      { date: '2026-01-05', status: 'absent' }, // Monday
      { date: '2026-01-12', status: 'absent' }, // Monday
      { date: '2026-01-06', status: 'present' },
    ];
    const result = computeWeekdayAbsencePattern(records);
    expect(result.patternFlag).toBeNull();
  });

  it('flags a weekday with 3+ absences making up at least half of total absences', () => {
    const records = [
      { date: '2026-01-05', status: 'absent' }, // Monday
      { date: '2026-01-12', status: 'absent' }, // Monday
      { date: '2026-01-19', status: 'absent' }, // Monday
      { date: '2026-01-07', status: 'absent' }, // Wednesday
    ];
    const result = computeWeekdayAbsencePattern(records);
    expect(result.patternFlag).toBe('Frequently absent on Mondays');
  });

  it('excludes holiday statuses from the weekday breakdown', () => {
    const records = [
      { date: '2026-01-05', status: 'holiday' },
      { date: '2026-01-06', status: 'present' },
    ];
    const result = computeWeekdayAbsencePattern(records);
    expect(result.byWeekday.reduce((sum, d) => sum + d.absentCount, 0)).toBe(0);
  });

  it('returns a byWeekday breakdown with all 7 days represented', () => {
    const result = computeWeekdayAbsencePattern([]);
    expect(result.byWeekday).toHaveLength(7);
    expect(result.byWeekday.map((d) => d.weekday)).toEqual([
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
    ]);
  });
});

describe('computeAttendanceStreaks', () => {
  it('returns nulls for an empty record set', () => {
    const result = computeAttendanceStreaks([]);
    expect(result).toEqual({ current: null, longestPresent: null, longestAbsent: null });
  });

  it('computes current streak as the most recent run', () => {
    const records = [
      { date: '2026-01-05', status: 'absent' },
      { date: '2026-01-06', status: 'present' },
      { date: '2026-01-07', status: 'present' },
      { date: '2026-01-08', status: 'present' },
    ];
    const result = computeAttendanceStreaks(records);
    expect(result.current).toEqual({ type: 'present', count: 3, from: new Date('2026-01-06'), to: new Date('2026-01-08') });
  });

  it('finds the longest present and longest absent runs independently', () => {
    const records = [
      { date: '2026-01-01', status: 'present' },
      { date: '2026-01-02', status: 'present' },
      { date: '2026-01-05', status: 'absent' },
      { date: '2026-01-06', status: 'absent' },
      { date: '2026-01-07', status: 'absent' },
      { date: '2026-01-08', status: 'present' },
      { date: '2026-01-09', status: 'present' },
      { date: '2026-01-12', status: 'present' },
      { date: '2026-01-13', status: 'present' },
    ];
    const result = computeAttendanceStreaks(records);
    expect(result.longestAbsent).toEqual({ type: 'absent', count: 3, from: new Date('2026-01-05'), to: new Date('2026-01-07') });
    expect(result.longestPresent).toEqual({ type: 'present', count: 4, from: new Date('2026-01-08'), to: new Date('2026-01-13') });
  });

  it('treats half-day as present-like', () => {
    const records = [
      { date: '2026-01-01', status: 'half_day_am' },
      { date: '2026-01-02', status: 'present' },
    ];
    const result = computeAttendanceStreaks(records);
    expect(result.current).toEqual({ type: 'present', count: 2, from: new Date('2026-01-01'), to: new Date('2026-01-02') });
  });
});
