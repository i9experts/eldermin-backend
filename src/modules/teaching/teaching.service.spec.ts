import { BadRequestException, ConflictException } from '@nestjs/common';
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
    findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(null) }),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
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
    noop, // submissionModel
    noop, // behaviourModel
    noop, // electiveGroupModel
    dutyRosterModel,
    noop, // classDiaryModel
    noop, // staffModel
    noop, // userModel
    noop, // notificationModel
    noop, // attendanceSettingsModel
    noop, // pdfService
    noop, // configService
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

  describe('deleteTimetable', () => {
    it('refuses to delete an active timetable', async () => {
      const { service, timetableModel } = makeService([]);
      timetableModel.findOne.mockReturnValue({ lean: () => Promise.resolve({ _id: 'tt-id', status: 'active' }) });

      await expect(service.deleteTimetable('tenant1', 'tt-id')).rejects.toThrow(
        'Cannot delete an active timetable. Set it to Draft first, then delete.',
      );
      expect(timetableModel.deleteOne).not.toHaveBeenCalled();
    });

    it('deletes a draft timetable', async () => {
      const { service, timetableModel } = makeService([]);
      timetableModel.findOne.mockReturnValue({ lean: () => Promise.resolve({ _id: 'tt-id', status: 'draft' }) });

      const result = await service.deleteTimetable('tenant1', 'tt-id');
      expect(timetableModel.deleteOne).toHaveBeenCalledWith({ _id: 'tt-id', tenantId: 'tenant1' });
      expect(result).toEqual({ deleted: true });
    });

    it('throws NotFoundException when the timetable does not exist', async () => {
      const { service } = makeService([]);
      await expect(service.deleteTimetable('tenant1', 'missing-id')).rejects.toThrow('Timetable not found');
    });
  });
});

// updateTeacherProfile previously had no try/catch around its
// findOneAndUpdate, unlike its sibling createTeacherProfile - a raw
// Mongoose ValidationError/CastError or a duplicate-key error propagated
// straight to the global exception filter as a generic 500 instead of a
// clear 400/409. These tests pin the now-matching error handling.
function makeTeacherProfileService(teacherProfileModel: any) {
  const noop: any = {};
  return new TeachingService(
    teacherProfileModel,
    noop, // lessonPlanModel
    noop, // timetableModel
    noop, // roomModel
    noop, // periodTemplateModel
    noop, // assignmentModel
    noop, // submissionModel
    noop, // behaviourModel
    noop, // electiveGroupModel
    noop, // dutyRosterModel
    noop, // classDiaryModel
    noop, // staffModel
    noop, // userModel
    noop, // notificationModel
    noop, // attendanceSettingsModel
    noop, // pdfService
    noop, // configService
  );
}

describe('TeachingService.updateTeacherProfile error handling', () => {
  it('converts a ValidationError into a BadRequestException (400), not a raw 500', async () => {
    const err: any = new Error('maxPeriodsPerDay must be a number');
    err.name = 'ValidationError';
    const teacherProfileModel: any = {
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.reject(err) }),
    };
    const service = makeTeacherProfileService(teacherProfileModel);

    await expect(
      service.updateTeacherProfile('tenant1', 'profile-id', { maxPeriodsPerDay: 'not-a-number' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('converts a CastError from findOneAndUpdate into a BadRequestException (400)', async () => {
    const err: any = new Error('Cast to ObjectId failed');
    err.name = 'CastError';
    const teacherProfileModel: any = {
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.reject(err) }),
    };
    const service = makeTeacherProfileService(teacherProfileModel);

    await expect(
      service.updateTeacherProfile('tenant1', 'profile-id', { maxPeriodsPerDay: 6 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('converts a malformed campusId (invalid ObjectId string, thrown before the DB call) into a BadRequestException', async () => {
    // Regression: the campusId -> ObjectId cast used to run OUTSIDE the
    // try/catch, so a bad campusId threw a raw BSONError that still hit
    // the generic 500 handler instead of this method's own error handling.
    const teacherProfileModel: any = {
      findOneAndUpdate: jest.fn(),
    };
    const service = makeTeacherProfileService(teacherProfileModel);

    await expect(
      service.updateTeacherProfile('tenant1', 'profile-id', { campusId: 'not-a-valid-object-id' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(teacherProfileModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('converts a duplicate-key error into a ConflictException (409)', async () => {
    const err: any = new Error('E11000 duplicate key');
    err.code = 11000;
    const teacherProfileModel: any = {
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.reject(err) }),
    };
    const service = makeTeacherProfileService(teacherProfileModel);

    await expect(
      service.updateTeacherProfile('tenant1', 'profile-id', { staffId: new Types.ObjectId().toString() }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('re-throws an unexpected error unchanged', async () => {
    const err = new Error('unexpected db outage');
    const teacherProfileModel: any = {
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.reject(err) }),
    };
    const service = makeTeacherProfileService(teacherProfileModel);

    await expect(
      service.updateTeacherProfile('tenant1', 'profile-id', { maxPeriodsPerDay: 5 }),
    ).rejects.toBe(err);
  });

  it('still saves normally on success, unaffected by the added error handling', async () => {
    const updated = { _id: 'profile-id', maxPeriodsPerDay: 6, maxPeriodsPerWeek: 30 };
    const teacherProfileModel: any = {
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.resolve(updated) }),
    };
    const service = makeTeacherProfileService(teacherProfileModel);

    const result = await service.updateTeacherProfile('tenant1', 'profile-id', {
      maxPeriodsPerDay: 6,
      maxPeriodsPerWeek: 30,
    });
    expect(result).toEqual(updated);
    expect(teacherProfileModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('sanitizes a cleared campusId ("") into null rather than writing the raw string', async () => {
    const teacherProfileModel: any = {
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: () => Promise.resolve({ _id: 'profile-id', campusId: null }) }),
    };
    const service = makeTeacherProfileService(teacherProfileModel);

    await service.updateTeacherProfile('tenant1', 'profile-id', { campusId: '' });
    const [, update] = teacherProfileModel.findOneAndUpdate.mock.calls[0];
    expect(update.$set.campusId).toBeNull();
  });
});
