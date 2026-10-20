import { buildClassTeacherOfName } from './class-teacher-label.util';

describe('buildClassTeacherOfName', () => {
  it('concatenates grade and section when the section name is a bare letter', () => {
    expect(buildClassTeacherOfName('Grade 2', 'B')).toBe('Grade 2 - B');
  });

  it('uses the section name alone when it already includes the grade name', () => {
    expect(buildClassTeacherOfName('Grade-2', 'Grade 2B')).toBe('Grade 2B');
  });

  it('handles hyphen/space variants between grade and section (KG / KG-B)', () => {
    expect(buildClassTeacherOfName('KG', 'KG-B')).toBe('KG-B');
  });

  it('falls back to the grade name alone when there is no section', () => {
    expect(buildClassTeacherOfName('Grade 2', undefined)).toBe('Grade 2');
    expect(buildClassTeacherOfName('Grade 2', null)).toBe('Grade 2');
    expect(buildClassTeacherOfName('Grade 2', '')).toBe('Grade 2');
  });
});
