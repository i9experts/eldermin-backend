import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';

// Pins the second half of the fix for teachers appearing twice in the
// Teacher Directory: syncTeacherProfilesFromHR used to create a brand-new
// TeacherProfile for ANY Staff record with no existing profile, even when
// another TeacherProfile already existed under a different staffId with
// the exact same name - the actual stray-duplicate-Staff case reported.
// It now skips and flags that case instead of creating a second, empty
// profile.

function makeService(staffModel: any, teacherProfileModel: any) {
  const noop: any = {};
  return new TeachingService(
    teacherProfileModel, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    noop, staffModel, noop, noop, noop, noop, noop,
  );
}

describe('TeachingService.syncTeacherProfilesFromHR — duplicate Staff guard', () => {
  it('skips creating a TeacherProfile for a Staff record whose name already matches an existing TeacherProfile under a different staffId', async () => {
    const tenantId = 'tenantA';
    const duplicateStaff = { _id: new Types.ObjectId(), tenantId, firstName: 'Zaryab', lastName: 'Akram', employeeId: 'EMP-099', erpRole: 'teacher' };
    const staffModel: any = {
      find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([duplicateStaff]) }),
    };
    const teacherProfileModel: any = {
      // No profile for THIS staffId (existing = null -> goes down the
      // "create" branch), but one exists under a DIFFERENT staffId with
      // the same name (the $expr name-match lookup).
      findOne: jest.fn((filter: any) => {
        if (filter.$expr) return { select: () => ({ lean: () => Promise.resolve({ _id: 'existing-profile-id' }) }) };
        return Promise.resolve(null);
      }),
      create: jest.fn(),
      updateOne: jest.fn(),
    };

    const service = makeService(staffModel, teacherProfileModel);
    const result = await service.syncTeacherProfilesFromHR(tenantId, String(new Types.ObjectId()));

    expect(teacherProfileModel.create).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
    expect(result.skippedPossibleDuplicates).toHaveLength(1);
    expect(result.skippedPossibleDuplicates[0].name).toBe('Zaryab Akram');
  });

  it('creates normally when no other TeacherProfile shares the same name', async () => {
    const tenantId = 'tenantA';
    const newStaff = { _id: new Types.ObjectId(), tenantId, firstName: 'Brand', lastName: 'New', employeeId: 'EMP-100', erpRole: 'teacher' };
    const staffModel: any = {
      find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([newStaff]) }),
    };
    const teacherProfileModel: any = {
      findOne: jest.fn((filter: any) => {
        if (filter.$expr) return { select: () => ({ lean: () => Promise.resolve(null) }) };
        return Promise.resolve(null);
      }),
      create: jest.fn().mockResolvedValue({}),
      updateOne: jest.fn(),
    };

    const service = makeService(staffModel, teacherProfileModel);
    const result = await service.syncTeacherProfilesFromHR(tenantId, String(new Types.ObjectId()));

    expect(teacherProfileModel.create).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(1);
    expect(result.skippedPossibleDuplicates).toHaveLength(0);
  });
});
