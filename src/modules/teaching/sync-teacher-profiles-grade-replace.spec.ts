import { Types } from 'mongoose';
import { TeachingService } from './teaching.service';

// Pins the fix for "Grade 1, Grade 2, GRADE-2, Grade-1 +1"-style garbage
// accumulating in the Teacher Directory's Grade Levels/Subjects columns.
// syncTeacherProfilesFromHR used to MERGE HR's subjects/grades into
// whatever the TeacherProfile already had ([...existing, ...fromHR]), so
// every click of "Sync from HR" permanently appended on top rather than
// replacing - a grade reassignment or a casing correction made on the HR
// side left both the old and new values forever, compounding with every
// sync. It must now replace the profile's value with HR's current one
// whenever HR has a real (non-empty) list, while still leaving an
// existing profile value untouched when HR's own copy is blank.

function makeService(staffModel: any, teacherProfileModel: any) {
  const noop: any = {};
  return new TeachingService(
    teacherProfileModel, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    noop, staffModel, noop, noop, noop, noop, noop,
  );
}

describe('TeachingService.syncTeacherProfilesFromHR — replace, not merge', () => {
  const tenantId = 'tenantA';

  it("replaces the profile's gradeLevelsCanTeach/subjectsCanTeach with HR's current list instead of appending to the old one", async () => {
    const staff = {
      _id: new Types.ObjectId(), tenantId, firstName: 'Samrah', lastName: 'Siddiqui', employeeId: 'EMP-050', erpRole: 'teacher',
      teacherProfile: { gradeLevelsCanTeach: ['GRADE-1'], subjectsCanTeach: ['Math'] },
    };
    const staffModel: any = { find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([staff]) }) };
    const existingProfile = { _id: 'profile-1', gradeLevelsCanTeach: ['Grade 1', 'Grade 2'], subjectsCanTeach: ['Science'] };
    const updateOne = jest.fn();
    const teacherProfileModel: any = {
      findOne: jest.fn().mockResolvedValue(existingProfile),
      updateOne,
    };

    const service = makeService(staffModel, teacherProfileModel);
    await service.syncTeacherProfilesFromHR(tenantId, String(new Types.ObjectId()));

    expect(updateOne).toHaveBeenCalledTimes(1);
    const fields = updateOne.mock.calls[0][1].$set;
    expect(fields.gradeLevelsCanTeach).toEqual(['GRADE-1']);
    expect(fields.subjectsCanTeach).toEqual(['Math']);
  });

  it("leaves the profile's existing lists untouched when HR's own copy is blank", async () => {
    const staff = {
      _id: new Types.ObjectId(), tenantId, firstName: 'Bilal', lastName: 'Raza', employeeId: 'EMP-051', erpRole: 'teacher',
      teacherProfile: {},
    };
    const staffModel: any = { find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([staff]) }) };
    const existingProfile = { _id: 'profile-2', gradeLevelsCanTeach: ['Grade 3'], subjectsCanTeach: ['English'] };
    const updateOne = jest.fn();
    const teacherProfileModel: any = {
      findOne: jest.fn().mockResolvedValue(existingProfile),
      updateOne,
    };

    const service = makeService(staffModel, teacherProfileModel);
    await service.syncTeacherProfilesFromHR(tenantId, String(new Types.ObjectId()));

    const fields = updateOne.mock.calls[0][1].$set;
    expect(fields.gradeLevelsCanTeach).toBeUndefined();
    expect(fields.subjectsCanTeach).toBeUndefined();
  });

  it("dedupes an exact-duplicate value within HR's own list", async () => {
    const staff = {
      _id: new Types.ObjectId(), tenantId, firstName: 'Sana', lastName: 'Iqbal', employeeId: 'EMP-052', erpRole: 'teacher',
      teacherProfile: { gradeLevelsCanTeach: ['Grade 1', 'Grade 1', 'Grade 2'] },
    };
    const staffModel: any = { find: jest.fn().mockReturnValue({ lean: () => Promise.resolve([staff]) }) };
    const updateOne = jest.fn();
    const teacherProfileModel: any = {
      findOne: jest.fn().mockResolvedValue({ _id: 'profile-3', gradeLevelsCanTeach: [] }),
      updateOne,
    };

    const service = makeService(staffModel, teacherProfileModel);
    await service.syncTeacherProfilesFromHR(tenantId, String(new Types.ObjectId()));

    const fields = updateOne.mock.calls[0][1].$set;
    expect(fields.gradeLevelsCanTeach).toEqual(['Grade 1', 'Grade 2']);
  });
});
