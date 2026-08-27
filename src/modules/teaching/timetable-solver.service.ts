import { Injectable } from '@nestjs/common';

// ── TYPES ──────────────────────────────────────────────────────────────────

export interface SolverSubjectReq {
  subject: string;
  teacherId: string | null;
  teacherName: string;
  room: string;
  periodsPerWeek: number;
}

export interface SolverClassSpec {
  classIdx: number;
  timetableId: string | null;
  gradeLevel: string;
  sectionName: string;
  sectionId: string | null;
  workingDays: number[];
  periodsPerDay: number;
  periodTimes: { periodNo: number; startTime: string; endTime: string }[];
  subjects: SolverSubjectReq[];
  // Periods that are already fixed obstacles (locked/block/elective/split) -
  // preserved verbatim in the output and blocked off from the solver's own
  // placements, exactly like "Regenerate Open Slots" treats them per-class,
  // just now applied across every class in the same run.
  fixedPeriods: any[];
}

export interface SolverTeacherPrefs {
  preferredFreeDays: number[];
  maxConsecutivePeriods: number;
  avoidGaps: boolean;
}

interface LessonUnit {
  classIdx: number;
  subject: string;
  teacherId: string | null;
  teacherName: string;
  room: string;
}

interface Placement extends LessonUnit {
  day: number;
  periodNo: number;
}

export interface VariantResult {
  classes: { classIdx: number; periods: any[] }[];
  score: {
    unplaced: number;
    freeDayViolations: number;
    consecutiveViolations: number;
    totalGaps: number;
    totalPenalty: number;
  };
}

// Deterministic seeded PRNG (mulberry32) so each variant in a batch explores
// a different but reproducible ordering/tie-break sequence, instead of
// every "Generate 3 options" call quietly producing the same schedule three
// times over.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

@Injectable()
export class TimetableSolverService {
  // The genuinely hard part: build a schedule for every class in the batch
  // AT ONCE, so a teacher's availability is respected across all of them
  // simultaneously (not discovered as a conflict after the fact, the way
  // per-class Auto-Generate + cross-timetable checking works today), while
  // also minimizing soft-constraint violations (free-day preferences,
  // gaps, consecutive-period overruns) school-wide rather than per class.
  generateVariant(
    classes: SolverClassSpec[],
    teacherPrefs: Record<string, SolverTeacherPrefs>,
    seed: number,
  ): VariantResult {
    const rand = mulberry32(seed);
    const defaultPrefs: SolverTeacherPrefs = { preferredFreeDays: [], maxConsecutivePeriods: 4, avoidGaps: true };
    const prefsOf = (teacherId: string | null) => (teacherId && teacherPrefs[teacherId]) || defaultPrefs;

    // ── Occupancy grids, shared across every class in the batch ──
    const classGrid = new Set<string>(); // `${classIdx}-${day}-${p}`
    const teacherGrid = new Set<string>(); // `${teacherId}-${day}-${p}`
    const roomGrid = new Set<string>(); // `${room}-${day}-${p}`
    const placements: Placement[] = [];

    const classKey = (ci: number, d: number, p: number) => `${ci}-${d}-${p}`;
    const teacherKey = (t: string, d: number, p: number) => `${t}-${d}-${p}`;
    const roomKey = (r: string, d: number, p: number) => `${r}-${d}-${p}`;

    for (const c of classes) {
      for (const fp of c.fixedPeriods) {
        classGrid.add(classKey(c.classIdx, fp.day, fp.periodNo));
        if (fp.teacherId) teacherGrid.add(teacherKey(String(fp.teacherId), fp.day, fp.periodNo));
        if (fp.roomNo) roomGrid.add(roomKey(String(fp.roomNo).toLowerCase(), fp.day, fp.periodNo));
        for (const g of fp.splitGroups || []) {
          if (g.teacherId) teacherGrid.add(teacherKey(String(g.teacherId), fp.day, fp.periodNo));
          if (g.roomNo) roomGrid.add(roomKey(String(g.roomNo).toLowerCase(), fp.day, fp.periodNo));
        }
      }
    }

    // ── Flatten every (class, subject) into individual one-period units ──
    let units: LessonUnit[] = [];
    for (const c of classes) {
      for (const s of c.subjects) {
        if (!s.subject || s.periodsPerWeek <= 0) continue;
        for (let i = 0; i < s.periodsPerWeek; i++) {
          units.push({ classIdx: c.classIdx, subject: s.subject, teacherId: s.teacherId, teacherName: s.teacherName, room: s.room });
        }
      }
    }

    // Most-constrained-first: a teacher already carrying a heavy load this
    // run should get first pick of slots, since they have the fewest
    // remaining options - placing the "easy" units first just backs the
    // solver into corners it has to leave unplaced.
    const teacherLoad = new Map<string, number>();
    for (const u of units) if (u.teacherId) teacherLoad.set(u.teacherId, (teacherLoad.get(u.teacherId) || 0) + 1);
    units = units
      .map(u => ({ u, tie: rand() }))
      .sort((a, b) => (teacherLoad.get(b.u.teacherId || '') || 0) - (teacherLoad.get(a.u.teacherId || '') || 0) || a.tie - b.tie)
      .map(x => x.u);

    const teacherPeriodsOnDay = (teacherId: string, day: number): number[] => {
      const nums: number[] = [];
      for (const p of placements) if (p.teacherId === teacherId && p.day === day) nums.push(p.periodNo);
      for (const c of classes) for (const fp of c.fixedPeriods) {
        if (fp.day === day && String(fp.teacherId) === teacherId) nums.push(fp.periodNo);
      }
      return nums.sort((a, b) => a - b);
    };

    // Lower is better. Estimates the soft-constraint cost of placing this
    // teacher on this day/period, given what's already been placed for
    // them that day - a preferred-free day is heavily discouraged (but not
    // forbidden outright, so a genuinely overloaded teacher still gets a
    // full schedule rather than an incomplete one), and a placement that
    // would push their longest same-day run past maxConsecutivePeriods is
    // penalized proportionally to the overrun.
    const slotPenalty = (teacherId: string | null, day: number, periodNo: number): number => {
      if (!teacherId) return 0;
      const prefs = prefsOf(teacherId);
      let penalty = 0;
      if (prefs.preferredFreeDays.includes(day)) penalty += 50;
      const existing = teacherPeriodsOnDay(teacherId, day);
      if (existing.length && prefs.avoidGaps) {
        const withNew = [...existing, periodNo].sort((a, b) => a - b);
        const span = withNew[withNew.length - 1] - withNew[0] + 1;
        const gaps = span - withNew.length;
        penalty += gaps * 3;
      }
      const withNewSorted = [...existing, periodNo].sort((a, b) => a - b);
      let run = 1, longest = 1;
      for (let i = 1; i < withNewSorted.length; i++) {
        run = withNewSorted[i] === withNewSorted[i - 1] + 1 ? run + 1 : 1;
        longest = Math.max(longest, run);
      }
      if (longest > prefs.maxConsecutivePeriods) penalty += (longest - prefs.maxConsecutivePeriods) * 10;
      return penalty;
    };

    const unplacedUnits: LessonUnit[] = [];
    const byClass = new Map<number, SolverClassSpec>();
    for (const c of classes) byClass.set(c.classIdx, c);

    for (const u of units) {
      const spec = byClass.get(u.classIdx)!;
      let best: { day: number; periodNo: number; penalty: number } | null = null;
      for (const day of spec.workingDays) {
        for (let p = 1; p <= spec.periodsPerDay; p++) {
          if (classGrid.has(classKey(u.classIdx, day, p))) continue;
          if (u.teacherId && teacherGrid.has(teacherKey(u.teacherId, day, p))) continue;
          if (u.room && roomGrid.has(roomKey(u.room.toLowerCase(), day, p))) continue;
          const penalty = slotPenalty(u.teacherId, day, p) + rand() * 0.01; // tiny jitter to break ties differently per variant
          if (!best || penalty < best.penalty) best = { day, periodNo: p, penalty };
        }
      }
      if (!best) { unplacedUnits.push(u); continue; }
      classGrid.add(classKey(u.classIdx, best.day, best.periodNo));
      if (u.teacherId) teacherGrid.add(teacherKey(u.teacherId, best.day, best.periodNo));
      if (u.room) roomGrid.add(roomKey(u.room.toLowerCase(), best.day, best.periodNo));
      placements.push({ ...u, day: best.day, periodNo: best.periodNo });
    }

    // ── Bounded local search: try swapping two placements' slots when it
    // lowers total penalty and stays feasible for both. A simple
    // hill-climb, not simulated annealing - fast, deterministic given the
    // seed, and good enough to smooth out greedy placement's worst edges
    // without the complexity (and non-determinism) of a full annealer. ──
    const ITER = Math.min(400, placements.length * 8);
    for (let iter = 0; iter < ITER && placements.length > 1; iter++) {
      const i = Math.floor(rand() * placements.length);
      const j = Math.floor(rand() * placements.length);
      if (i === j) continue;
      const a = placements[i], b = placements[j];
      if (a.classIdx === b.classIdx && a.day === b.day && a.periodNo === b.periodNo) continue;
      // Feasibility: each unit must be legal in the other's slot (own
      // class's grid cell free of anything but each other, teacher/room
      // free save for the swap itself).
      const feasibleAt = (u: LessonUnit, day: number, p: number, skipClassIdx: number, skipDay: number, skipP: number) => {
        const ck = classKey(u.classIdx, day, p);
        if (classGrid.has(ck) && !(u.classIdx === skipClassIdx && day === skipDay && p === skipP)) return false;
        if (u.teacherId) {
          const tk = teacherKey(u.teacherId, day, p);
          if (teacherGrid.has(tk) && !(a.teacherId === u.teacherId && day === a.day && p === a.periodNo) && !(b.teacherId === u.teacherId && day === b.day && p === b.periodNo)) return false;
        }
        return true;
      };
      if (!feasibleAt(a, b.day, b.periodNo, a.classIdx, a.day, a.periodNo)) continue;
      if (!feasibleAt(b, a.day, a.periodNo, b.classIdx, b.day, b.periodNo)) continue;

      const before = slotPenalty(a.teacherId, a.day, a.periodNo) + slotPenalty(b.teacherId, b.day, b.periodNo);
      const after = slotPenalty(a.teacherId, b.day, b.periodNo) + slotPenalty(b.teacherId, a.day, a.periodNo);
      if (after >= before) continue;

      // Apply swap
      classGrid.delete(classKey(a.classIdx, a.day, a.periodNo));
      classGrid.delete(classKey(b.classIdx, b.day, b.periodNo));
      if (a.teacherId) teacherGrid.delete(teacherKey(a.teacherId, a.day, a.periodNo));
      if (b.teacherId) teacherGrid.delete(teacherKey(b.teacherId, b.day, b.periodNo));
      if (a.room) roomGrid.delete(roomKey(a.room.toLowerCase(), a.day, a.periodNo));
      if (b.room) roomGrid.delete(roomKey(b.room.toLowerCase(), b.day, b.periodNo));

      const aDay = a.day, aP = a.periodNo;
      a.day = b.day; a.periodNo = b.periodNo;
      b.day = aDay; b.periodNo = aP;

      classGrid.add(classKey(a.classIdx, a.day, a.periodNo));
      classGrid.add(classKey(b.classIdx, b.day, b.periodNo));
      if (a.teacherId) teacherGrid.add(teacherKey(a.teacherId, a.day, a.periodNo));
      if (b.teacherId) teacherGrid.add(teacherKey(b.teacherId, b.day, b.periodNo));
      if (a.room) roomGrid.add(roomKey(a.room.toLowerCase(), a.day, a.periodNo));
      if (b.room) roomGrid.add(roomKey(b.room.toLowerCase(), b.day, b.periodNo));
    }

    // ── Build output periods per class + final score ──
    const classesOut = classes.map(c => {
      const periodTime = (p: number) => c.periodTimes.find(t => t.periodNo === p) ?? { startTime: '', endTime: '' };
      const own = placements.filter(pl => pl.classIdx === c.classIdx).map(pl => ({
        day: pl.day, periodNo: pl.periodNo,
        startTime: periodTime(pl.periodNo).startTime, endTime: periodTime(pl.periodNo).endTime,
        subject: pl.subject, teacherId: pl.teacherId, teacherName: pl.teacherName, roomNo: pl.room, type: 'regular',
        weekCycle: 'both', locked: false, blockId: null, electiveGroupId: null, electiveGroupName: null, splitGroups: [],
      }));
      return { classIdx: c.classIdx, periods: [...c.fixedPeriods, ...own] };
    });

    let freeDayViolations = 0, consecutiveViolations = 0, totalGaps = 0;
    const byTeacherDay = new Map<string, number[]>();
    for (const pl of placements) {
      if (!pl.teacherId) continue;
      const key = `${pl.teacherId}-${pl.day}`;
      (byTeacherDay.get(key) ?? byTeacherDay.set(key, []).get(key)!).push(pl.periodNo);
      if (prefsOf(pl.teacherId).preferredFreeDays.includes(pl.day)) freeDayViolations++;
    }
    for (const [key, nums] of byTeacherDay) {
      const teacherId = key.slice(0, key.lastIndexOf('-'));
      const prefs = prefsOf(teacherId);
      const sorted = [...new Set(nums)].sort((a, b) => a - b);
      const span = sorted[sorted.length - 1] - sorted[0] + 1;
      totalGaps += span - sorted.length;
      let run = 1, longest = 1;
      for (let i = 1; i < sorted.length; i++) { run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1; longest = Math.max(longest, run); }
      if (longest > prefs.maxConsecutivePeriods) consecutiveViolations++;
    }

    const totalPenalty = unplacedUnits.length * 1000 + freeDayViolations * 50 + consecutiveViolations * 30 + totalGaps * 3;

    return {
      classes: classesOut,
      score: { unplaced: unplacedUnits.length, freeDayViolations, consecutiveViolations, totalGaps, totalPenalty },
    };
  }
}
