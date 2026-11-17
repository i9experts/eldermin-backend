import { inferAgeBands, inferBandForGradeLevel, suggestCallNumber, surnameCode, findDeweyRange } from './library-age-band.util';

describe('library-age-band.util', () => {
  describe('inferBandForGradeLevel', () => {
    it('maps early-years wording', () => {
      expect(inferBandForGradeLevel('Playgroup')).toBe('early_years');
      expect(inferBandForGradeLevel('Nursery')).toBe('early_years');
      expect(inferBandForGradeLevel('KG')).toBe('early_years');
      expect(inferBandForGradeLevel('Montessori 2')).toBe('early_years');
    });
    it('maps class numbers to bands', () => {
      expect(inferBandForGradeLevel('Class 1')).toBe('lower_primary');
      expect(inferBandForGradeLevel('Grade 2')).toBe('lower_primary');
      expect(inferBandForGradeLevel('Class 3')).toBe('upper_primary');
      expect(inferBandForGradeLevel('Class 5')).toBe('upper_primary');
      expect(inferBandForGradeLevel('Class 6')).toBe('middle');
      expect(inferBandForGradeLevel('Class 8')).toBe('middle');
      expect(inferBandForGradeLevel('Class 9')).toBe('secondary');
      expect(inferBandForGradeLevel('Class 10')).toBe('secondary');
    });
    it('maps secondary-level wording without a number', () => {
      expect(inferBandForGradeLevel('O-Level')).toBe('secondary');
      expect(inferBandForGradeLevel('Matric')).toBe('secondary');
    });
    it('returns null for unrecognised wording', () => {
      expect(inferBandForGradeLevel('Foundation Stream')).toBeNull();
      expect(inferBandForGradeLevel('')).toBeNull();
    });
  });

  describe('inferAgeBands', () => {
    it('returns reference band when isReferenceOnly is set, ignoring gradeLevels', () => {
      expect(inferAgeBands(['Class 3'], true)).toEqual({ bands: ['reference'], dominant: 'reference' });
    });
    it('returns a single dominant band when all grade levels agree', () => {
      expect(inferAgeBands(['Class 3', 'Class 4', 'Class 5'])).toEqual({
        bands: ['upper_primary'], dominant: 'upper_primary',
      });
    });
    it('returns mixed when grade levels span more than one band', () => {
      const result = inferAgeBands(['Class 2', 'Class 6']);
      expect(result.dominant).toBe('mixed');
      expect(result.bands.sort()).toEqual(['lower_primary', 'middle']);
    });
    it('returns unclassified when nothing maps and no grade levels given', () => {
      expect(inferAgeBands([])).toEqual({ bands: [], dominant: 'unclassified' });
      expect(inferAgeBands(['Foundation Stream'])).toEqual({ bands: [], dominant: 'unclassified' });
    });
  });

  describe('surnameCode / suggestCallNumber', () => {
    it('derives a 3-letter surname code from the last word of the author name', () => {
      expect(surnameCode('Dr. Muhammad Khan')).toBe('KHA');
      expect(surnameCode('Ali')).toBe('ALI');
      expect(surnameCode('')).toBe('');
    });
    it('suggests non-fiction call numbers as "<dewey> <code>"', () => {
      expect(suggestCallNumber({ category: 'non_fiction', author: 'Sana Khan', deweyNumber: 523 })).toBe('523 KHA');
    });
    it('suggests fiction call numbers as "F <code>"', () => {
      expect(suggestCallNumber({ category: 'fiction', author: 'Mariam Adam' })).toBe('F ADA');
    });
    it('suggests picture-book call numbers as "E <code>"', () => {
      expect(suggestCallNumber({ category: 'children', author: 'Ali Don', isPictureBook: true })).toBe('E DON');
    });
    it('suggests Islamic call numbers from the approved sub-code', () => {
      expect(suggestCallNumber({ category: 'islamic', author: 'Ibn Khan', islamicSubCode: '297.63' })).toBe('297.63 KHA');
      expect(suggestCallNumber({ category: 'islamic', author: '', islamicSubCode: '297.63' })).toBe('297.63');
    });
  });

  describe('findDeweyRange', () => {
    it('finds the range containing a given number', () => {
      expect(findDeweyRange(523)?.range).toBe('500-599');
      expect(findDeweyRange(0)?.range).toBe('000-099');
      expect(findDeweyRange(999)?.range).toBe('900-999');
    });
    it('returns undefined outside 0-999', () => {
      expect(findDeweyRange(1000)).toBeUndefined();
    });
  });
});
