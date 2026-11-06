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
      // Discriminate by filter shape: the tenant-wide "has anyone ever
      // synced" check (no staffId key) says yes, so only the staffId-scoped
      // self-heal check below is the one under test here.
      exists: jest.fn((filter: any) => Promise.resolve(filter.staffId ? null : { _id: 'tenant-has-profiles' })),
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
      exists: jest.fn((filter: any) => Promise.resolve(filter.staffId ? null : { _id: 'tenant-has-profiles' })),
      findOne: jest.fn((filter: any) => {
        if (filter.$expr) return { select: () => ({ lean: () => Promise.resolve(null) }) };
        return Promise.resolve(null);
      }),
      create: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockReturnValue(makeFindChain([{ _id: 'new-profile', firstName: 'No', lastName: 'Claim' }])),
    };
    const staffModel: any = {
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
      // Only the tenant-wide "has anyone ever synced" check should run
      // here - truthy, so the lazy full-sync path stays out of this test's
      // way. No staffId-scoped call should happen since none could be
      // resolved for this requester.
      exists: jest.fn().mockResolvedValue({ _id: 'tenant-has-profiles' }),
      find: jest.fn().mockReturnValue(makeFindChain([])),
    };
    const staffModel: any = { findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) }) };

    const service = makeService(staffModel, teacherProfileModel);
    const requestingUser: any = { role: 'teacher', userId: String(new Types.ObjectId()), department: 'Secondary', campusId: String(new Types.ObjectId()) };
    await service.getTeacherProfiles(tenantId, requestingUser);

    const staffScopedCalls = teacherProfileModel.exists.mock.calls.filter((c: any) => c[0]?.staffId);
    expect(staffScopedCalls.length).toBe(0);
  });

  it('lazily runs the equivalent of "Sync from HR" when this tenant has never had a single TeacherProfile, so a brand-new school\'s dropdowns are never permanently empty', async () => {
    const teacherProfileModel: any = {
      updateMany: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue(null), // literally zero profiles tenant-wide
      find: jest.fn().mockReturnValue(makeFindChain([{ _id: 'synced-profile', firstName: 'Synced', lastName: 'Teacher' }])),
    };
    const staffModel: any = { findOne: jest.fn().mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) }) };

    const service = makeService(staffModel, teacherProfileModel);
    const syncSpy = jest.spyOn(service, 'syncTeacherProfilesFromHR').mockResolvedValue({ scanned: 1, created: 1, updated: 0, skippedPossibleDuplicates: [] } as any);

    const requestingUser: any = { role: 'admin', userId: String(new Types.ObjectId()), campusId: String(new Types.ObjectId()) };
    const result = await service.getTeacherProfiles(tenantId, requestingUser);

    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith(tenantId, undefined);
    expect(result).toEqual([{ _id: 'synced-profile', firstName: 'Synced', lastName: 'Teacher' }]);
  });
});
