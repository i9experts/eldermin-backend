import { StudentsService } from './students.service';

// Fast path for moving a cohort of students between Early Years and K-12
// (e.g. a PreK/KG class graduating into Grade 1 at the start of a new
// academic year) in one bulk action, optionally reassigning grade/section
// in the same call. Grade/section validation reuses the same Institution
// Setup master check bulkAssignClassSection already enforces.

function makeService(gradeModel: any, studentModel: any) {
  const n: any = {};
  return new StudentsService(
    studentModel, n, n, n, n, n, n, n, gradeModel, n, n, n, n, n, n, n, n, n, n, n, n,
  );
}

describe('StudentsService.bulkSwitchProgram', () => {
  const masterGrade = {
    schoolSlug: 's', name: 'GRADE-1', isActive: true,
    sections: [{ name: 'Grade 1A', isActive: true }],
  };

  it('switches programType alone when no grade is given', async () => {
    const gradeModel: any = { findOne: jest.fn() };
    const studentModel: any = { updateMany: jest.fn(async () => ({ matchedCount: 2, modifiedCount: 2 })) };
    const svc = makeService(gradeModel, studentModel);

    const result = await svc.bulkSwitchProgram('s', ['a', 'b'], 'k12');

    expect(gradeModel.findOne).not.toHaveBeenCalled();
    expect(studentModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['a', 'b'] }, schoolSlug: 's' },
      { $set: { programType: 'k12' } },
    );
    expect(result).toEqual({ matched: 2, updated: 2, programType: 'k12', grade: undefined, section: undefined });
  });

  it('switches programType and reassigns grade/section together, validated against the master', async () => {
    const gradeModel: any = { findOne: jest.fn(() => ({ lean: jest.fn(async () => masterGrade) })) };
    const studentModel: any = { updateMany: jest.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })) };
    const svc = makeService(gradeModel, studentModel);

    await svc.bulkSwitchProgram('s', ['a'], 'k12', 'GRADE-1', 'Grade 1A');

    expect(studentModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['a'] }, schoolSlug: 's' },
      { $set: { programType: 'k12', currentGrade: 'GRADE-1', currentSection: 'Grade 1A' } },
    );
  });

  it('rejects a target grade that is not in the Institution Setup master', async () => {
    const gradeModel: any = { findOne: jest.fn(() => ({ lean: jest.fn(async () => null) })) };
    const studentModel: any = { updateMany: jest.fn() };
    const svc = makeService(gradeModel, studentModel);

    await expect(svc.bulkSwitchProgram('s', ['a'], 'k12', 'Not-A-Real-Grade')).rejects.toThrow(/is not a class defined/);
    expect(studentModel.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an invalid programType value', async () => {
    const gradeModel: any = { findOne: jest.fn() };
    const studentModel: any = { updateMany: jest.fn() };
    const svc = makeService(gradeModel, studentModel);

    await expect(svc.bulkSwitchProgram('s', ['a'], 'montessori')).rejects.toThrow(/must be 'k12' or 'early-years'/);
    expect(studentModel.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an empty studentIds list', async () => {
    const svc = makeService({ findOne: jest.fn() }, { updateMany: jest.fn() });
    await expect(svc.bulkSwitchProgram('s', [], 'k12')).rejects.toThrow(/studentIds is required/);
  });
});
