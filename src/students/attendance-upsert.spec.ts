import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { attendanceUpsert, attendanceWriteError, SUBJECT_INDEX_PENDING_MESSAGE } from './attendance-upsert.util';
import { StudentsService } from './students.service';

const SID = new Types.ObjectId().toHexString();
const day = new Date('2026-10-05T00:00:00.000Z');
const scope = { schoolSlug: 'sch', academicYear: '2026-27' };

describe('attendanceUpsert (both id forms, one record per student+day+subject)', () => {
  it('filter matches the student as string AND ObjectId, inside the school, with the subject (null for daily)', () => {
    const op: any = attendanceUpsert({ studentId: SID, status: 'present', grade: 'G' }, scope, day, SID);
    expect(op.filter.studentId.$in.map(String)).toEqual([SID, SID]);
    expect(op.filter.studentId.$in.map((x: any) => typeof x).sort()).toEqual(['object', 'string']);
    expect(op.filter).toMatchObject({ date: day, schoolSlug: 'sch', subject: null });
    expect(op.upsert).toBe(true);
  });
  it('the subject is part of the match key', () => {
    expect((attendanceUpsert({ studentId: SID, subject: 'Maths' }, scope, day, SID) as any).filter.subject).toBe('Maths');
    expect((attendanceUpsert({ studentId: SID, subject: '' }, scope, day, SID) as any).filter.subject).toBeNull();
  });
  it('studentId is NOT in $set (an existing record keeps its stored id form) and is only written on insert', () => {
    const oid = new Types.ObjectId(SID);
    const op: any = attendanceUpsert({ studentId: SID, status: 'late', studentName: 'A' }, scope, day, oid);
    expect(op.update.$set.studentId).toBeUndefined();
    expect(op.update.$setOnInsert).toEqual({ studentId: oid });
    expect(op.update.$set).toMatchObject({ status: 'late', studentName: 'A', schoolSlug: 'sch', academicYear: '2026-27', subject: null, date: day });
  });
  it('the school always comes from the scope, never from the record body (a body schoolSlug cannot move a record)', () => {
    const op: any = attendanceUpsert({ studentId: SID, schoolSlug: 'evil' }, scope, day, SID);
    expect(op.filter.schoolSlug).toBe('sch');
    expect(op.update.$set.schoolSlug).toBe('sch');
  });
  it('no academicYear key when the scope has none (nothing is blanked)', () => {
    expect('academicYear' in (attendanceUpsert({ studentId: SID }, { schoolSlug: 's' }, day, SID) as any).update.$set).toBe(false);
  });
  it('a malformed or missing student id is a 400, never a 500', () => {
    for (const bad of ['nope', '', undefined, null, 12]) expect(() => attendanceUpsert({ studentId: bad as any }, scope, day, 'x')).toThrow(BadRequestException);
  });
});

describe('attendanceWriteError', () => {
  const e11 = (index: string) => Object.assign(new Error(`E11000 duplicate key error collection: db.student_attendance index: ${index} dup key: { studentId: "x" }`), { code: 11000 });
  it('old unique index + a subject save -> 409 saying the migration is pending', () => {
    try { attendanceWriteError(e11('studentId_1_date_1'), true); fail('should throw'); } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.message).toBe(SUBJECT_INDEX_PENDING_MESSAGE);
    }
  });
  it('any other duplicate key (including the new index or a daily save) -> a generic 409', () => {
    for (const [idx, subj] of [['studentId_1_date_1', false], ['studentId_1_date_1_subject_1', true], ['studentId_1_date_1_subject_1', false]] as const) {
      try { attendanceWriteError(e11(idx), subj); fail('should throw'); } catch (e: any) {
        expect(e).toBeInstanceOf(ConflictException);
        expect(e.message).not.toBe(SUBJECT_INDEX_PENDING_MESSAGE);
      }
    }
  });
  it('a bulk write error carrying code 11000 in writeErrors is recognised; other errors are rethrown unchanged', () => {
    expect(() => attendanceWriteError({ message: 'x', writeErrors: [{ code: 11000 }] }, false)).toThrow(ConflictException);
    const other = new Error('boom');
    expect(() => attendanceWriteError(other, false)).toThrow(other);
  });
});

describe('StudentsService attendance saves', () => {
  function svc(model: any) { const s: any = Object.create(StudentsService.prototype); s.attendanceModel = model; s.notifyAttendance = jest.fn(async () => undefined); return s as StudentsService; }
  // The four tests that exercised markAttendance/bulkMarkAttendance with attendanceUpsert were removed in the release merge: main's own
  // write path (see attendance-studentid-type-mismatch.spec.ts) replaced it, so attendanceUpsert is no longer wired into those methods.
  it('the per-student summary matches both id forms (aggregate bypasses the id-match plugin)', async () => {
    const aggregate = jest.fn(async () => []);
    await svc({ aggregate }).getStudentAttendanceSummary(SID, 'sch');
    const match = (aggregate.mock.calls[0] as any[])[0][0].$match;
    expect(match.studentId.$in).toHaveLength(2);
    expect(match.schoolSlug).toBe('sch');
  });
});
