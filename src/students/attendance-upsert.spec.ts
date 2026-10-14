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
  it('bulk: one updateOne per record with the two-form filter; a second save of the same day builds the same match key', async () => {
    const bulkWrite = jest.fn(async (ops: any[]) => ({ ok: ops.length }));
    const s = svc({ bulkWrite });
    const dto: any = { schoolSlug: 'sch', academicYear: '2026-27', records: [{ studentId: SID, studentName: 'A', grade: 'G', section: 'A', date: '2026-10-05', status: 'present' }] };
    await s.bulkMarkAttendance(dto);
    await s.bulkMarkAttendance({ ...dto, records: [{ ...dto.records[0], status: 'late' }] });
    const [a, b] = bulkWrite.mock.calls.map((c) => c[0][0].updateOne);
    expect(a.filter).toEqual(b.filter);
    expect(a.filter.studentId.$in).toHaveLength(2);
    expect(b.update.$set.status).toBe('late');
    expect(b.update.$set.studentId).toBeUndefined();
  });
  it('bulk: an E11000 from the database is a 409 (not a 500); a subject save before the migration says so', async () => {
    const err = Object.assign(new Error('E11000 duplicate key error collection: db.student_attendance index: studentId_1_date_1 dup key: {}'), { code: 11000 });
    const s = svc({ bulkWrite: jest.fn(async () => { throw err; }) });
    const base: any = { schoolSlug: 'sch', academicYear: 'y', records: [{ studentId: SID, date: '2026-10-05', status: 'present' }] };
    await expect(s.bulkMarkAttendance(base)).rejects.toBeInstanceOf(ConflictException);
    await expect(s.bulkMarkAttendance({ ...base, records: [{ ...base.records[0], subject: 'Maths' }] })).rejects.toThrow(/migration/);
  });
  it('bulk: a malformed student id is a 400 and nothing is written', async () => {
    const bulkWrite = jest.fn();
    await expect(svc({ bulkWrite }).bulkMarkAttendance({ schoolSlug: 's', records: [{ studentId: 'bad', date: '2026-10-05', status: 'present' }] } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(bulkWrite).not.toHaveBeenCalled();
  });
  it('single save: same two-form filter, ObjectId only on insert', async () => {
    const findOneAndUpdate = jest.fn(async () => ({ _id: 'r' }));
    await svc({ findOneAndUpdate }).markAttendance({ studentId: SID, studentName: 'A', grade: 'G', date: '2026-10-05', status: 'present', schoolSlug: 'sch', subject: 'Maths' } as any);
    const [filter, update] = findOneAndUpdate.mock.calls[0] as any[];
    expect(filter.studentId.$in).toHaveLength(2);
    expect(filter.subject).toBe('Maths');
    expect(update.$set.studentId).toBeUndefined();
    expect(update.$setOnInsert.studentId).toBeInstanceOf(Types.ObjectId);
  });
  it('the per-student summary matches both id forms (aggregate bypasses the id-match plugin)', async () => {
    const aggregate = jest.fn(async () => []);
    await svc({ aggregate }).getStudentAttendanceSummary(SID, 'sch');
    const match = (aggregate.mock.calls[0] as any[])[0][0].$match;
    expect(match.studentId.$in).toHaveLength(2);
    expect(match.schoolSlug).toBe('sch');
  });
});
