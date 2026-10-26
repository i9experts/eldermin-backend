import { Types } from 'mongoose';
import { FamiliesService } from './families.service';

// Pins the fix for "Approve Selected" failing with a bare "Internal server
// error" toast on the Families tab's Auto-Detect Families feature.
// commitRetrofit used to run every approved group in one uncaught loop -
// any single group's failure (stale studentId, rare familyCode race) threw
// and aborted the whole batch with no indication which group or why. Each
// group is now processed independently and reported in `failures`.

function id() { return new Types.ObjectId().toString(); }

function makeService(opts: {
  existingFamilyCodes?: string[];
  racyCode?: string; // a code that's ALREADY taken, but whose first findOne check lies and says it's free (simulates the TOCTOU race: the read missed it, the unique index on save() doesn't)
  studentsById?: Record<string, { familyId?: any } | undefined>;
}) {
  const existingCodes = new Set(opts.existingFamilyCodes || []);
  if (opts.racyCode) existingCodes.add(opts.racyCode);
  let racyCodeFindOneCalls = 0;

  const familyModel: any = function (this: any, data: any) {
    Object.assign(this, data);
    this._id = id();
    this.save = jest.fn(async () => {
      if (existingCodes.has(this.familyCode)) {
        const err: any = new Error('duplicate key');
        err.code = 11000;
        throw err;
      }
      existingCodes.add(this.familyCode);
      return this;
    });
  };
  // countDocuments deliberately does NOT count the racy code either, so
  // the next generateFamilyCode attempt (after the retry) computes the
  // exact same next number again - same real-world shape as a count that
  // hasn't caught up to a concurrent insert yet.
  familyModel.countDocuments = jest.fn(async () => existingCodes.size - (opts.racyCode ? 1 : 0));
  familyModel.findOne = jest.fn(async ({ familyCode }: any) => {
    if (familyCode === opts.racyCode) {
      racyCodeFindOneCalls++;
      return racyCodeFindOneCalls === 1 ? null : { familyCode };
    }
    return existingCodes.has(familyCode) ? { familyCode } : null;
  });

  const studentsById = opts.studentsById || {};
  const studentModel: any = {
    find: jest.fn(({ _id }: any) => ({
      select: () => ({
        lean: async () => {
          const ids: string[] = _id.$in;
          return ids
            .filter((sid) => studentsById[sid] !== undefined)
            .map((sid) => ({ _id: sid, familyId: studentsById[sid]?.familyId }));
        },
      }),
    })),
    updateMany: jest.fn(async () => ({ modifiedCount: 1 })),
  };

  const service = new FamiliesService(familyModel, studentModel);
  return { service, familyModel, studentModel };
}

describe('FamiliesService.commitRetrofit', () => {
  it('commits every valid group and reports no failures', async () => {
    const s1 = id(); const s2 = id();
    const { service, studentModel } = makeService({
      studentsById: { [s1]: {}, [s2]: {} },
    });

    const result = await service.commitRetrofit('school', [
      { studentIds: [s1, s2], guardianName: 'Jane Doe', phone: '0300', source: 'retrofit-phone' },
    ]);

    expect(result.groupsCreated).toBe(1);
    expect(result.studentsLinked).toBe(2);
    expect(result.failures).toEqual([]);
    expect(studentModel.updateMany).toHaveBeenCalledTimes(1);
  });

  it('continues processing remaining groups when one group fails, reporting the failure', async () => {
    const s1 = id(); const s2 = id(); const s3 = id(); const s4 = id();
    const { service } = makeService({
      // s2 doesn't exist in the DB anymore (stale preview)
      studentsById: { [s1]: {}, [s3]: {}, [s4]: {} },
    });

    const result = await service.commitRetrofit('school', [
      { studentIds: [s1, s2], guardianName: 'Stale Group', source: 'retrofit-phone' },
      { studentIds: [s3, s4], guardianName: 'Good Group', source: 'retrofit-phone' },
    ]);

    expect(result.groupsCreated).toBe(1);
    expect(result.studentsLinked).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ guardianName: 'Stale Group', reason: expect.stringContaining('no longer exist') });
  });

  it('rejects a group where a student is already linked to a family', async () => {
    const s1 = id(); const s2 = id();
    const { service } = makeService({
      studentsById: { [s1]: { familyId: id() }, [s2]: {} },
    });

    const result = await service.commitRetrofit('school', [
      { studentIds: [s1, s2], guardianName: 'Already Linked', source: 'retrofit-phone' },
    ]);

    expect(result.groupsCreated).toBe(0);
    expect(result.failures[0].reason).toMatch(/already belong to a family/);
  });

  it('rejects a group with an invalid student id', async () => {
    const s1 = id();
    const { service } = makeService({ studentsById: { [s1]: {} } });

    const result = await service.commitRetrofit('school', [
      { studentIds: [s1, 'not-a-valid-id'], guardianName: 'Bad Id', source: 'retrofit-phone' },
    ]);

    expect(result.groupsCreated).toBe(0);
    expect(result.failures[0].reason).toMatch(/invalid student reference/);
  });

  it('rejects a group with fewer than 2 students', async () => {
    const s1 = id();
    const { service } = makeService({ studentsById: { [s1]: {} } });

    const result = await service.commitRetrofit('school', [
      { studentIds: [s1], guardianName: 'Solo', source: 'retrofit-phone' },
    ]);

    expect(result.groupsCreated).toBe(0);
    expect(result.failures[0].reason).toMatch(/at least 2 students/);
  });

  it('retries family creation on a familyCode race (E11000) instead of failing the group', async () => {
    const s1 = id(); const s2 = id();
    // FAM-0001 is already taken, but generateFamilyCode's own existence
    // check misses it on the first ask (the TOCTOU race) - save() hitting
    // the real unique index catches it instead, and the retry should
    // recover with the next free code.
    const { service } = makeService({
      racyCode: 'FAM-0001',
      studentsById: { [s1]: {}, [s2]: {} },
    });

    const result = await service.commitRetrofit('school', [
      { studentIds: [s1, s2], guardianName: 'Race Group', source: 'retrofit-phone' },
    ]);

    expect(result.groupsCreated).toBe(1);
    expect(result.failures).toEqual([]);
  });
});
