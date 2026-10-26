import { computeClassSectionRepair } from './class-section-repair.util';

describe('computeClassSectionRepair', () => {
  const grades = [
    { name: 'Pre K-2', sections: [{ name: 'Pre K-2A' }, { name: 'Pre K-2B' }] },
    { name: 'Grade-1', sections: [{ name: 'Grade 1A' }, { name: 'Grade 1B' }] },
  ];

  it('rewrites a casing/hyphen variant grade to the canonical master name', () => {
    const students = [{ id: 's1', name: 'Ayesha', currentGrade: 'PREK 2', currentSection: 'Pre K-2A' }];
    const { fixes, unresolved } = computeClassSectionRepair(grades, students);
    expect(unresolved).toHaveLength(0);
    expect(fixes).toEqual([{ studentId: 's1', studentName: 'Ayesha', oldGrade: 'PREK 2', oldSection: 'Pre K-2A', newGrade: 'Pre K-2', newSection: undefined }]);
  });

  it('resolves a section-only drift when the grade is already correct', () => {
    const students = [{ id: 's2', name: 'Bilal', currentGrade: 'Pre K-2', currentSection: 'pre k 2 a' }];
    const { fixes } = computeClassSectionRepair(grades, students);
    expect(fixes).toEqual([{ studentId: 's2', studentName: 'Bilal', oldGrade: 'Pre K-2', oldSection: 'pre k 2 a', newGrade: undefined, newSection: 'Pre K-2A' }]);
  });

  it('resolves a full class label mistakenly typed into the grade field', () => {
    const students = [{ id: 's3', name: 'Sana', currentGrade: 'Grade 1A', currentSection: '' }];
    const { fixes } = computeClassSectionRepair(grades, students);
    expect(fixes).toEqual([{ studentId: 's3', studentName: 'Sana', oldGrade: 'Grade 1A', oldSection: '', newGrade: 'Grade-1', newSection: 'Grade 1A' }]);
  });

  it('leaves an already-correct student untouched', () => {
    const students = [{ id: 's4', name: 'Hassan', currentGrade: 'Grade-1', currentSection: 'Grade 1A' }];
    const { fixes, unresolved } = computeClassSectionRepair(grades, students);
    expect(fixes).toHaveLength(0);
    expect(unresolved).toHaveLength(0);
  });

  it('reports a student whose grade matches no master record as unresolved', () => {
    const students = [{ id: 's5', name: 'Zoya', currentGrade: 'Nursery', currentSection: 'A' }];
    const { fixes, unresolved } = computeClassSectionRepair(grades, students);
    expect(fixes).toHaveLength(0);
    expect(unresolved).toEqual([{ studentId: 's5', studentName: 'Zoya', currentGrade: 'Nursery', currentSection: 'A' }]);
  });

  it('still rewrites casing even against an inactive section when the grade itself already resolved', () => {
    // isActive only gates the cross-grade "full label typed into the grade
    // field" lookup (sectionIndex) - once the grade is already resolved,
    // its own section list is matched as-is, same as the original script.
    const gradesWithInactive = [{ name: 'Grade-1', sections: [{ name: 'Grade 1A', isActive: false }, { name: 'Grade 1B' }] }];
    const students = [{ id: 's6', name: 'Omar', currentGrade: 'Grade-1', currentSection: 'grade1a' }];
    const { fixes, unresolved } = computeClassSectionRepair(gradesWithInactive, students);
    expect(unresolved).toHaveLength(0);
    expect(fixes).toEqual([{ studentId: 's6', studentName: 'Omar', oldGrade: 'Grade-1', oldSection: 'grade1a', newGrade: undefined, newSection: 'Grade 1A' }]);
  });
});
