import { QURAN_SURAHS, QURAN_SURAH_COUNT, QURAN_TOTAL_AYAH_COUNT, getSurahByNumber } from './quran-surahs';

describe('QURAN_SURAHS', () => {
  it('has exactly 114 surahs, numbered 1 through 114 in order', () => {
    expect(QURAN_SURAH_COUNT).toBe(114);
    expect(QURAN_SURAHS.map((s) => s.number)).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
  });

  it('ayah counts sum to the standard 6236 total (Kufic count)', () => {
    expect(QURAN_TOTAL_AYAH_COUNT).toBe(6236);
  });

  it('getSurahByNumber finds a known surah and returns undefined for an invalid number', () => {
    expect(getSurahByNumber(2)).toEqual(expect.objectContaining({ nameEn: 'Al-Baqarah', ayahCount: 286 }));
    expect(getSurahByNumber(0)).toBeUndefined();
    expect(getSurahByNumber(115)).toBeUndefined();
  });
});
