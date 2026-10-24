// Age-band colour coding and call-number/classification helpers for the
// Library module, modelled on The Deenway School's "Library Shelf Visual
// Guide" (zone/bay/shelf signage, Dewey-style call numbers, age-band dots).
// Kept dependency-free like library-fine.util.ts so it can be unit-tested
// in isolation and reused by both the catalogue form and label printing.

export type AgeBandId = 'early_years' | 'lower_primary' | 'upper_primary' | 'middle' | 'secondary' | 'reference';

export interface AgeBandDef {
  id: AgeBandId;
  label: string;
  colorHex: string;
  classRange: string;
}

// Order matters: it's also the "youngest first" sort order used to pick a
// dominant band when a book spans several grade levels.
export const AGE_BANDS: AgeBandDef[] = [
  { id: 'early_years',   label: 'Early Years',    colorHex: '#E8B931', classRange: 'Playgroup-KG' },
  { id: 'lower_primary', label: 'Lower Primary',  colorHex: '#2E9E4F', classRange: 'Class 1-2' },
  { id: 'upper_primary', label: 'Upper Primary',  colorHex: '#2F7FD6', classRange: 'Class 3-5' },
  { id: 'middle',        label: 'Middle',         colorHex: '#E07B2B', classRange: 'Class 6-8' },
  { id: 'secondary',     label: 'Secondary',      colorHex: '#D03B3B', classRange: 'Class 9-10' },
  { id: 'reference',     label: 'Reference / Teachers', colorHex: '#7B4FA6', classRange: 'All' },
];

export const AGE_BAND_BY_ID: Record<AgeBandId, AgeBandDef> = AGE_BANDS.reduce((acc, b) => {
  acc[b.id] = b; return acc;
}, {} as Record<AgeBandId, AgeBandDef>);

// Grade names are whatever each school typed into Institution Setup ->
// Classes & Sections (see organization.schema.ts Grade.name) - there is no
// fixed cross-school enum, so this can only be a best-effort heuristic, not
// an exact lookup. It first looks for a trailing class/grade/year number,
// then falls back to common early-years/secondary wording. A grade name
// that matches neither is left unclassified rather than silently guessed,
// so the catalogue UI can surface "needs a band" instead of showing a wrong
// colour.
const EARLY_YEARS_WORDS = /\b(play\s*group|pre[-\s]?nursery|nursery|prep|montessori|kg\b|kindergarten|early\s*years)\b/i;
const SECONDARY_WORDS = /\b(o[-\s]?level|a[-\s]?level|matric|ssc|hssc|intermediate|college)\b/i;
const TRAILING_NUMBER = /(\d{1,2})\s*$/;

function classNumberToBand(n: number): AgeBandId {
  if (n <= 2) return 'lower_primary';
  if (n <= 5) return 'upper_primary';
  if (n <= 8) return 'middle';
  return 'secondary'; // 9, 10, 11, 12.. (O/A-level numeric equivalents)
}

export function inferBandForGradeLevel(gradeLevel: string): AgeBandId | null {
  const g = (gradeLevel || '').trim();
  if (!g) return null;
  if (EARLY_YEARS_WORDS.test(g)) return 'early_years';
  if (SECONDARY_WORDS.test(g)) return 'secondary';
  const m = g.match(TRAILING_NUMBER);
  if (m) return classNumberToBand(parseInt(m[1], 10));
  return null;
}

export interface AgeBandResult {
  bands: AgeBandId[];
  // 'mixed' when the selected grade levels span more than one band (the
  // guide: "a single colour cannot represent several bands" - callers
  // should show this as a distinct state, not silently pick one).
  // 'unclassified' when no grade level could be mapped at all.
  dominant: AgeBandId | 'mixed' | 'unclassified';
}

export function inferAgeBands(gradeLevels: string[] = [], isReferenceOnly = false): AgeBandResult {
  if (isReferenceOnly) return { bands: ['reference'], dominant: 'reference' };
  const bands = Array.from(new Set(
    (gradeLevels || []).map(inferBandForGradeLevel).filter((b): b is AgeBandId => !!b),
  ));
  if (bands.length === 0) return { bands: [], dominant: 'unclassified' };
  if (bands.length === 1) return { bands, dominant: bands[0] };
  return { bands, dominant: 'mixed' };
}

// ─── Dewey-style non-fiction subject ranges (bilingual) ────────────────────

export interface DeweyRange {
  range: string;   // e.g. "500-599"
  from: number;
  to: number;
  nameEn: string;
  nameUr: string;
}

export const DEWEY_RANGES: DeweyRange[] = [
  { range: '000-099', from: 0,   to: 99,  nameEn: 'General Knowledge & Computers', nameUr: 'معلومات عام اور کمپیوٹر' },
  { range: '100-199', from: 100, to: 199, nameEn: 'Thinking & Feelings',           nameUr: 'سوچ اور جذبات' },
  { range: '200-299', from: 200, to: 299, nameEn: 'Religions',                     nameUr: 'مذاہب' },
  { range: '300-399', from: 300, to: 399, nameEn: 'People & Society',              nameUr: 'معاشرہ اور لوگ' },
  { range: '400-499', from: 400, to: 499, nameEn: 'Languages',                     nameUr: 'زبانیں' },
  { range: '500-599', from: 500, to: 599, nameEn: 'Science & Maths',               nameUr: 'سائنس و ریاضی' },
  { range: '600-699', from: 600, to: 699, nameEn: 'Technology & Health',           nameUr: 'ٹیکنالوجی و صحت' },
  { range: '700-799', from: 700, to: 799, nameEn: 'Arts & Sports',                 nameUr: 'فنون و کھیل' },
  { range: '800-899', from: 800, to: 899, nameEn: 'Literature & Poetry',           nameUr: 'ادب و شاعری' },
  { range: '900-999', from: 900, to: 999, nameEn: 'History & Geography',           nameUr: 'تاریخ و جغرافیہ' },
];

export function findDeweyRange(num: number): DeweyRange | undefined {
  return DEWEY_RANGES.find(r => num >= r.from && num <= r.to);
}

// ─── Islamic 297.xx sub-scheme ──────────────────────────────────────────────
// Proposed local scheme, not a verified published Dewey edition - the
// guide itself says the librarian must approve these numbers before
// production use, so this is offered as a selectable aid, never enforced.

export interface IslamicSubCode {
  code: string;
  labelEn: string;
  labelUr: string;
}

export const ISLAMIC_SUBSCHEME: IslamicSubCode[] = [
  { code: '297.12',  labelEn: "Qur'an & Tafsir",                 labelUr: 'قرآن و تفسیر' },
  { code: '297.124', labelEn: 'Hadith',                           labelUr: 'حدیث' },
  { code: '297.14',  labelEn: 'Fiqh',                             labelUr: 'فقہ' },
  { code: '297.2',   labelEn: 'Aqeedah',                          labelUr: 'عقیدہ' },
  { code: '297.3',   labelEn: "Salah, Du'a & Worship",            labelUr: 'نماز، دعا و عبادات' },
  { code: '297.5',   labelEn: 'Islamic Manners & Character',      labelUr: 'اسلامی آداب و اخلاق' },
  { code: '297.63',  labelEn: 'Seerah',                           labelUr: 'سیرت طیبہ' },
  { code: '297.64',  labelEn: 'Sahabah & Family of the Prophet',  labelUr: 'صحابہ کرام و اہل بیت' },
];

// ─── Early Years picture-bin codes ──────────────────────────────────────────

export interface PictureCodeDef {
  code: string;
  labelEn: string;
  labelUr: string;
  icon: string; // emoji, deliberately simple rather than a custom icon set
}

export const PICTURE_CODES: PictureCodeDef[] = [
  { code: 'animals',          labelEn: 'Animals',            labelUr: 'جانور',   icon: '🐾' },
  { code: 'family',           labelEn: 'Family',              labelUr: 'خاندان',  icon: '🏠' },
  { code: 'numbers',          labelEn: 'Numbers',             labelUr: 'اعداد',   icon: '🔢' },
  { code: 'dua_manners',      labelEn: "Du'a & Manners",      labelUr: 'دعا و آداب', icon: '🤲' },
  { code: 'alphabet',         labelEn: 'Alphabet',            labelUr: 'حروف تہجی', icon: '🔤' },
  { code: 'prophets_stories', labelEn: "Prophets' Stories",   labelUr: 'انبیاء کے قصے', icon: '📖' },
];

// ─── Call-number suggestion helper ──────────────────────────────────────────
// A cataloguing AID only - the librarian can always overwrite the result.
// Mirrors the guide's conventions exactly (see Library Shelf Visual Guide,
// pp. 2-3 and 4-5): non-fiction = Dewey number + author code, fiction = "F"
// + author code, picture books = "E" + author code, Urdu fiction = "UF" +
// Urdu surname (left to the librarian to type - no reliable English->Urdu
// transliteration here), Islamic = the approved 297.xx sub-code.

export function surnameCode(author: string): string {
  const words = (author || '').trim().split(/\s+/).filter(Boolean);
  const surname = words[words.length - 1] || '';
  return surname.slice(0, 3).toUpperCase();
}

export interface CallNumberInput {
  category: string;      // Book.category
  author: string;
  isPictureBook?: boolean;
  deweyNumber?: number;   // for non_fiction/science/etc, the chosen 3-digit number e.g. 523
  islamicSubCode?: string; // e.g. "297.63"
}

export function suggestCallNumber(input: CallNumberInput): string {
  const code = surnameCode(input.author);
  if (input.category === 'islamic' && input.islamicSubCode) {
    return code ? `${input.islamicSubCode} ${code}` : input.islamicSubCode;
  }
  if (input.category === 'fiction') {
    return code ? `F ${code}` : 'F';
  }
  if (input.isPictureBook || input.category === 'children') {
    return code ? `E ${code}` : 'E';
  }
  if (typeof input.deweyNumber === 'number' && !Number.isNaN(input.deweyNumber)) {
    return code ? `${input.deweyNumber} ${code}` : String(input.deweyNumber);
  }
  return code;
}
