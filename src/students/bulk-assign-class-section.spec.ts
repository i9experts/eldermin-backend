import { StudentsService } from './students.service';

// Fast path for the Student Directory's "Assign Class" bulk action - pick a
// set of students (checkboxes), pick a Grade/Section from the Institution
// Setup master, apply to all of them at once. Must validate against the
// real master so this entry point can never reintroduce the free-text
// drift getDistinctGradesSections had to be fixed for.

function makeService(gradeModel: any, studentModel: any) {
  const n: any = {};
  return new StudentsService(
    studentModel, n, n, n, n, n, n, n, gradeModel, n, n, n, n, n, n, n, n, n, n, n, n,
  );
}

describe('StudentsService.bulkAssignClassSection', () => {
  const masterGrade = {
    schoolSlug: 's', name: 'GRADE-1', isActive: true,
    sections: [{ name: 'Grade 1A', isActive: true }, { name: 'Grade 1B', isActive: true }],
  };

  it('assigns the exact master grade/section to the selected students', async () => {
    const gradeModel: any = { findOne: jest.fn(() => ({ lean: jest.fn(async () => masterGrade) })) };
    const studentModel: any = { updateMany: jest.fn(async () => ({ matchedCount: 3, modifiedCount: 3 })) };
    const svc = makeService(gradeModel, studentModel);

    const result = await svc.bulkAssignClassSection('s', ['a', 'b', 'c'], 'GRADE-1', 'Grade 1A');

    expect(studentModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['a', 'b', 'c'] }, schoolSlug: 's' },
      { $set: { currentGrade: 'GRADE-1', currentSection: 'Grade 1A' } },
    );
    expect(result).toEqual({ matched: 3, updated: 3, grade: 'GRADE-1', section: 'Grade 1A' });
  });

  it('rejects a grade that is not in the Institution Setup master', async () => {
    const gradeModel: any = { findOne: jest.fn(() => ({ lean: jest.fn(async () => null) })) };
    const studentModel: any = { updateMany: jest.fn() };
    const svc = makeService(gradeModel, studentModel);

    await expect(svc.bulkAssignClassSection('s', ['a'], 'Not-A-Real-Grade')).rejects.toThrow(
      /is not a class defined/,
    );
    expect(studentModel.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a section that does not belong to the chosen grade', async () => {
    const gradeModel: any = { findOne: jest.fn(() => ({ lean: jest.fn(async () => masterGrade) })) };
    const studentModel: any = { updateMany: jest.fn() };
    const svc = makeService(gradeModel, studentModel);

    await expect(svc.bulkAssignClassSection('s', ['a'], 'GRADE-1', 'Grade 9Z')).rejects.toThrow(
      /is not a section of/,
    );
    expect(studentModel.updateMany).not.toHaveBeenCalled();
  });

  it('allows assigning the grade alone, leaving currentSection untouched', async () => {
    const gradeModel: any = { findOne: jest.fn(() => ({ lean: jest.fn(async () => masterGrade) })) };
    const studentModel: any = { updateMany: jest.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })) };
    const svc = makeService(gradeModel, studentModel);

    await svc.bulkAssignClassSection('s', ['a'], 'GRADE-1');

    expect(studentModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['a'] }, schoolSlug: 's' },
      { $set: { currentGrade: 'GRADE-1' } },
    );
  });
});
