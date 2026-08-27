import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';

// Unit tests for the conflict-enforcement `force` flag on
// createTimetable/updateTimetable. checkConflicts() itself already has
// real behavior (teacher/room/duty clash detection); these tests only
// verify the new enforce-vs-advisory branching around it, so the
// mongoose models are hand-rolled fakes rather than a full Nest testing
// module - the same lightweight approach as this repo's other
// service-level *.spec.ts files.

function makeService(existingPeriods: any[]) {
  const otherTimetable = {
    _id: new Types.ObjectId(),
    gradeLevel: '5',
    sectionName: 'A',
    status: 'active',
    periods: existingPeriods,
  };

  const timetableModel: any = {
    find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([otherTimetable]) }),
    create: jest.fn((doc: any) => Promise.resolve({ ...doc, _id: new Types.ObjectId(), toObject() { return this; } })),
    findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.resolve({ _id: 'tt1', ...existingPeriods }) }),
  };
  const dutyRosterModel: any = { find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([]) }) };
  const noop: any = {};

  const service = new TeachingService(
    noop, // teacherProfileModel
    noop, // lessonPlanModel
    timetableModel,
    noop, // roomModel
    noop, // periodTemplateModel
    noop, // assignmentModel
    noop, // behaviourModel
    noop, // electiveGroupModel
    dutyRosterModel,
    noop, // pdfService
  );
  return { service, timetableModel };
}

const teacherId = new Types.ObjectId().toString();

const clashingPeriod = {
  day: 1, periodNo: 1, startTime: '08:00', endTime: '08:40',
  teacherId, teacherName: 'Ms. Clash', roomNo: '', weekCycle: 'both',
};

const newPeriodSameTeacherSameTime = {
  day: 1, periodNo: 1, startTime: '08:00', endTime: '08:40',
  teacherId, teacherName: 'Ms. Clash', roomNo: '', weekCycle: 'both',
};

const nonClashingPeriod = {
  day: 1, periodNo: 2, startTime: '09:00', endTime: '09:40',
  teacherId: new Types.ObjectId().toString(), teacherName: 'Ms. Free', roomNo: '', weekCycle: 'both',
};

describe('TeachingService conflict enforcement', () => {
  describe('createTimetable', () => {
    it('rejects with 409 when conflicts exist and force is not passed', async () => {
      const { service } = makeService([clashingPeriod]);
      await expect(
        service.createTimetable('tenant1', new Types.ObjectId().toString(), {
          gradeLevel: '5', sectionName: 'B', periods: [newPeriodSameTeacherSameTime],
        }, new Types.ObjectId().toString()),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('saves and still returns conflicts when force:true is passed despite conflicts', async () => {
      const { service, timetableModel } = makeService([clashingPeriod]);
      const result: any = await service.createTimetable('tenant1', new Types.ObjectId().toString(), {
        gradeLevel: '5', sectionName: 'B', periods: [newPeriodSameTeacherSameTime], force: true,
      }, new Types.ObjectId().toString());

      expect(timetableModel.create).toHaveBeenCalledTimes(1);
      expect(result.conflicts.length).toBeGreaterThan(0);
      // force must never be persisted onto the document
      expect(timetableModel.create.mock.calls[0][0]).not.toHaveProperty('force');
    });

    it('saves normally (backward compatible) when there are no conflicts, force omitted', async () => {
      const { service, timetableModel } = makeService([clashingPeriod]);
      const result: any = await service.createTimetable('tenant1', new Types.ObjectId().toString(), {
        gradeLevel: '5', sectionName: 'B', periods: [nonClashingPeriod],
      }, new Types.ObjectId().toString());

      expect(timetableModel.create).toHaveBeenCalledTimes(1);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('updateTimetable', () => {
    it('rejects with 409 when conflicts exist and force is not passed', async () => {
      const { service } = makeService([clashingPeriod]);
      await expect(
        service.updateTimetable('tenant1', 'tt-id', { periods: [newPeriodSameTeacherSameTime] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('saves when force:true is passed despite conflicts', async () => {
      const { service, timetableModel } = makeService([clashingPeriod]);
      const result: any = await service.updateTimetable('tenant1', 'tt-id', {
        periods: [newPeriodSameTeacherSameTime], force: true,
      });
      expect(timetableModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('saves normally when no conflicts exist, force omitted', async () => {
      const { service, timetableModel } = makeService([clashingPeriod]);
      const result: any = await service.updateTimetable('tenant1', 'tt-id', {
        periods: [nonClashingPeriod],
      });
      expect(timetableModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(result.conflicts).toEqual([]);
    });

    it('saves normally when periods are not part of the update at all', async () => {
      const { service, timetableModel } = makeService([clashingPeriod]);
      const result: any = await service.updateTimetable('tenant1', 'tt-id', { gradeLevel: '6' });
      expect(timetableModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(result.conflicts).toEqual([]);
    });
  });
});
