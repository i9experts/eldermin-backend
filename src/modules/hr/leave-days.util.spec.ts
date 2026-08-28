import { countLeaveDays } from './leave-days.util';

describe('countLeaveDays', () => {
  describe('excludeWeekends = false (default) - must match today\'s exact inclusive-day-count behaviour', () => {
    it('counts a single day as 1', () => {
      expect(countLeaveDays('2026-08-24', '2026-08-24')).toBe(1);
    });

    it('counts an inclusive range with no weekends the same as pure calendar days', () => {
      // Mon 2026-08-24 -> Wed 2026-08-26 = 3 calendar days
      expect(countLeaveDays('2026-08-24', '2026-08-26')).toBe(3);
    });

    it('counts a range spanning a weekend as pure calendar days (weekend included)', () => {
      // Fri 2026-08-21 -> Mon 2026-08-24 = 4 calendar days (Fri,Sat,Sun,Mon)
      expect(countLeaveDays('2026-08-21', '2026-08-24')).toBe(4);
    });

    it('does not change when excludeWeekends is passed but false explicitly', () => {
      expect(countLeaveDays('2026-08-21', '2026-08-24', false)).toBe(4);
    });
  });

  describe('excludeWeekends = true - working-days-only count', () => {
    it('a range with no weekends counts every day (same as inclusive count)', () => {
      // Mon -> Wed
      expect(countLeaveDays('2026-08-24', '2026-08-26', true)).toBe(3);
    });

    it('a range spanning exactly one weekend excludes Sat & Sun', () => {
      // Fri 2026-08-21 -> Mon 2026-08-24: Fri, [Sat, Sun excluded], Mon = 2 working days
      expect(countLeaveDays('2026-08-21', '2026-08-24', true)).toBe(2);
    });

    it('a range spanning multiple weekends excludes every Sat/Sun in range', () => {
      // Mon 2026-08-10 -> Fri 2026-08-28 (three full weeks, 2 weekends of 2 days each fully inside the range)
      // Calendar days = 19, minus 4 weekend days (15-16 and 22-23) = 15 working days
      expect(countLeaveDays('2026-08-10', '2026-08-28', true)).toBe(15);
    });

    it('a range that is entirely a weekend counts 0 working days', () => {
      // Sat 2026-08-22 -> Sun 2026-08-23
      expect(countLeaveDays('2026-08-22', '2026-08-23', true)).toBe(0);
    });

    it('respects a custom workingDays list (e.g. Sun-Thu school week)', () => {
      // Thu 2026-08-20 -> Sun 2026-08-23, working days Sun-Thu (fri/sat are weekend)
      // Thu(in), Fri(out), Sat(out), Sun(in) = 2
      expect(countLeaveDays('2026-08-20', '2026-08-23', true, ['sun', 'mon', 'tue', 'wed', 'thu'])).toBe(2);
    });
  });
});
