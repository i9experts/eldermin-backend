import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { assertValidObjectId, isWellFormedObjectId } from './object-id.util';
import { TeachingService } from '../../modules/teaching/teaching.service';
import { PTMService } from '../../modules/teaching/ptm.service';
import { BehaviourService } from '../../behaviour/behaviour.service';
import { StudentsService } from '../../students/students.service';
import { makeAssessmentService, teacherUser } from '../../assessments/assessment-test-fakes';

// Fakes only. Malformed ids answer 400 `Invalid <x> id` before any DB call (was a CastError -> 500).
const BAD = ['not-an-id', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', 'abcdefghijkl'];
const GOOD = new Types.ObjectId().toString();
const chain = (v: any) => ({ lean: () => Promise.resolve(v), select() { return this; } });

describe('object-id util', () => {
  it('accepts 24-hex strings and ObjectIds only', () => {
    expect(isWellFormedObjectId(GOOD)).toBe(true);
    expect(isWellFormedObjectId(new Types.ObjectId())).toBe(true);
    for (const b of [...BAD, '', undefined, null, 12, {}]) expect(isWellFormedObjectId(b as any)).toBe(false);
  });
  it('throws 400 with the label', () => {
    expect(() => assertValidObjectId('x', 'lesson plan')).toThrow(new BadRequestException('Invalid lesson plan id'));
    expect(() => assertValidObjectId(GOOD, 'lesson plan')).not.toThrow();
  });
});

describe('malformed id -> 400 on teacher-app routes', () => {
  const lessonPlanModel: any = { findOne: jest.fn(() => chain(null)), findOneAndUpdate: jest.fn(() => chain(null)) };
  const assignmentModel: any = { findOne: jest.fn(async () => null) };
  const noop: any = {};
  const staffModel: any = { findOne: jest.fn(() => chain({ _id: new Types.ObjectId() })) };
  const teaching = new TeachingService({ findOne: jest.fn(() => chain({ _id: new Types.ObjectId() })) } as any, lessonPlanModel, noop, noop, noop, assignmentModel, noop, noop, noop, noop, staffModel, noop, noop, noop, noop);
  const teacher = { userId: new Types.ObjectId().toString(), role: 'teacher', schoolSlug: 's' };

  it.each(BAD)('PATCH /teaching/lesson-plans/%s: 400 "Invalid lesson plan id" for teacher and admin, no query', async (bad) => {
    for (const u of [teacher, { ...teacher, role: 'principal' }]) {
      await expect(teaching.updateLessonPlan('t', bad, { topic: 'x' }, u)).rejects.toThrow(new BadRequestException('Invalid lesson plan id'));
    }
    await expect(teaching.approveLessonPlan('t', bad, GOOD, '')).rejects.toBeInstanceOf(BadRequestException);
    await expect(teaching.rejectLessonPlan('t', bad, '')).rejects.toBeInstanceOf(BadRequestException);
    expect(lessonPlanModel.findOne).not.toHaveBeenCalled();
    expect(lessonPlanModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('well-formed unknown lesson plan id: teacher gets null, admin findOneAndUpdate result (unchanged)', async () => {
    lessonPlanModel.findOne.mockClear();
    await expect(teaching.updateLessonPlan('t', GOOD, { topic: 'x' }, teacher)).resolves.toBeNull();
    await expect(teaching.updateLessonPlan('t', GOOD, { topic: 'x' }, { ...teacher, role: 'principal' })).resolves.toBeNull();
    expect(lessonPlanModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
  it('assignments, submissions, behaviour notes (teaching module)', async () => {
    await expect(teaching.updateAssignment('t', 'bad', {}, teacher)).rejects.toThrow('Invalid assignment id');
    await expect(teaching.deleteAssignment('t', 'bad', teacher)).rejects.toThrow('Invalid assignment id');
    await expect(teaching.getSubmissionsForAssignment('t', 'bad', teacher)).rejects.toThrow('Invalid assignment id');
    await expect(teaching.gradeSubmission('t', 'bad', GOOD, { grade: 1 } as any, teacher)).rejects.toThrow('Invalid assignment id');
    await expect(teaching.gradeSubmission('t', GOOD, 'bad', { grade: 1 } as any, teacher)).rejects.toThrow('Invalid submission id');
    await expect(teaching.updateBehaviourNote('t', 'bad', {})).rejects.toThrow('Invalid behaviour record id');
    expect(assignmentModel.findOne).not.toHaveBeenCalled();
  });
  it('well-formed unknown assignment id keeps 404', async () => {
    await expect(teaching.updateAssignment('t', GOOD, {}, teacher)).rejects.toThrow('Assignment not found');
  });

  it('PTM routes', async () => {
    const ptm = new PTMService({} as any, {} as any, {} as any, {} as any, undefined, {} as any);
    await expect(ptm.getMeetingById('bad', 't')).rejects.toThrow('Invalid meeting id');
    await expect(ptm.getStudentHistory('bad', 't')).rejects.toThrow('Invalid student id');
    await expect(ptm.confirmMeeting('bad', 't')).rejects.toThrow('Invalid meeting id');
    await expect(ptm.reschedule('bad', 't', { scheduledDate: '2026-01-01' }, teacher)).rejects.toThrow('Invalid meeting id');
    await expect(ptm.recordOutcome('bad', 't', { parentAttended: true }, teacher)).rejects.toThrow('Invalid meeting id');
    await expect(ptm.updateActionItem('bad', GOOD, 't', 'done')).rejects.toThrow('Invalid meeting id');
    await expect(ptm.cancelMeeting('bad', 't', 'r', 'x')).rejects.toThrow('Invalid meeting id');
  });

  it('behaviour records (controller service)', async () => {
    const recordModel: any = { findOne: jest.fn(), findOneAndUpdate: jest.fn(), aggregate: jest.fn() };
    const svc = new BehaviourService(recordModel, noop, noop, noop, noop, noop);
    await expect(svc.getRecordById('bad', 's')).rejects.toThrow('Invalid behaviour record id');
    await expect(svc.updateRecord('bad', 's', {})).rejects.toThrow('Invalid behaviour record id');
    await expect(svc.resolveRecord('bad', 's', 'n', 'u')).rejects.toThrow('Invalid behaviour record id');
    await expect(svc.getStudentBehaviourProfile('bad', 's')).rejects.toThrow('Invalid student id');
    expect(recordModel.findOne).not.toHaveBeenCalled();
    expect(recordModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('students by id (360, detail, attendance summary)', async () => {
    const studentModel: any = { findOne: jest.fn() };
    const n: any = {};
    const svc = new StudentsService(studentModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
    await expect(svc.getStudentById('bad', 's')).rejects.toThrow('Invalid student id');
    await expect(svc.getStudent360('bad', 's', teacher)).rejects.toThrow('Invalid student id');
    await expect(svc.getStudentAttendanceSummary('bad', 's')).rejects.toThrow('Invalid student id');
    expect(studentModel.findOne).not.toHaveBeenCalled();
  });

  it('quiz attempts and report card remarks', async () => {
    const { service, quizAttemptModel, reportCardModel } = makeAssessmentService({});
    await expect(service.getQuizAttemptForReview('s', 'bad', teacherUser())).rejects.toThrow('Invalid quiz attempt id');
    await expect(service.gradeQuizAttempt('s', 'bad', [], 'u', teacherUser())).rejects.toThrow('Invalid quiz attempt id');
    expect(quizAttemptModel.findOne).not.toHaveBeenCalled();
    // admin: malformed -> 400 (was a 500 CastError); teacher keeps its documented 404; well-formed unknown admin unchanged
    await expect(service.updateReportCardRemarks('bad', 's', { classTeacherRemarks: 'x' } as any, teacherUser({ role: 'principal' }))).rejects.toThrow('Invalid report card id');
    await expect(service.updateReportCardRemarks('bad', 's', { classTeacherRemarks: 'x' } as any, teacherUser())).rejects.toThrow('Report card not found');
    await expect(service.updateReportCardRemarks(GOOD, 's', { classTeacherRemarks: 'x' } as any, teacherUser({ role: 'principal' }))).resolves.toBeNull();
    expect(reportCardModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});
