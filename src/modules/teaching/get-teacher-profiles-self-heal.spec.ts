import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';

// Teachers added since the last manual "Sync from HR" click (or if it was
// never clicked) had no TeacherProfile row, so they couldn't appear in -
// or select themselves from - any of the "pick a teacher" dropdowns across
// the Teaching module (Class Diary, Homework, Syllabus, Timetable, etc.),
// all of which share this one getTeacherProfiles() call. A teacher's own
// department-scoped visibility could also silently exclude their own
// profile if its denormalized `department` didn't exactly match their
// JWT's department claim. Both are fixed here: the requester's own
// TeacherProfile is lazily upserted if missing, and the final query always
// includes it regardless of department scope.

function makeService(staffModel: any, teacherProfileModel: any) {
  const noop: any = {};
  return new TeachingService(
    teacherProfileModel, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    noop, staffModel, noop, noop, noop, noop, noop,
  );
}

function makeFindChain(result: any) {
  return { populate: () => ({ sort: () => ({ lean: () => Promise.resolve(result) }) }) };
}

describe('TeachingService.getTeacherProfiles — self-heal for the requesting teacher', () => {
  const tenantId = 'tenantA';

  it('auto-creates a TeacherProfile for a teacher whose own profile does not exist yet', async () => {
    const staffId = new Types.ObjectId();
    const ownStaff = {
      _id: staffId, tenantId, firstName: 'New', lastName: 'Teacher',
      employeeId: 'EMP-200', erpRole: 'teacher', department: 'Secondary', campusId: null,
      institutionId: new Types.ObjectId(),
    };
    const teacherProfileModel: any = {
      updateMany: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue(null), // no profile yet
      // Two different findOne() shapes the upsert path uses: a plain
      // await (existing-by-staffId check) and a .select().lean() chain
      // (duplicate-name check) - both resolve to "nothing found" here.
      findOne: jest.fn((filter: any) => {
        if (filter.$expr) return { select: () => ({ lean: () => Promise.resolve(null) }) };
        return Promise.resolve(null);
      }),
      create: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockReturnValue(makeFindChain([{ _id: 'new-profile', firstName: 'New', lastName: 'Teacher' }])),
    };
    const staffModel: any = {
      findOne: jest.fn().mockReturnValue({ lean: () => Promise.resolve(ownStaff) }),
    };

    const service = makeService(staffModel, teacherProfileModel);
    const requestingUser: any = { role: 'teacher', staffId: String(staffId), department: 'Secondary', campusId: String(new Types.ObjectId()) };
    const result = await service.getTeacherProfiles(tenantId, requestingUser);

    expect(teacherProfileModel.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ _id: 'new-profile', firstName: 'New', lastName: 'Teacher' }]);
  });

  it('includes the requester\'s own profile even when its department does not match their department claim', async () => {
    const staffId = new Types.ObjectId();
    const teacherProfileModel: any = {
      updateMany: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue({ _id: 'already-exists' }), // profile already exists - no self-heal create needed
      find: jest.fn((query: any) => {
        // Simulate the inclusive $or: the hard department filter alone would
        // exclude this teacher's own mismatched-department profile, but the
        // staffId branch of the $or guarantees they're still returned.
        expect(query.$or).toBeDefined();
        return makeFindChain([{ _id: 'own-profile', firstName: 'Mismatched', lastName: 'Dept', department: 'Primary' }]);
      }),
    };
    const staffModel: any = { findOne: jest.fn() };

    const service = makeService(staffModel, teacherProfileModel);
    const requestingUser: any = { role: 'teacher', staffId: String(staffId), department: 'Secondary', campusId: String(new Types.ObjectId()) };
    const result = await service.getTeacherProfiles(tenantId, requestingUser);

    expect(staffModel.findOne).not.toHaveBeenCalled(); // profile already existed, no lookup needed
    expect(result).toEqual([{ _id: 'own-profile', firstName: 'Mismatched', lastName: 'Dept', department: 'Primary' }]);
  });

  it('still scopes other teachers to the requester\'s own department (unchanged behaviour)', async () => {
    const staffId = new Types.ObjectId();
    let capturedQuery: any;
    const teacherProfileModel: any = {
      updateMany: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue({ _id: 'exists' }),
      find: jest.fn((query: any) => { capturedQuery = query; return makeFindChain([]); }),
    };
    const staffModel: any = { findOne: jest.fn() };

    const service = makeService(staffModel, teacherProfileModel);
    const requestingUser: any = { role: 'teacher', staffId: String(staffId), department: 'Secondary', campusId: String(new Types.ObjectId()) };
    await service.getTeacherProfiles(tenantId, requestingUser);

    // The normal department-scoped branch of the $or is still present and
    // still carries the department restriction for everyone else.
    const normalBranch = capturedQuery.$or[0];
    expect(normalBranch.department).toBe('Secondary');
  });
});
