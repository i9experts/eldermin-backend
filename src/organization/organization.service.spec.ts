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
    create: jest.fn().mockResolvedValue({}),
  };
  const studentModel: any = { updateMany: jest.fn().mockResolvedValue({}) };
  const noop: any = {};

  const service = new OrganizationService(
    noop, noop, noop, gradeModel, noop, noop, noop, studentModel, noop, noop, noop,
    staffModel, teacherProfileModel, noop, noop, noop,
  );
  return { service, gradeModel, staffModel, teacherProfileModel, studentModel };
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
