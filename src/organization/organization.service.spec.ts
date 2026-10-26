import { Types } from 'mongoose';
import { OrganizationService } from './organization.service';

// Hand-rolled model fakes (same lightweight approach as the other
// service-level specs in this repo: staff-portal.service.spec.ts etc).
//
// These tests pin the fix for the "Early Years teacher assigned to two
// sections only ever shows one" bug: assignClassTeacher used to blindly
// overwrite TeacherProfile's singular classTeacherOf* fields on every
// assignment, silently erasing any other section the same teacher was
// already class teacher of. It now fully recomputes
// classTeacherAssignments from Section.classTeacherId (the real source of
// truth) across the whole school on every change - which also makes it
// self-healing for a profile left in the old broken single-assignment
// state, without any manual data migration.

const oid = () => new Types.ObjectId();
const lean = (v: any) => ({ lean: () => Promise.resolve(v) });

function section(id: Types.ObjectId, name: string, classTeacherId?: Types.ObjectId) {
  return { _id: id, name, classTeacherId };
}

function grade(id: Types.ObjectId, name: string, sections: any[]) {
  return { _id: id, name, schoolSlug: 'demo', sections };
}

function setup(opts: {
  gradeDoc: any; // what gradeModel.findOne resolves to (the grade/section being assigned)
  allGrades: any[]; // what gradeModel.find({schoolSlug}).lean() resolves to - the source of truth AFTER the Step 1 write
  staffByUserId: Record<string, any>;
  profilesByStaffId?: Record<string, any>;
  groupInstitutionDoc?: any; // what groupInstitutionModel.findOne({schoolSlug}).lean() resolves to
  createShouldThrow?: any; // force teacherProfileModel.create() to reject, to test error handling
}) {
  const gradeModel: any = {
    findOne: jest.fn().mockResolvedValue(opts.gradeDoc),
    find: jest.fn().mockReturnValue(lean(opts.allGrades)),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const staffModel: any = {
    findOne: jest.fn((q: any) => lean(opts.staffByUserId[String(q.userId)] ?? null)),
  };
  const profilesByStaffId = opts.profilesByStaffId ?? {};
  const teacherProfileModel: any = {
    findOne: jest.fn((q: any) => Promise.resolve(profilesByStaffId[String(q.staffId)] ?? null)),
    updateOne: jest.fn().mockResolvedValue({}),
    create: opts.createShouldThrow
      ? jest.fn().mockRejectedValue(opts.createShouldThrow)
      : jest.fn().mockResolvedValue({}),
  };
  const studentModel: any = { updateMany: jest.fn().mockResolvedValue({}) };
  const groupInstitutionModel: any = {
    findOne: jest.fn().mockReturnValue({ select: () => lean(opts.groupInstitutionDoc ?? null) }),
  };
  const noop: any = {};

  const service = new OrganizationService(
    noop, noop, noop, gradeModel, noop, noop, groupInstitutionModel, studentModel, noop, noop, noop,
    staffModel, teacherProfileModel, noop, noop, noop,
  );
  return { service, gradeModel, staffModel, teacherProfileModel, studentModel, groupInstitutionModel };
}

describe('OrganizationService — class-teacher multi-section assignment', () => {
  it('assigning a teacher as class teacher of a SECOND section adds to classTeacherAssignments instead of overwriting the first', async () => {
    const schoolSlug = 'demo';
    const g1 = oid(); const s1 = oid();
    const g2 = oid(); const s2 = oid();
    const teacherUserId = oid();
    const staffId = oid();

    const { service, teacherProfileModel } = setup({
      gradeDoc: grade(g1, 'Grade 1', [section(s1, 'Section 1')]),
      // Source of truth after Step 1's write: this teacher is already class
      // teacher of Section 2 elsewhere, and now also of Section 1.
      allGrades: [
        grade(g1, 'Grade 1', [section(s1, 'Section 1', teacherUserId)]),
        grade(g2, 'Grade 2', [section(s2, 'Section 2', teacherUserId)]),
      ],
      staffByUserId: { [String(teacherUserId)]: { _id: staffId, firstName: 'Jane', lastName: 'Doe', tenantId: oid(), institutionId: oid() } },
      profilesByStaffId: { [String(staffId)]: { _id: oid() } },
    });

    await service.assignClassTeacher(String(g1), String(s1), String(teacherUserId), schoolSlug);

    expect(teacherProfileModel.updateOne).toHaveBeenCalledTimes(1);
    const [, update] = teacherProfileModel.updateOne.mock.calls[0];
    expect(update.$set.isClassTeacher).toBe(true);
    expect(update.$set.classTeacherAssignments).toHaveLength(2);
    const sectionNames = update.$set.classTeacherAssignments.map((a: any) => a.sectionName).sort();
    expect(sectionNames).toEqual(['Section 1', 'Section 2']);
  });

  it('reassigning a section away from a teacher removes only that section, keeping their other section(s)', async () => {
    const schoolSlug = 'demo';
    const g1 = oid(); const s1 = oid();
    const g3 = oid(); const s3 = oid();
    const previousTeacherUserId = oid();
    const newTeacherUserId = oid();
    const previousStaffId = oid();
    const newStaffId = oid();

    const { service, teacherProfileModel } = setup({
      // Section 1 currently belongs to the previous teacher.
      gradeDoc: grade(g1, 'Grade 1', [section(s1, 'Section 1', previousTeacherUserId)]),
      // Source of truth after Step 1's write: Section 1 now points to the
      // new teacher; the previous teacher keeps Section 3 elsewhere.
      allGrades: [
        grade(g1, 'Grade 1', [section(s1, 'Section 1', newTeacherUserId)]),
        grade(g3, 'Grade 3', [section(s3, 'Section 3', previousTeacherUserId)]),
      ],
      staffByUserId: {
        [String(previousTeacherUserId)]: { _id: previousStaffId, firstName: 'Old', lastName: 'Teacher', tenantId: oid(), institutionId: oid() },
        [String(newTeacherUserId)]: { _id: newStaffId, firstName: 'New', lastName: 'Teacher', tenantId: oid(), institutionId: oid() },
      },
      profilesByStaffId: {
        [String(previousStaffId)]: { _id: oid() },
        [String(newStaffId)]: { _id: oid() },
      },
    });

    await service.assignClassTeacher(String(g1), String(s1), String(newTeacherUserId), schoolSlug);

    expect(teacherProfileModel.updateOne).toHaveBeenCalledTimes(2);

    // Find each update by matching the profile _id returned for that staffId.
    const prevProfileId = (await (teacherProfileModel.findOne({ staffId: previousStaffId }) as any));
    const calls = teacherProfileModel.updateOne.mock.calls;
    const prevCall = calls.find((c: any) => c[0]._id === prevProfileId._id);
    const newCall = calls.find((c: any) => c[0]._id !== prevProfileId._id);

    expect(prevCall[1].$set.classTeacherAssignments).toHaveLength(1);
    expect(prevCall[1].$set.classTeacherAssignments[0].sectionName).toBe('Section 3');

    expect(newCall[1].$set.classTeacherAssignments).toHaveLength(1);
    expect(newCall[1].$set.classTeacherAssignments[0].sectionName).toBe('Section 1');
  });

  it('the repair mechanism (recomputeAllClassTeacherAssignments) correctly reconstructs assignments for a teacher left in the old broken state', async () => {
    const schoolSlug = 'demo';
    const g1 = oid(); const s1 = oid();
    const g2 = oid(); const s2 = oid();
    const teacherUserId = oid();
    const staffId = oid();

    const { service, teacherProfileModel } = setup({
      gradeDoc: null, // not used by this method
      // This teacher is class teacher of TWO sections in Section data, but
      // their TeacherProfile (below) was corrupted by the old bug and only
      // ever remembers one of them.
      allGrades: [
        grade(g1, 'Grade 1', [section(s1, 'Section 1', teacherUserId)]),
        grade(g2, 'Grade 2', [section(s2, 'Section 2', teacherUserId)]),
      ],
      staffByUserId: { [String(teacherUserId)]: { _id: staffId, firstName: 'Jane', lastName: 'Doe', tenantId: oid(), institutionId: oid() } },
      profilesByStaffId: {
        [String(staffId)]: {
          _id: oid(),
          isClassTeacher: true,
          classTeacherOfGradeName: 'Grade 1',
          classTeacherOfSectionName: 'Section 1',
          classTeacherAssignments: [], // old broken state: array never populated
        },
      },
    });

    const result = await service.recomputeAllClassTeacherAssignments(schoolSlug);

    expect(result.teachersProcessed).toBe(1);
    expect(result.results[0].sections).toBe(2);
    expect(teacherProfileModel.updateOne).toHaveBeenCalledTimes(1);
    const [, update] = teacherProfileModel.updateOne.mock.calls[0];
    expect(update.$set.classTeacherAssignments).toHaveLength(2);
    const sectionNames = update.$set.classTeacherAssignments.map((a: any) => a.sectionName).sort();
    expect(sectionNames).toEqual(['Section 1', 'Section 2']);
  });
});

describe('OrganizationService — assignClassTeacher: first-time TeacherProfile creation', () => {
  // Pins the fix for "Internal server error" when assigning a brand-new
  // class teacher: TeacherProfile.institutionId is required, but
  // Staff.institutionId is only optional (not every school's Staff records
  // have one set) - creating a first-ever TeacherProfile for such a staff
  // member used to throw an uncaught Mongoose ValidationError here.
  it('falls back to the school GroupInstitution when Staff has no institutionId', async () => {
    const schoolSlug = 'demo';
    const g1 = oid(); const s1 = oid();
    const teacherUserId = oid();
    const staffId = oid();
    const institutionId = oid();

    const { service, teacherProfileModel } = setup({
      gradeDoc: grade(g1, 'PreK-2', [section(s1, 'Section A')]),
      allGrades: [grade(g1, 'PreK-2', [section(s1, 'Section A', teacherUserId)])],
      staffByUserId: { [String(teacherUserId)]: { _id: staffId, firstName: 'Ayesha', lastName: 'Khan', tenantId: oid() } }, // no institutionId
      profilesByStaffId: {}, // no existing TeacherProfile - must be created
      groupInstitutionDoc: { _id: institutionId },
    });

    await service.assignClassTeacher(String(g1), String(s1), String(teacherUserId), schoolSlug);

    expect(teacherProfileModel.create).toHaveBeenCalledTimes(1);
    const [created] = teacherProfileModel.create.mock.calls[0];
    expect(String(created.institutionId)).toBe(String(institutionId));
  });

  it('skips TeacherProfile creation (without throwing) when no institutionId is resolvable anywhere', async () => {
    const schoolSlug = 'demo';
    const g1 = oid(); const s1 = oid();
    const teacherUserId = oid();
    const staffId = oid();

    const { service, teacherProfileModel, studentModel } = setup({
      gradeDoc: grade(g1, 'PreK-2', [section(s1, 'Section A')]),
      allGrades: [grade(g1, 'PreK-2', [section(s1, 'Section A', teacherUserId)])],
      staffByUserId: { [String(teacherUserId)]: { _id: staffId, firstName: 'Ayesha', lastName: 'Khan', tenantId: oid() } },
      profilesByStaffId: {},
      groupInstitutionDoc: null, // school has no GroupInstitution set up either
    });

    await expect(
      service.assignClassTeacher(String(g1), String(s1), String(teacherUserId), schoolSlug),
    ).resolves.toBeDefined();

    expect(teacherProfileModel.create).not.toHaveBeenCalled();
    // The primary action - assigning the section's teacher and denormalizing
    // onto students - still goes through even though the profile couldn't be built.
    expect(studentModel.updateMany).toHaveBeenCalledTimes(1);
  });

  it('surfaces a clear 400 instead of a bare 500 if TeacherProfile creation still fails validation', async () => {
    const schoolSlug = 'demo';
    const g1 = oid(); const s1 = oid();
    const teacherUserId = oid();
    const staffId = oid();

    const validationError: any = new Error('TeacherProfile validation failed');
    validationError.name = 'ValidationError';
    validationError.errors = { firstName: {} };

    const { service } = setup({
      gradeDoc: grade(g1, 'PreK-2', [section(s1, 'Section A')]),
      allGrades: [grade(g1, 'PreK-2', [section(s1, 'Section A', teacherUserId)])],
      staffByUserId: { [String(teacherUserId)]: { _id: staffId, tenantId: oid() } },
      profilesByStaffId: {},
      groupInstitutionDoc: { _id: oid() },
      createShouldThrow: validationError,
    });

    await expect(
      service.assignClassTeacher(String(g1), String(s1), String(teacherUserId), schoolSlug),
    ).rejects.toThrow(/Could not create this teacher's profile/);
  });
});
