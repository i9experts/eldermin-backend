import { StudentsService } from './students.service';

// getDistinctGradesSections drives the Student Directory's Class/Section
// filter dropdowns. It must read the Institution Setup Grade/Section master
// (same source as Classes & Sections) rather than raw distinct values off
// Student documents, which pick up every typo/casing variant and
// grade+section mix-up ever saved (e.g. via CSV import) - this previously
// showed 8 "classes"/11 "sections" in the filter for a school with only 4
// real classes / 9 real sections defined in Institution Setup.

function chain(result: any) {
  return { lean: jest.fn(async () => result), sort: jest.fn().mockReturnThis() };
}

function makeService(gradeModel: any, studentModel?: any) {
  const n: any = { findOne: () => ({ lean: () => Promise.resolve(null) }) };
  return new StudentsService(studentModel || n, n, n, n, n, n, n, n, gradeModel, n, n, n, n, n, n, n, n, n, n, n, n, n, n);
}

describe('StudentsService.getDistinctGradesSections', () => {
  it('sources grades/sections from the Grade master, not raw Student fields', async () => {
    const masterGrades = [
      { name: 'PREK-2', isActive: true, sections: [{ name: 'Pre K-2A', isActive: true }, { name: 'Pre K-2B', isActive: true }] },
      { name: 'KINDERGARTEN', isActive: true, sections: [{ name: 'KG A', isActive: true }, { name: 'KG B', isActive: true }, { name: 'KG C', isActive: true }] },
      { name: 'GRADE-1', isActive: true, sections: [{ name: 'Grade 1A', isActive: true }, { name: 'Grade 1B', isActive: true }] },
      { name: 'GRADE-2', isActive: true, sections: [{ name: 'Grade 2A', isActive: true }, { name: 'Grade 2B', isActive: true }] },
    ];
    const gradeModel: any = { find: jest.fn(() => chain(masterGrades)) };
    const studentModel: any = {
      // Even if drifted strings exist on students, they must NOT leak into
      // the filter once a real Grade master exists for the school.
      distinct: jest.fn(async () => ['Grade-1', 'KG-B', 'Prek-2']),
    };
    const svc = makeService(gradeModel, studentModel);

    const result = await svc.getDistinctGradesSections('demo-school');

    expect(result.grades).toEqual(['PREK-2', 'KINDERGARTEN', 'GRADE-1', 'GRADE-2']);
    expect(result.sections.sort()).toEqual(
      ['Grade 1A', 'Grade 1B', 'Grade 2A', 'Grade 2B', 'KG A', 'KG B', 'KG C', 'Pre K-2A', 'Pre K-2B'].sort(),
    );
    expect(studentModel.distinct).not.toHaveBeenCalled();
  });

  it('falls back to raw Student distinct values when no Grade master exists yet', async () => {
    const gradeModel: any = { find: jest.fn(() => chain([])) };
    const studentModel: any = {
      distinct: jest.fn(async (field: string) => (field === 'currentGrade' ? ['Grade 1', 'Grade 2'] : ['A', 'B'])),
    };
    const svc = makeService(gradeModel, studentModel);

    const result = await svc.getDistinctGradesSections('demo-school');

    expect(result.grades).toEqual(['Grade 1', 'Grade 2']);
    expect(result.sections).toEqual(['A', 'B']);
  });
});
