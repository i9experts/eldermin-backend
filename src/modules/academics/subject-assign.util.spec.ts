import { mergeClassAssignment, SubjectClassScope } from './subject-assign.util';

const empty: SubjectClassScope = { gradeLevels: [], sections: [] };

describe('mergeClassAssignment', () => {
  it('adds a whole-grade assignment when no section is given', () => {
    const result = mergeClassAssignment(empty, 'Grade 6');
    expect(result).toEqual({ gradeLevels: ['Grade 6'], sections: [] });
  });

  it('does not duplicate a grade already present', () => {
    const current: SubjectClassScope = { gradeLevels: ['Grade 6'], sections: [] };
    const result = mergeClassAssignment(current, 'Grade 6');
    expect(result.gradeLevels).toEqual(['Grade 6']);
  });

  it('adds both the grade and a section-level entry when a section is given', () => {
    const result = mergeClassAssignment(empty, 'Grade 6', 'A');
    expect(result).toEqual({
      gradeLevels: ['Grade 6'],
      sections: [{ gradeLevel: 'Grade 6', sectionName: 'A' }],
    });
  });

  it('does not duplicate an identical section entry', () => {
    const current: SubjectClassScope = {
      gradeLevels: ['Grade 6'],
      sections: [{ gradeLevel: 'Grade 6', sectionName: 'A' }],
    };
    const result = mergeClassAssignment(current, 'Grade 6', 'A');
    expect(result.sections).toHaveLength(1);
  });

  it('adds a second section for the same grade without disturbing the first', () => {
    const current: SubjectClassScope = {
      gradeLevels: ['Grade 6'],
      sections: [{ gradeLevel: 'Grade 6', sectionName: 'A' }],
    };
    const result = mergeClassAssignment(current, 'Grade 6', 'B');
    expect(result.sections).toEqual([
      { gradeLevel: 'Grade 6', sectionName: 'A' },
      { gradeLevel: 'Grade 6', sectionName: 'B' },
    ]);
  });

  it('leaves existing section-level narrowing untouched when later asked for the whole grade', () => {
    const current: SubjectClassScope = {
      gradeLevels: ['Grade 6'],
      sections: [{ gradeLevel: 'Grade 6', sectionName: 'A' }],
    };
    const result = mergeClassAssignment(current, 'Grade 6');
    expect(result.sections).toEqual([{ gradeLevel: 'Grade 6', sectionName: 'A' }]);
  });
});
