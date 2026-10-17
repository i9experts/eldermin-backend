// ============================================================
// QAIDA & TAJWEED PROGRESS — Noorani Qaida Tracker
// Eldermin ERP | NestJS + MongoDB
// ============================================================
//
// Tracks a student's progress through the classical 16-Takhti Noorani
// Qaida sequence (the makhraj/tajweed primer used across Pakistan, India
// and Bangladesh before a child begins reading the Quran itself). The
// marketing site has long promised "Hifz and Nazrah progress" under
// Behaviour & Tarbiyah - this is the real implementation of that, built
// directly from the actual Idara-tul-Islamiyat (Lahore) edition.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// The 16 Takhtis, verified page-by-page against the Noorani Qaida itself
// (each board's own "Takhti Number N" header) - not a paraphrase. `focus`
// tags which rating fields on an attempt are actually meaningful for that
// board (e.g. "tajweed" accuracy means nothing yet on Takhti 1, which is
// pure letter-recognition).
export interface QaidaTakhtiDef {
  number: number;
  key: string;
  titleEn: string;
  titleUr: string;
  description: string;
  focus: ('makhraj' | 'tajweed' | 'fluency')[];
  // Which physical page of the Idara-tul-Islamiyat (Lahore) Noorani Qaida
  // this board is on - always given, so a teacher testing a child always
  // knows exactly which page to have the real book open to, regardless of
  // whether referenceContent below is populated for this board.
  pageReference: string;
  // The actual letters/sets this board drills, shown in the tracker itself
  // so a teacher can test a child without a separate physical copy open.
  // Deliberately populated ONLY where the content is a fixed, independently
  // verifiable list with no diacritic placement to get wrong (the plain
  // 29-letter alphabet, and the Qur'an's own canonical muqatta'at sets) -
  // left unset for boards whose content is specific joined-letter shapes,
  // harakaat-marked or tashdeed-marked words as laid out on that exact
  // page, which risk a transcription error no one should see repeated
  // inside a product real children are taught from. Those boards rely on
  // pageReference above instead.
  referenceContent?: string[];
  // Transliteration for each entry in referenceContent, same index order -
  // lets a teacher mark a sabaq (lesson range) in plain English ("Alif to
  // Kaf") the way it's actually spoken in class, instead of only by
  // pointing at the Arabic glyph.
  referenceLabels?: string[];
}

// The standard 29-letter Arabic abjad, in the order the Qaida itself uses
// (Mufradat, Takhti 1) - independently verifiable, not board-specific.
const ARABIC_29_LETTERS = ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'و', 'ه', 'ء', 'ي'];
const ARABIC_29_LABELS = ['Alif', 'Ba', 'Ta', 'Tha', 'Jeem', 'Ha', 'Kha', 'Dal', 'Zal', 'Ra', 'Za', 'Seen', 'Sheen', 'Sad', 'Dad', 'Toe', 'Zoe', 'Ain', 'Ghain', 'Fa', 'Qaf', 'Kaf', 'Lam', 'Meem', 'Noon', 'Wao', 'Ha (small)', 'Hamza', 'Ya'];

export const QAIDA_TAKHTIS: QaidaTakhtiDef[] = [
  { number: 1, key: 'mufradat', titleEn: 'Mufradat', titleUr: 'مفردات',
    description: 'The 29 isolated Arabic letters and their correct articulation points (makhraj).',
    focus: ['makhraj'], pageReference: 'p. 2', referenceContent: ARABIC_29_LETTERS, referenceLabels: ARABIC_29_LABELS },
  { number: 2, key: 'murakkabat', titleEn: 'Murakkabat', titleUr: 'مرکبات',
    description: 'Letters joined in pairs and triplets - recognizing how a letter’s shape changes when connected.',
    focus: ['makhraj'], pageReference: 'p. 3-5' },
  { number: 3, key: 'muqattaat', titleEn: "Huroof-e-Muqatta'at", titleUr: 'حروف مقطعات',
    description: "The Qur'an's disjointed letter sets, memorized early as a point of barakah.",
    focus: ['makhraj'], pageReference: 'p. 6',
    referenceContent: ['الم', 'المص', 'الر', 'المر', 'كهيعص', 'طه', 'طسم', 'طس', 'يس', 'حم', 'عسق', 'ق', 'ن', 'ص'],
    referenceLabels: ['Alif-Lam-Meem', 'Alif-Lam-Meem-Sad', 'Alif-Lam-Ra', 'Alif-Lam-Meem-Ra', 'Kaf-Ha-Ya-Ain-Sad', 'Ta-Ha', 'Ta-Seen-Meem', 'Ta-Seen', 'Ya-Seen', 'Ha-Meem', 'Ain-Seen-Qaf', 'Qaf', 'Noon', 'Sad'] },
  { number: 4, key: 'harakaat', titleEn: 'Harakaat', titleUr: 'حرکات',
    description: 'Zabar, Zer and Pesh (fatha/kasra/damma) applied to every letter below, isolated and joined.',
    focus: ['makhraj', 'tajweed'], pageReference: 'p. 6-9', referenceContent: ARABIC_29_LETTERS, referenceLabels: ARABIC_29_LABELS },
  { number: 5, key: 'tanween', titleEn: 'Tanween', titleUr: 'تنوین',
    description: 'Do-Zabar, Do-Zer, Do-Pesh applied to every letter below, and the nasal ghunna sound that comes with them.',
    focus: ['tajweed'], pageReference: 'p. 8-9', referenceContent: ARABIC_29_LETTERS, referenceLabels: ARABIC_29_LABELS },
  { number: 6, key: 'mashq_harakaat_tanween', titleEn: 'Mashq Harakaat-o-Tanween', titleUr: 'مشق حرکات و تنوین',
    description: 'Full-word drilling combining letters, harakaat and tanween.',
    focus: ['makhraj', 'tajweed', 'fluency'], pageReference: 'p. 10-11' },
  { number: 7, key: 'khari_harakaat', titleEn: 'Khari Zabar, Khari Zer, Ulta Pesh', titleUr: 'کھڑی زبر، کھڑی زیر، الٹا پیش',
    description: 'The vertical/mini-letter stand-in marks for long vowels written without a full alif/ya/waw.',
    focus: ['tajweed'], pageReference: 'p. 11-12' },
  { number: 8, key: 'madd_o_leen', titleEn: 'Madd-o-Leen', titleUr: 'مدہ ولین',
    description: 'Elongation letters (huroof-e-madd) and the soft letters (huroof-e-leen) - the foundation of correct vowel length.',
    focus: ['tajweed'], pageReference: 'p. 12-14' },
  { number: 9, key: 'mashq_harakaat_madd', titleEn: 'Mashq Harakaat (Madd-o-Leen)', titleUr: 'مشق حرکات مدہ ولین',
    description: 'Real Qur’anic words practicing madd and leen together with every harakaat and tanween learned so far.',
    focus: ['makhraj', 'tajweed', 'fluency'], pageReference: 'p. 15-17' },
  { number: 10, key: 'sukoon', titleEn: 'Sukoon (Jazm)', titleUr: 'سکون یعنی جزم',
    description: 'The quiescent mark applied to every letter below, with special care for letters that sound alike when sakin.',
    focus: ['makhraj', 'tajweed'], pageReference: 'p. 18', referenceContent: ARABIC_29_LETTERS, referenceLabels: ARABIC_29_LABELS },
  { number: 11, key: 'mashq_sukoon', titleEn: 'Mashq Sukoon', titleUr: 'مشق سکون',
    description: 'Full-word and real ayah-fragment practice, including the waqf (stop) signs.',
    focus: ['makhraj', 'tajweed', 'fluency'], pageReference: 'p. 19-23' },
  { number: 12, key: 'tashdeed', titleEn: 'Tashdeed', titleUr: 'تشدید',
    description: 'The shadda (doubling) mark applied to every letter below - pronouncing it twice.',
    focus: ['tajweed'], pageReference: 'p. 24', referenceContent: ARABIC_29_LETTERS, referenceLabels: ARABIC_29_LABELS },
  { number: 13, key: 'mashq_tashdeed', titleEn: 'Mashq Tashdeed', titleUr: 'مشق تشدید',
    description: 'Word and short-surah practice applying tashdeed, including complete surahs like Ash-Shams and Ad-Duha.',
    focus: ['makhraj', 'tajweed', 'fluency'], pageReference: 'p. 25-26' },
  { number: 14, key: 'mashq_tashdeed_sukoon', titleEn: "Mashq Tashdeed ma' Sukoon", titleUr: 'مشق تشدید مع سکون',
    description: 'Tashdeed combined with sukoon in the same word - e.g. Surah At-Tin, Al-Inshiqaq.',
    focus: ['tajweed', 'fluency'], pageReference: 'p. 27' },
  { number: 15, key: 'tashdeed_tashdeed', titleEn: "Tashdeed ma' Tashdeed", titleUr: 'تشدید مع تشدید',
    description: 'Two consecutive shadda-marked letters in the same word.',
    focus: ['tajweed', 'fluency'], pageReference: 'p. 28' },
  { number: 16, key: 'tashdeed_baad_madd', titleEn: 'Tashdeed ba’d Huroof-e-Madd', titleUr: 'تشدید بعد حروف مدہ',
    description: 'Shadda immediately following a letter of elongation - the rule that the madd is not shortened.',
    focus: ['tajweed', 'fluency'], pageReference: 'p. 29' },
];

export const QAIDA_TAKHTI_COUNT = QAIDA_TAKHTIS.length;

export type QaidaTakhtiStatus = 'not_started' | 'in_progress' | 'mastered' | 'needs_revision';
export type QaidaOverallStatus = 'not_started' | 'in_progress' | 'completed';

// Common, specific error tags a teacher can flag on an attempt - drawn
// directly from the cautions the Qaida itself prints (e.g. the Takhti 10
// warning about letters that sound alike when sakin, the Takhti 5 ghunna
// rule). Free-text `remarks` still covers anything not on this list.
export const QAIDA_COMMON_ERRORS = [
  'makhraj_confusion',      // e.g. ط/ت, ض/ظ/ز/ذ, س/ص, ک/ق confused when sakin
  'missed_ghunna',          // nasalization dropped on tanween/noon-sakin
  'madd_too_short',         // elongation not held long enough
  'madd_too_long',          // over-elongated
  'tashdeed_not_doubled',   // shadda read as a single letter
  'waqf_ignored',           // ran through a stop sign without pausing
  'tanween_as_noon',        // tanween mispronounced as a plain noon sound
  'letter_shape_misread',   // wrong letter read due to joined-shape confusion
] as const;

@Schema({ _id: false })
class TakhtiAttempt {
  // Settable by the teacher (not always "now") - a sabaq logged after the
  // fact (end of day, or catching up on a missed entry) should carry the
  // date/time it was actually taught, not when the record was saved.
  @Prop({ required: true, default: () => new Date() }) date: Date;
  @Prop({ required: true }) assessedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assessedById?: Types.ObjectId;

  // The sabaq (lesson) range actually covered in this session - e.g.
  // "Alif" to "Kaf" on the Mufradat board. Plain text (the referenceLabels
  // entry, or free text for boards with no fixed reference list) rather
  // than an index pair, so it stays meaningful even if QAIDA_TAKHTIS'
  // reference content is ever revised.
  @Prop() sabaqFrom?: string;
  @Prop() sabaqTo?: string;

  // 1-5 scale, consistent with TarbiyahAssessment's TraitScore convention.
  // Only the fields relevant to this takhti's `focus` are expected to be
  // filled in by the UI, but all three are accepted so a teacher can note
  // overall fluency even on an early, makhraj-only board.
  @Prop({ min: 1, max: 5 }) makhrajAccuracy?: number;
  @Prop({ min: 1, max: 5 }) tajweedAccuracy?: number;
  @Prop({ min: 1, max: 5 }) fluency?: number;

  @Prop({
    enum: ['needs_practice', 'developing', 'proficient', 'mastered'],
    required: true,
  })
  rating: string;

  @Prop({ type: [String], default: [] }) errorsNoted: string[];
  @Prop() remarks?: string;
}
const TakhtiAttemptSchema = SchemaFactory.createForClass(TakhtiAttempt);

@Schema({ _id: false })
class TakhtiRecord {
  @Prop({ required: true }) takhtiNumber: number;
  @Prop({
    enum: ['not_started', 'in_progress', 'mastered', 'needs_revision'],
    default: 'not_started',
  })
  status: QaidaTakhtiStatus;

  @Prop() startedDate?: Date;
  @Prop() masteredDate?: Date;
  // How many times this board has been revisited after once being marked
  // mastered then sent back to needs_revision - a real signal of which
  // rule a student is actually struggling with, for the assessment report.
  @Prop({ default: 0 }) revisionCount: number;

  @Prop({ type: [TakhtiAttemptSchema], default: [] }) attempts: TakhtiAttempt[];
}
const TakhtiRecordSchema = SchemaFactory.createForClass(TakhtiRecord);

export type QaidaProgressDocument = QaidaProgress & Document;

@Schema({ timestamps: true, collection: 'qaida_progress' })
export class QaidaProgress {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  // Denormalized from the reporting staff member's own campus at creation
  // time, same convention as every other record in this module.
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;

  @Prop({ type: [TakhtiRecordSchema], default: () => QAIDA_TAKHTIS.map((t, i) => ({
    takhtiNumber: t.number,
    status: i === 0 ? 'in_progress' : 'not_started',
    startedDate: i === 0 ? new Date() : undefined,
    revisionCount: 0,
    attempts: [],
  })) })
  takhtis: TakhtiRecord[];

  // Cached pointer to the furthest board currently in_progress/needs_revision
  // (or the next not_started one) - avoids every roster view having to scan
  // all 16 entries just to show "where is this student right now".
  @Prop({ default: 1 }) currentTakhti: number;

  @Prop({
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'in_progress',
  })
  overallStatus: QaidaOverallStatus;

  @Prop() startDate: Date;
  @Prop() completionDate?: Date;

  // The teacher currently responsible for this student's Qaida instruction -
  // shown on the class roster; doesn't need to be the class teacher (Qaida
  // is often taught by a dedicated Qaida/Nazra teacher).
  @Prop() currentTeacher?: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) currentTeacherId?: Types.ObjectId;

  @Prop() overallRemarks?: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const QaidaProgressSchema = SchemaFactory.createForClass(QaidaProgress);
QaidaProgressSchema.index({ studentId: 1, schoolSlug: 1 }, { unique: true });
QaidaProgressSchema.index({ schoolSlug: 1, grade: 1, section: 1 });
QaidaProgressSchema.index({ schoolSlug: 1, overallStatus: 1 });
