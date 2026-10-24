import { Types } from 'mongoose';
import { StudentsService } from './students.service';
import { computeAttendanceRate, studentDayWeight, STUDENT_NON_SCHOOL_DAY_STATUSES } from '../compliance/attendance-compliance.util';

// Student 360's attendance header stat (Attendance %, Days Absent) always
// showed 0 even when the student had real, recent attendance records: the
// aggregate filtered on StudentAttendance.academicYear, a field the write
// paths (bulkMarkAttendance) only populate from an optional top-level DTO
// field the Teaching/Student attendance screens never actually send, so
// real records routinely carry no academicYear at all and the match found
// nothing. Fixed by dropping that filter (matching "recent attendance",
// which never filtered on it either) and by using the same shared rate
// math as Attendance Compliance / the Student Attendance Reporting
// dashboard (eldermin-backend#192) instead of the old ad-hoc formula.

const sid = new Types.ObjectId();
const studentDoc = () => ({
  _id: sid, firstName: 'Ali', lastName: 'Khan', currentAcademicYear: '2026-27', status: 'active',
});
const chain = (v: any) => {
  const c: any = { select: () => c, sort: () => c, skip: () => c, limit: () => c, lean: () => Promise.resolve(v) };
  return c;
};

function makeService(attendanceSummaryResult: any[], recentAttendance: any[] = []) {
  const studentModel: any = { findOne: jest.fn(() => chain(studentDoc())) };
  const attendanceModel: any = {
    aggregate: jest.fn(async (pipeline: any[]) => {
      // Distinguish the summary aggregate (group by status) from any
      // other aggregate call by checking the pipeline shape passed in.
      return attendanceSummaryResult;
    }),
    find: jest.fn(() => chain(recentAttendance)),
  };
  const feeModel: any = { aggregate: jest.fn(async () => []), find: jest.fn(() => chain([])) };
  const behaviourModel: any = { aggregate: jest.fn(async () => []), find: jest.fn(() => chain([])) };
  const resultModel: any = { find: jest.fn(() => chain([])) };
  const n: any = {};
  const svc = new StudentsService(studentModel, attendanceModel, feeModel, behaviourModel, resultModel, n, n, n, n,
    n, n, n, n, n, n, n, n, n, n, n);
  return { svc, attendanceModel };
}

describe('getStudent360 attendance header stats', () => {
  it('does not filter the attendance summary aggregate by academicYear (the field real records routinely lack)', async () => {
    const { svc, attendanceModel } = makeService([{ _id: 'present', count: 6 }, { _id: 'absent', count: 3 }]);
    await svc.getStudent360(sid.toString(), 's');
    const summaryPipeline = attendanceModel.aggregate.mock.calls[0][0];
    const matchStage = summaryPipeline.find((s: any) => s.$match)?.$match;
    expect(matchStage).toEqual({ studentId: sid });
    expect('academicYear' in matchStage).toBe(false);
  });

  it('computes attendancePercentage via the shared rate utility, matching the Attendance Compliance/reporting formula', async () => {
    const { svc } = makeService([{ _id: 'present', count: 6 }, { _id: 'absent', count: 3 }]);
    const res: any = await svc.getStudent360(sid.toString(), 's');
    const expected = computeAttendanceRate(
      ['present', 'present', 'present', 'present', 'present', 'present', 'absent', 'absent', 'absent'],
      studentDayWeight, STUDENT_NON_SCHOOL_DAY_STATUSES,
    );
    expect(res.attendance.percentage).toBe(expected);
    expect(res.attendance.percentage).toBeCloseTo((6 / 9) * 100, 1);
  });

  it('surfaces the real absent count so the header\'s "Days Absent" is no longer stuck at 0', async () => {
    const { svc } = makeService([{ _id: 'present', count: 6 }, { _id: 'absent', count: 3 }]);
    const res: any = await svc.getStudent360(sid.toString(), 's');
    expect(res.attendance.summary.absent).toBe(3);
  });

  it('a student with genuinely zero attendance records still gets a real 0%, not a crash', async () => {
    const { svc } = makeService([]);
    const res: any = await svc.getStudent360(sid.toString(), 's');
    expect(res.attendance.percentage).toBe(0);
    expect(res.attendance.summary.absent).toBeUndefined();
    expect(res.attendance.totalDays).toBe(0);
  });

  it('a mix including late/half-day/on-leave is weighted the same way the reporting dashboard weighs it', async () => {
    const { svc } = makeService([
      { _id: 'present', count: 4 }, { _id: 'late', count: 1 }, { _id: 'half_day_am', count: 2 }, { _id: 'on_leave', count: 1 },
    ]);
    const res: any = await svc.getStudent360(sid.toString(), 's');
    // 4 present (1.0) + 1 late (1.0) + 2 half-day (0.5 each) + 1 on-leave (0) over 8 countable days
    const expectedRate = ((4 + 1 + 1) / 8) * 100;
    expect(res.attendance.percentage).toBeCloseTo(expectedRate, 1);
  });
});
