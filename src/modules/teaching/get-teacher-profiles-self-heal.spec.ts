import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';

// Teachers added since the last manual "Sync from HR" click (or if it was
// never clicked, or only ever clicked back when the staff roster was much
// smaller) had no TeacherProfile row, so they couldn't appear in - or
// select themselves from - any of the "pick a teacher" dropdowns across the
// Teaching module (Class Diary, Homework, Syllabus, Timetable, PTM, etc.),
// all of which share this one getTeacherProfiles() call. A teacher's own
// department-scoped visibility could also silently exclude their own
// profile if its denormalized `department` didn't exactly match their JWT's
// department claim. All three are fixed here: every teaching Staff record
// missing a TeacherProfile is lazily upserted on every read (not just when
// the tenant has literally zero profiles - a school can easily have a
// handful of profiles already and still be missing most of its real
// teachers), the requester's own TeacherProfile is lazily upserted if
// missing, and the final query always includes it regardless of department
// scope.

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

// Self-heal #0 reads staffModel.find(filter, {_id:1, erpRole:1}) to find
// teacher-eligible staff and teacherProfileModel.find(filter, {staffId:1})
// to see which already have a profile - both plain projection queries,
// discriminated from every other find() call in the method by that second
// projection argument.
function makeStaffFindMock(allStaffProjected: any[], fullDocsByIdForMissingFetch: any[]) {
  return jest.fn((_query: any, projection?: any) => {
    if (projection && projection.erpRole) return { lean: () => Promise.resolve(allStaffProjected) };
    return { lean: () => Promise.resolve(fullDocsByIdForMissingFetch) };
  });
}

function makeProfileFindMock(existingProfileStaffIds: any[], finalListing: any) {
  return jest.fn((query: any, projection?: any) => {
    if (projection && projection.staffId) {
      return { lean: () => Promise.resolve(existingProfileStaffIds.map((staffId) => ({ staffId }))) };
    }
    return makeFindChain(finalListing);
  });
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
      exists: jest.fn().mockResolvedValue(null), // self-heal #2's own-profile check: not found yet
      // Two different findOne() shapes the upsert path uses: a plain
      // await (existing-by-staffId check) and a .select().lean() chain
      // (duplicate-name check) - both resolve to "nothing found" here.
      findOne: jest.fn((filter: any) => {
        if (filter.$expr) return { select: () => ({ lean: () => Promise.resolve(null) }) };
        return Promise.resolve(null);
      }),
      create: jest.fn().mockResolvedValue({}),
      // No teaching staff tenant-wide (other than the requester, handled
      // below by self-heal #2), so self-heal #0 is a no-op here - this test
      // is only about the per-requester self-heal.
      find: makeProfileFindMock([], [{ _id: 'new-profile', firstName: 'New', lastName: 'Teacher' }]),
    };
    const staffModel: any = {
      find: makeStaffFindMock([], []),
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
      find: jest.fn((query: any, projection?: any) => {
        if (projection && projection.staffId) return { lean: () => Promise.resolve([]) };
        // Simulate the inclusive $or: the hard department filter alone would
        // exclude this teacher's own mismatched-department profile, but the
        // staffId branch of the $or guarantees they're still returned.
        expect(query.$or).toBeDefined();
        return makeFindChain([{ _id: 'own-profile', firstName: 'Mismatched', lastName: 'Dept', department: 'Primary' }]);
      }),
    };
    const staffModel: any = { find: makeStaffFindMock([], []), findOne: jest.fn() };

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
      find: jest.fn((query: any, projection?: any) => {
        if (projection && projection.staffId) return { lean: () => Promise.resolve([]) };
        capturedQuery = query;
        return makeFindChain([]);
      }),
    };
    const staffModel: any = { find: makeStaffFindMock([], []), findOne: jest.fn() };

    const service = makeService(staffModel, teacherProfileModel);
    const requestingUser: any = { role: 'teacher', staffId: String(staffId), department: 'Secondary', campusId: String(new Types.ObjectId()) };
    await service.getTeacherProfiles(tenantId, requestingUser);

    // The normal department-scoped branch of the $or is still present and
    // still carries the department restriction for everyone else.
    const normalBranch = capturedQuery.$or[0];
    expect(normalBranch.department).toBe('Secondary');
  });

  it('resolves staffId from the DB (by login userId) when the JWT carries no staffId claim, and still self-heals', async () => {
    // Covers a Staff<->login link created (or repaired) after the current
    // token was issued, or any other reason the claim itself is missing -
    // the requester must not be stuck with an empty dropdown just because
    // their token predates/lacks the claim, even after re-logging in.
    const userId = new Types.ObjectId();
    const staffId = new Types.ObjectId();
    const ownStaff = {
      _id: staffId, tenantId, firstName: 'No', lastName: 'Claim',
      employeeId: 'EMP-300', erpRole: 'teacher', department: 'Secondary', campusId: null,
      institutionId: new Types.ObjectId(), userId,
    };
    const teacherProfileModel: any = {
      updateMany: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue(null),
      findOne: jest.fn((filter: any) => {
        if (filter.$expr) return { select: () => ({ lean: () => Promise.resolve(null) }) };
        return Promise.resolve(null);
      }),
      create: jest.fn().mockResolvedValue({}),
      find: makeProfileFindMock([], [{ _id: 'new-profile', firstName: 'No', lastName: 'Claim' }]),
    };
    const staffModel: any = {
      find: makeStaffFindMock([], []),
      findOne: jest.fn((filter: any) => {
        // The by-login lookup (select().lean() chain) vs the by-_id lookup
        // the upsert path uses afterwards (plain .lean()) - both resolve to
        // this same Staff record here.
        if ('userId' in filter) return { select: () => ({ lean: () => Promise.resolve(ownStaff) }) };
        return { lean: () => Promise.resolve(ownStaff) };
      }),
    };

    const service = makeService(staffModel, teacherProfileModel);
    const requestingUser: any = { role: 'teacher', userId: String(userId), department: 'Secondary', campusId: String(new Types.ObjectId()) };
    const result = await service.getTeacherProfiles(tenantId, requestingUser);

    expect(teacherProfileModel.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ _id: 'new-profile', firstName: 'No', lastName: 'Claim' }]);
  });

  it('leaves the normal department-only filter in place when no staffId can be resolved at all', async () => {
    const teacherProfileModel: any = {
      updateMany: jest.fn().mockResolvedValue({}),
      exists: jest.fn(),
      find: makeProfileFindMock([], []),
    };
    const staffModel: any = {
      find: makeStaffFindMock([], []),
      findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) }),
    };

    const service = makeService(staffModel, teacherProfileModel);
    const requestingUser: any = { role: 'teacher', userId: String(new Types.ObjectId()), department: 'Secondary', campusId: String(new Types.ObjectId()) };
    await service.getTeacherProfiles(tenantId, requestingUser);

    // No staffId could be resolved for this requester, so the per-requester
    // self-heal's exists() check (the only place exists() is used) never runs.
    expect(teacherProfileModel.exists).not.toHaveBeenCalled();
  });

  it('lazily syncs every teaching Staff record that has no TeacherProfile yet, so a brand-new school\'s dropdowns are never permanently empty', async () => {
    const teacherStaffId = new Types.ObjectId();
    const teacherStaffDoc = {
      _id: teacherStaffId, tenantId, firstName: 'Synced', lastName: 'Teacher',
      employeeId: 'EMP-500', erpRole: 'teacher', department: 'Secondary', campusId: null,
      institutionId: new Types.ObjectId(),
    };
    const teacherProfileModel: any = {
      updateMany: jest.fn().mockResolvedValue({}),
      findOne: jest.fn((filter: any) => {
        if (filter.$expr) return { select: () => ({ lean: () => Promise.resolve(null) }) };
        return Promise.resolve(null);
      }),
      create: jest.fn().mockResolvedValue({}),
      // Zero profiles on file tenant-wide.
      find: makeProfileFindMock([], [{ _id: 'synced-profile', firstName: 'Synced', lastName: 'Teacher' }]),
    };
    const staffModel: any = {
      find: makeStaffFindMock([{ _id: teacherStaffId, erpRole: 'teacher' }], [teacherStaffDoc]),
      findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) }),
    };

    const service = makeService(staffModel, teacherProfileModel);
    const requestingUser: any = { role: 'admin', userId: String(new Types.ObjectId()), campusId: String(new Types.ObjectId()) };
    const result = await service.getTeacherProfiles(tenantId, requestingUser);

    expect(teacherProfileModel.create).toHaveBeenCalledTimes(1);
    expect(teacherProfileModel.create.mock.calls[0][0]).toEqual(expect.objectContaining({ staffId: teacherStaffId }));
    expect(result).toEqual([{ _id: 'synced-profile', firstName: 'Synced', lastName: 'Teacher' }]);
  });

  it('still syncs a teaching Staff member with no TeacherProfile even when OTHER profiles already exist for this tenant (not just when the count is literally zero)', async () => {
    // Regression test: an earlier version of this self-heal only looked at
    // "does this tenant have ANY TeacherProfile at all" - which a school
    // reaches the moment a single admin's own self-heal (#2 below) fires,
    // long before most of its real teaching staff are synced. That single
    // profile existing silently permanently hid everyone else.
    const alreadySyncedStaffId = new Types.ObjectId();
    const missingStaffId = new Types.ObjectId();
    const missingStaffDoc = {
      _id: missingStaffId, tenantId, firstName: 'Still', lastName: 'Missing',
      employeeId: 'EMP-600', erpRole: 'teacher', department: 'Secondary', campusId: null,
      institutionId: new Types.ObjectId(),
    };
    const teacherProfileModel: any = {
      updateMany: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue({ _id: 'requester-already-has-one' }), // self-heal #2 no-ops
      findOne: jest.fn((filter: any) => {
        if (filter.$expr) return { select: () => ({ lean: () => Promise.resolve(null) }) };
        return Promise.resolve(null);
      }),
      create: jest.fn().mockResolvedValue({}),
      // One profile already exists tenant-wide (for alreadySyncedStaffId) -
      // the old "any profile at all" gate would have stopped here.
      find: makeProfileFindMock([alreadySyncedStaffId], [{ _id: 'listing' }]),
    };
    const staffModel: any = {
      find: makeStaffFindMock(
        [{ _id: alreadySyncedStaffId, erpRole: 'teacher' }, { _id: missingStaffId, erpRole: 'teacher' }],
        [missingStaffDoc],
      ),
      findOne: jest.fn(),
    };

    const service = makeService(staffModel, teacherProfileModel);
    const requestingUser: any = { role: 'admin', staffId: String(new Types.ObjectId()), department: 'Secondary', campusId: String(new Types.ObjectId()) };
    await service.getTeacherProfiles(tenantId, requestingUser);

    expect(teacherProfileModel.create).toHaveBeenCalledTimes(1);
    expect(teacherProfileModel.create.mock.calls[0][0]).toEqual(expect.objectContaining({ staffId: missingStaffId }));
  });
});
