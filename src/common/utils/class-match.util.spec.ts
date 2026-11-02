import { normalizeGradeName, normalizeSectionName, sameGrade, sameSection } from './class-match.util';

describe('class-match.util', () => {
  it.each(['Grade 3', 'grade-3', 'Class 3', 'G3', '3', ' 3 ', 'GRADE   3', 'Std 3', 'Standard 3', 'grade_3', 'Grade3', '03'])(
    'treats %j as grade 3', (v) => {
      expect(normalizeGradeName(v)).toBe('3');
      expect(sameGrade(v, 'Grade 3')).toBe(true);
    });

  it('does not collide unrelated grades', () => {
    expect(sameGrade('Grade 1', 'Grade 11')).toBe(false);
    expect(sameGrade('5', '15')).toBe(false);
    expect(sameGrade('Nursery', 'KG-1')).toBe(false);
    expect(sameGrade('Pre-Nursery', 'Nursery')).toBe(false);
    expect(sameGrade('KG-1', 'KG-2')).toBe(false);
    expect(sameGrade('KG-1', '1')).toBe(false);
    expect(sameGrade('Grade 1', 'Grade 2')).toBe(false);
  });

  it('keeps roman numerals and words unmapped', () => {
    expect(sameGrade('III', '3')).toBe(false);
    expect(sameGrade('One', '1')).toBe(false);
    expect(sameGrade('Grade', '3')).toBe(false);
    expect(normalizeGradeName('Nursery')).toBe('nursery');
    expect(sameGrade('nursery', ' NURSERY ')).toBe(true);
  });

  it('treats null/undefined/empty as empty', () => {
    expect(normalizeGradeName(null)).toBe('');
    expect(normalizeGradeName(undefined)).toBe('');
    expect(normalizeGradeName('  ')).toBe('');
    expect(sameGrade(null, '')).toBe(true);
    expect(sameGrade(undefined, '3')).toBe(false);
    expect(sameSection(null, undefined)).toBe(true);
    expect(sameSection('', 'A')).toBe(false);
  });

  it('handles non-string input', () => {
    expect(sameGrade(5, 'Grade 5')).toBe(true);
  });

  it('sections: trim, case, prefix', () => {
    expect(sameSection(' a ', 'A')).toBe(true);
    expect(sameSection('Section A', 'a')).toBe(true);
    expect(sameSection('section  b', 'B')).toBe(true);
    expect(sameSection('A', 'B')).toBe(false);
    expect(sameSection('A', 'AA')).toBe(false);
    expect(normalizeSectionName('Section')).toBe('section');
    expect(sameSection('Girls', 'Boys')).toBe(false);
    expect(sameSection('Section 1', '1')).toBe(true);
  });

  // Regression: Assessments' Enter Marks screen showed "No active students
  // found" / the mark sheet never appeared, because a Student's
  // currentSection is sometimes denormalized as the full class label
  // ("Grade 2A") while an Assessment's section is the bare canonical name
  // ("A") from the Grade/Section master - see bulk-assign-class-section.spec.ts
  // for the real stored convention this reproduces.
  it('matches a full class-label section against the bare canonical section', () => {
    expect(sameSection('Grade 2A', 'A')).toBe(true);
    expect(sameSection('A', 'Grade 2A')).toBe(true);
    expect(sameSection('GRADE-1B', 'B')).toBe(true);
    expect(sameSection('Class 5 C', 'C')).toBe(true);
    expect(normalizeSectionName('Grade 2A')).toBe('a');
    // Still distinguishes real sections once the grade prefix is stripped.
    expect(sameSection('Grade 2A', 'B')).toBe(false);
    // A grade-prefixed section still only matches its own grade's bare
    // section, never collides with an unrelated plain section string.
    expect(sameSection('Grade 2A', 'Grade 2A')).toBe(true);
  });
});
