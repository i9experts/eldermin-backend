import { StudentsService } from './students.service';
import { Types } from 'mongoose';

// Pins the ACTUAL root cause of the recurring attendance bulk-save 409,
// confirmed directly from production data after the stale
// studentId_1_date_1 index (the suspect in three earlier, unsuccessful
// fixes) was dropped and the exact same 409 still reproduced
// deterministically for the exact same students on every attempt.
//
// Querying the live student_attendance collection showed this
// collection has years of records with `studentId` stored as a plain
// STRING (raw bulkWrite/driver-level writes bypass Mongoose's schema
// casting) alongside newer records stored as a real ObjectId. The
// upsert filter here used ONLY `new Types.ObjectId(studentId)`, which
// does not match a string-typed field in MongoDB's BSON-type-sensitive
// equality - Mongo found zero matching documents, attempted an INSERT,
// and that insert's own $set (which used to spread the DTO's own
// string-typed studentId straight through) collided with the exact
// (studentId, date, subject) key the string-typed record already held.
// Deterministic, not a race - the same students failed the same way on
// every retry, no matter how many times.
//
// The fix: match studentId as EITHER its string or ObjectId form, and
// always WRITE the canonical ObjectId form, self-healing every record
// to a consistent type on save (the same self-healing pattern already
// used for schoolSlug drift).

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

const studentId = '6aaa2426cc4acab823ab0846';

describe('markAttendance - studentId match tolerates a string-typed existing record', () => {
  it('filters on both the string and ObjectId form of studentId', async () => {
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
      studentId, studentName: 'Ayesha Siddiqua', grade: 'Kindergarten', date: '2026-10-01',
      status: 'present', schoolSlug: 's', academicYear: '2026-27',
    } as any);

    expect(capturedFilter.studentId).toEqual({ $in: [studentId, new Types.ObjectId(studentId)] });
    // Always writes the canonical ObjectId form, healing a string-typed record going forward.
    expect(capturedSet.studentId).toBeInstanceOf(Types.ObjectId);
    expect(capturedSet.studentId.toString()).toBe(studentId);
  });
});

describe('bulkMarkAttendance - studentId match tolerates a string-typed existing record', () => {
  it('builds each op\'s filter to match both the string and ObjectId form of studentId', async () => {
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
        { studentId, studentName: 'Ayesha Siddiqua', grade: 'Kindergarten', section: 'KG C', date: '2026-10-01', status: 'late' },
      ],
      schoolSlug: 's', academicYear: '2026-27',
    } as any);

    const op = capturedOps[0].updateOne;
    expect(op.filter.studentId).toEqual({ $in: [studentId, new Types.ObjectId(studentId)] });
    expect(op.update.$set.studentId).toBeInstanceOf(Types.ObjectId);
    expect(op.update.$set.studentId.toString()).toBe(studentId);
  });

  it('would have found (not missed) a legacy string-typed studentId record, given a filter simulating that stored shape', async () => {
    // Simulates the exact failure mode: an existing doc stored with
    // studentId as a plain string. A model whose findOneAndUpdate-style
    // matching actually evaluates the $in filter against a string value
    // confirms the new filter shape matches it (whereas the old
    // ObjectId-only filter would not).
    const existingDoc = { studentId, date: new Date('2026-10-01T00:00:00.000Z'), subject: null };
    const model = makeAttendanceModel({
      bulkWriteImpl: async (ops: any[]) => {
        const op = ops[0].updateOne;
        const matches = op.filter.studentId.$in.includes(existingDoc.studentId);
        expect(matches).toBe(true);
        return { modifiedCount: 1, upsertedCount: 0 };
      },
    });
    const svc = makeService(model);

    await svc.bulkMarkAttendance({
      records: [{ studentId, studentName: 'Ayesha Siddiqua', grade: 'Kindergarten', section: 'KG C', date: '2026-10-01', status: 'present' }],
      schoolSlug: 's', academicYear: '2026-27',
    } as any);
  });
});
