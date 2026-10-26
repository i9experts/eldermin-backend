import { ConflictException } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentAttendanceSchema } from './schemas/student-supporting.schema';

// Regression test: saving attendance from either the teacher-facing class
// register or the admin Student Attendance Register could fail with a
// generic 500 "Internal server error" because the attendance collection's
// unique index was { studentId, date } only - stale from before the
// subject-wise attendance feature added a `subject` field - so two
// different-subject records for the same student/day collided with a raw
// MongoDB E11000 duplicate-key error that nothing caught.

function makeAttendanceModel({ findOneAndUpdateImpl, bulkWriteImpl }: {
  findOneAndUpdateImpl?: (...args: any[]) => any;
  bulkWriteImpl?: (...args: any[]) => any;
} = {}) {
  return {
    findOneAndUpdate: jest.fn(findOneAndUpdateImpl ?? (async (_filter: any, update: any) => ({ _id: 'a1', ...update.$set }))),
    bulkWrite: jest.fn(bulkWriteImpl ?? (async (ops: any[]) => ({ modifiedCount: 0, upsertedCount: ops.length }))),
    db: { collection: () => ({}) },
  };
}

function makeService(attendanceModel: any) {
  const n: any = {};
  // Constructor order: studentModel, attendanceModel, feeModel, ... (21 args total).
  return new StudentsService(n, attendanceModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
}

function mongoDuplicateKeyError() {
  const err: any = new Error('E11000 duplicate key error collection: eldermin.student_attendance index: studentId_1_date_1_subject_1 dup key');
  err.code = 11000;
  return err;
}

function bulkWriteDuplicateKeyError() {
  // Mirrors the shape a MongoBulkWriteError actually carries: no top-level
  // `code`, the individual failing op's code lives under `writeErrors`.
  const err: any = new Error('E11000 duplicate key error collection: eldermin.student_attendance');
  err.writeErrors = [{ code: 11000, index: 2, errmsg: 'E11000 duplicate key error' }];
  return err;
}

describe('StudentAttendance unique index', () => {
  it('is keyed on studentId + date + subject, not just studentId + date', () => {
    const indexes = StudentAttendanceSchema.indexes();
    const uniqueIndex = indexes.find(([, opts]: any) => opts?.unique);
    expect(uniqueIndex).toBeDefined();
    const [keys] = uniqueIndex as any;
    expect(keys).toEqual({ studentId: 1, date: 1, subject: 1 });
  });
});

describe('StudentsService.markAttendance: duplicate-key handling', () => {
  it('saves normally when there is no conflict', async () => {
    const model = makeAttendanceModel();
    const svc = makeService(model);

    const result = await svc.markAttendance({
      studentId: '6adb0cb2cc237fa999a1de70',
      studentName: 'Ali Khan',
      grade: 'Grade 1',
      date: '2026-10-01',
      status: 'present',
      schoolSlug: 's',
      academicYear: '2026-27',
    } as any);

    expect(result).toBeDefined();
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('converts an E11000 duplicate-key error into a clear 409, not a raw 500', async () => {
    const model = makeAttendanceModel({
      findOneAndUpdateImpl: async () => { throw mongoDuplicateKeyError(); },
    });
    const svc = makeService(model);

    await expect(svc.markAttendance({
      studentId: '6adb0cb2cc237fa999a1de70',
      studentName: 'Ali Khan',
      grade: 'Grade 1',
      date: '2026-10-01',
      status: 'absent',
      schoolSlug: 's',
      academicYear: '2026-27',
    } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('re-throws a non-duplicate-key error unchanged', async () => {
    const model = makeAttendanceModel({
      findOneAndUpdateImpl: async () => { throw new Error('connection reset'); },
    });
    const svc = makeService(model);

    await expect(svc.markAttendance({
      studentId: '6adb0cb2cc237fa999a1de70',
      studentName: 'Ali Khan',
      grade: 'Grade 1',
      date: '2026-10-01',
      status: 'absent',
      schoolSlug: 's',
      academicYear: '2026-27',
    } as any)).rejects.toThrow('connection reset');
  });
});

describe('StudentsService.bulkMarkAttendance: duplicate-key handling', () => {
  const records = [
    { studentId: '6adb0cb2cc237fa999a1de70', studentName: 'Ali Khan', grade: 'Grade 1', section: 'A', date: '2026-10-01', status: 'present' },
    { studentId: '6adb0cb2cc237fa999a1de71', studentName: 'Sara Ahmed', grade: 'Grade 1', section: 'A', date: '2026-10-01', status: 'absent' },
  ];

  it('saves a batch of students across multiple dates without conflict', async () => {
    const model = makeAttendanceModel();
    const svc = makeService(model);

    const result = await svc.bulkMarkAttendance({
      records,
      schoolSlug: 's',
      academicYear: '2026-27',
    } as any);

    expect(result).toBeDefined();
    const [, opts] = model.bulkWrite.mock.calls[0];
    expect(opts).toEqual({ ordered: false });
  });

  it('converts a bulkWrite duplicate-key error into a clear 409, not a raw 500', async () => {
    const model = makeAttendanceModel({
      bulkWriteImpl: async () => { throw bulkWriteDuplicateKeyError(); },
    });
    const svc = makeService(model);

    await expect(svc.bulkMarkAttendance({
      records,
      schoolSlug: 's',
      academicYear: '2026-27',
    } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('re-throws a non-duplicate-key bulkWrite error unchanged', async () => {
    const model = makeAttendanceModel({
      bulkWriteImpl: async () => { throw new Error('connection reset'); },
    });
    const svc = makeService(model);

    await expect(svc.bulkMarkAttendance({
      records,
      schoolSlug: 's',
      academicYear: '2026-27',
    } as any)).rejects.toThrow('connection reset');
  });
});
