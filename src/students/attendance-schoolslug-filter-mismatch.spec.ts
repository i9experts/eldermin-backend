import { StudentsService } from './students.service';

// Pins the fix for a DETERMINISTIC (not race-based) attendance save
// failure: a teacher's browser network tab showed exactly ONE bulk-save
// request, which 409'd directly - ruling out the "two concurrent
// requests racing an insert" explanation #236/#237 were built around.
//
// Real root cause: the StudentAttendance unique index is
// {studentId, date, subject} - schoolSlug is NOT part of it. But the
// upsert's match filter required schoolSlug to also match exactly. Since
// schoolSlug on a request comes from the caller's JWT (baked in at login,
// not re-fetched per request - see jwt.strategy.ts), a session whose
// token carries a schoolSlug that no longer matches what's actually
// stored on an existing record (after any correction/migration) would
// have its filter match NOTHING, forcing an INSERT attempt that then
// collides with the unique index's (studentId, date, subject) key the
// existing record already holds - the exact same way, every single time,
// for the exact same record. The fix: match on the unique index's own
// fields only; schoolSlug is still written (and thereby corrected) on
// every save.

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
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  return new StudentsService(n, attendanceModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
}

describe('markAttendance - upsert filter matches the unique index, not schoolSlug', () => {
  it('finds and updates an existing record even when its stored schoolSlug differs from the current request (self-heals the drift)', async () => {
    let capturedFilter: any;
    let capturedSet: any;
    const model = makeAttendanceModel({
      findOneAndUpdateImpl: async (filter: any, update: any) => {
        capturedFilter = filter;
        capturedSet = update.$set;
        return { _id: 'existing-doc', ...update.$set };
      },
    });
    const svc = makeService(model);

    await svc.markAttendance({
      studentId: '6adb0cb2cc237fa999a1de70',
      studentName: 'Ali Khan',
      grade: 'Grade 1',
      date: '2026-10-01',
      status: 'present',
      schoolSlug: 'the-deenway-school-abu-ayub-ansari-campus-1',
      academicYear: '2026-27',
    } as any);

    // The match filter must NOT constrain on schoolSlug - only the real
    // unique index fields - so a record whose stored schoolSlug has
    // drifted is still found (and updated) instead of missed.
    expect(capturedFilter).not.toHaveProperty('schoolSlug');
    expect(capturedFilter.studentId).toBeDefined();
    expect(capturedFilter.date).toBeInstanceOf(Date);
    expect(capturedFilter.subject).toBeNull();
    // schoolSlug IS still written, correcting any drift going forward.
    expect(capturedSet.schoolSlug).toBe('the-deenway-school-abu-ayub-ansari-campus-1');
  });
});

describe('bulkMarkAttendance - upsert filter matches the unique index, not schoolSlug', () => {
  it('builds each op\'s filter without schoolSlug, so a drifted record is found and corrected instead of colliding on insert', async () => {
    let capturedOps: any[] = [];
    const model = makeAttendanceModel({
      bulkWriteImpl: async (ops: any[]) => {
        capturedOps = ops;
        return { modifiedCount: ops.length, upsertedCount: 0 };
      },
    });
    const svc = makeService(model);

    await svc.bulkMarkAttendance({
      records: [
        { studentId: '6adb0cb2cc237fa999a1de70', studentName: 'Ali Khan', grade: 'Grade 1', section: 'A', date: '2026-10-01', status: 'present' },
      ],
      schoolSlug: 'the-deenway-school-abu-ayub-ansari-campus-1',
      academicYear: '2026-27',
    } as any);

    const filter = capturedOps[0].updateOne.filter;
    expect(filter).not.toHaveProperty('schoolSlug');
    expect(filter.studentId).toBeDefined();
    expect(filter.date).toBeInstanceOf(Date);
    expect(filter.subject).toBeNull();
    expect(capturedOps[0].updateOne.update.$set.schoolSlug).toBe('the-deenway-school-abu-ayub-ansari-campus-1');
  });
});
