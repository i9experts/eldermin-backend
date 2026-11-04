import { StudentsService } from './students.service';

// Pins two new StudentsService methods built for the Institution Overview
// dashboard redesign: a class-wise attendance day summary (nothing
// aggregated attendance by class for a single day before - only a
// school-wide total or a per-student month summary existed), and a
// student-birthdays lookup (the student-side twin of HR's staff
// getUpcomingReminders - no student birthday query existed anywhere).

function makeService(overrides: Record<string, any> = {}) {
  const n: any = { aggregate: async () => [], find: () => ({ lean: async () => [] }), findOne: () => ({ select: () => ({ lean: async () => null }) }) };
  const studentModel = overrides.studentModel ?? n;
  const attendanceModel = overrides.attendanceModel ?? n;
  const calendarEventModel = overrides.calendarEventModel ?? n;
  const svc: any = Object.create(StudentsService.prototype);
  svc.studentModel = studentModel;
  svc.attendanceModel = attendanceModel;
  svc.calendarEventModel = calendarEventModel;
  return svc;
}

describe('StudentsService.getClassAttendanceDaySummary', () => {
  it('splits a class\'s total into present/absent/leave/late/unmarked - every status maps to exactly one bucket', async () => {
    const studentModel: any = {
      aggregate: async () => [{ _id: { grade: 'Grade 5', section: 'A' }, total: 10 }],
    };
    const attendanceModel: any = {
      aggregate: async () => [
        { _id: { grade: 'Grade 5', section: 'A', status: 'present' }, count: 5 },
        { _id: { grade: 'Grade 5', section: 'A', status: 'half_day_am' }, count: 1 }, // counts as present
        { _id: { grade: 'Grade 5', section: 'A', status: 'absent' }, count: 2 },
        { _id: { grade: 'Grade 5', section: 'A', status: 'on_leave' }, count: 1 }, // leave
        { _id: { grade: 'Grade 5', section: 'A', status: 'late' }, count: 1 },
        // 10 total - (6 present + 2 absent + 1 leave + 1 late) = 0 unmarked
      ],
    };
    const calendarEventModel: any = { findOne: () => ({ select: () => ({ lean: async () => null }) }) };
    const svc = makeService({ studentModel, attendanceModel, calendarEventModel });

    const result = await svc.getClassAttendanceDaySummary('demo-school', '2026-11-04');

    expect(result.isHoliday).toBe(false);
    expect(result.classes).toEqual([
      { grade: 'Grade 5', section: 'A', total: 10, present: 6, absent: 2, leave: 1, late: 1, unmarked: 0 },
    ]);
    expect(result.totals).toMatchObject({ total: 10, present: 6, absent: 2, leave: 1, late: 1, unmarked: 0, classesCount: 1, markedPct: 100 });
  });

  it('counts a class with no attendance marked at all as fully unmarked', async () => {
    const studentModel: any = { aggregate: async () => [{ _id: { grade: 'Grade 1', section: 'B' }, total: 20 }] };
    const attendanceModel: any = { aggregate: async () => [] };
    const svc = makeService({ studentModel, attendanceModel });

    const result = await svc.getClassAttendanceDaySummary('demo-school');

    expect(result.classes[0]).toMatchObject({ total: 20, present: 0, absent: 0, leave: 0, late: 0, unmarked: 20 });
    expect(result.totals.markedPct).toBe(0);
  });

  it('reports isHoliday + the holiday title when a school-wide holiday covers the date', async () => {
    const calendarEventModel: any = { findOne: () => ({ select: () => ({ lean: async () => ({ title: 'Eid Holiday' }) }) }) };
    const svc = makeService({ calendarEventModel });

    const result = await svc.getClassAttendanceDaySummary('demo-school', '2026-11-04');

    expect(result.isHoliday).toBe(true);
    expect(result.holidayTitle).toBe('Eid Holiday');
  });

  it('ignores attendance rows for a class with zero currently-active students (e.g. since-withdrawn section)', async () => {
    const studentModel: any = { aggregate: async () => [] }; // no active classes at all
    const attendanceModel: any = {
      aggregate: async () => [{ _id: { grade: 'Grade 9', section: 'Z' }, status: 'present', count: 3 }],
    };
    const svc = makeService({ studentModel, attendanceModel });

    const result = await svc.getClassAttendanceDaySummary('demo-school');

    expect(result.classes).toEqual([]);
    expect(result.totals).toMatchObject({ total: 0, present: 0, classesCount: 0 });
  });
});

describe('StudentsService.getUpcomingStudentBirthdays', () => {
  // Computed relative to the real current date rather than a mocked clock,
  // so this test keeps working regardless of which day it actually runs on.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inNDays = (n: number): Date => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };
  // A date of birth that next recurs exactly `n` days from today, born in a
  // clearly-past year (doesn't matter which, since only month/day is used).
  const dobForInDays = (n: number): Date => {
    const occurrence = inNDays(n);
    return new Date(2015, occurrence.getMonth(), occurrence.getDate());
  };

  it('includes a birthday today, within 7 days, and within 30 days; excludes one 31+ days out', async () => {
    const studentModel: any = {
      find: () => ({
        lean: async () => [
          { _id: 's1', firstName: 'Ali', lastName: 'Khan', dateOfBirth: dobForInDays(0), currentGrade: 'Grade 5', currentSection: 'A' },
          { _id: 's2', firstName: 'Sara', lastName: 'Ahmed', dateOfBirth: dobForInDays(5), currentGrade: 'Grade 1', currentSection: 'B' },
          { _id: 's3', firstName: 'Zara', lastName: 'Butt', dateOfBirth: dobForInDays(16), currentGrade: 'Grade 3', currentSection: 'A' },
          { _id: 's4', firstName: 'Omar', lastName: 'Shah', dateOfBirth: dobForInDays(46), currentGrade: 'Grade 7', currentSection: 'C' },
        ],
      }),
    };
    const svc = makeService({ studentModel });

    const result = await svc.getUpcomingStudentBirthdays('demo-school', 30);

    expect(result.birthdays.map((b: any) => b.name)).toEqual(['Ali Khan', 'Sara Ahmed', 'Zara Butt']);
    expect(result.birthdays[0].inDays).toBe(0);
    expect(result.birthdays.every((b: any) => b.inDays <= 30)).toBe(true);
  });

  it('rolls a birthday that already passed this year to next year, not a negative inDays', async () => {
    const pastDob = new Date(today);
    pastDob.setDate(pastDob.getDate() - 10); // this exact month/day already happened this year
    const studentModel: any = {
      find: () => ({ lean: async () => [{ _id: 's1', firstName: 'Bilal', lastName: 'Riaz', dateOfBirth: new Date(2015, pastDob.getMonth(), pastDob.getDate()), currentGrade: 'Grade 2' }] }),
    };
    const svc = makeService({ studentModel });

    const result = await svc.getUpcomingStudentBirthdays('demo-school', 365);

    expect(result.birthdays[0].inDays).toBeGreaterThan(0);
    expect(result.birthdays[0].date.getFullYear()).toBeGreaterThanOrEqual(today.getFullYear());
  });
});
