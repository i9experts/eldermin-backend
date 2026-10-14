import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { idForms } from '../common/utils/id-forms.util';

/**
 * Student attendance upsert (one record per student, day and subject).
 *
 * studentId is stored as a STRING by the bulk route (the DTO string went through `$set`) and as an ObjectId by the single route,
 * and the declared ObjectId path is Mixed (B0_ID_TYPING.md), so the old filter `studentId: ObjectId(...)` did not match a record
 * written as a string and a second save of the same student+day INSERTED again -> E11000 on the unique index -> HTTP 500.
 * The filter now matches BOTH forms (same pattern as the My Leave fix); the stored form of an existing record is never changed
 * (studentId is only set when the record is created, in the same form the route always used).
 */
export function attendanceUpsert(
  record: Record<string, any>,
  scope: { schoolSlug: string; academicYear?: string },
  date: Date,
  insertStudentId: string | Types.ObjectId,
) {
  const sid = String(record.studentId ?? '');
  if (!Types.ObjectId.isValid(sid)) throw new BadRequestException('Invalid student id');
  const subject = record.subject ? String(record.subject) : null;
  const { studentId: _omit, ...rest } = record;
  const $set: Record<string, any> = { ...rest, date, schoolSlug: scope.schoolSlug, subject };
  if (scope.academicYear !== undefined) $set.academicYear = scope.academicYear;
  return {
    filter: { studentId: idForms(sid), date, schoolSlug: scope.schoolSlug, subject },
    update: { $set, $setOnInsert: { studentId: insertStudentId } },
    upsert: true,
  };
}

export const SUBJECT_INDEX_PENDING_MESSAGE =
  'Subject-wise attendance needs the student-attendance database index migration (migrate-student-attendance-index) before a second subject can be saved for the same student and day.';

/**
 * A duplicate-key error from the attendance write is a clear 409, never a 500. While the old unique index {studentId, date} still
 * exists (migration not run yet) a subject-wise save of a second subject hits it: the message says so.
 */
export function attendanceWriteError(err: any, hasSubject: boolean): never {
  const code = err?.code ?? err?.writeErrors?.[0]?.code ?? err?.result?.writeErrors?.[0]?.code;
  const text = String(err?.message || '');
  if (code === 11000 || /E11000/.test(text)) {
    if (hasSubject && /index:\s*studentId_1_date_1\s+dup key/.test(text)) throw new ConflictException(SUBJECT_INDEX_PENDING_MESSAGE);
    throw new ConflictException('Attendance for this student, day and subject was changed at the same time. Please reload and try again.');
  }
  throw err;
}
