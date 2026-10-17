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
}

export const QAIDA_TAKHTIS: QaidaTakhtiDef[] = [
  { number: 1, key: 'mufradat', titleEn: 'Mufradat', titleUr: 'مفردات',
    description: 'The 29 isolated Arabic letters and their correct articulation points (makhraj).',
    focus: ['makhraj'] },
  { number: 2, key: 'murakkabat', titleEn: 'Murakkabat', titleUr: 'مرکبات',
    description: 'Letters joined in pairs and triplets - recognizing how a letter’s shape changes when connected.',
    focus: ['makhraj'] },
  { number: 3, key: 'muqattaat', titleEn: "Huroof-e-Muqatta'at", titleUr: 'حروف مقطعات',
    description: "The Qur'an's disjointed letter sets (الم، كهيعص...), memorized early as a point of barakah.",
    focus: ['makhraj'] },
  { number: 4, key: 'harakaat', titleEn: 'Harakaat', titleUr: 'حرکات',
    description: 'Zabar, Zer and Pesh (fatha/kasra/damma) on every letter, isolated and joined.',
    focus: ['makhraj', 'tajweed'] },
  { number: 5, key: 'tanween', titleEn: 'Tanween', titleUr: 'تنوین',
    description: 'Do-Zabar, Do-Zer, Do-Pesh and the nasal ghunna sound that comes with them.',
    focus: ['tajweed'] },
  { number: 6, key: 'mashq_harakaat_tanween', titleEn: 'Mashq Harakaat-o-Tanween', titleUr: 'مشق حرکات و تنوین',
    description: 'Full-word drilling combining letters, harakaat and tanween.',
    focus: ['makhraj', 'tajweed', 'fluency'] },
  { number: 7, key: 'khari_harakaat', titleEn: 'Khari Zabar, Khari Zer, Ulta Pesh', titleUr: 'کھڑی زبر، کھڑی زیر، الٹا پیش',
    description: 'The vertical/mini-letter stand-in marks for long vowels written without a full alif/ya/waw.',
    focus: ['tajweed'] },
  { number: 8, key: 'madd_o_leen', titleEn: 'Madd-o-Leen', titleUr: 'مدہ ولین',
    description: 'Elongation letters (huroof-e-madd) and the soft letters (huroof-e-leen) - the foundation of correct vowel length.',
    focus: ['tajweed'] },
  { number: 9, key: 'mashq_harakaat_madd', titleEn: 'Mashq Harakaat (Madd-o-Leen)', titleUr: 'مشق حرکات مدہ ولین',
    description: 'Real Qur’anic words practicing madd and leen together with every harakaat and tanween learned so far.',
    focus: ['makhraj', 'tajweed', 'fluency'] },
  { number: 10, key: 'sukoon', titleEn: 'Sukoon (Jazm)', titleUr: 'سکون یعنی جزم',
    description: 'The quiescent mark - a letter with no vowel - drilled through the full alphabet, with special care for letters that sound alike when sakin.',
    focus: ['makhraj', 'tajweed'] },
  { number: 11, key: 'mashq_sukoon', titleEn: 'Mashq Sukoon', titleUr: 'مشق سکون',
    description: 'Full-word and real ayah-fragment practice, including the waqf (stop) signs.',
    focus: ['makhraj', 'tajweed', 'fluency'] },
  { number: 12, key: 'tashdeed', titleEn: 'Tashdeed', titleUr: 'تشدید',
    description: 'The shadda (doubling) mark - pronouncing a letter twice.',
    focus: ['tajweed'] },
  { number: 13, key: 'mashq_tashdeed', titleEn: 'Mashq Tashdeed', titleUr: 'مشق تشدید',
    description: 'Word and short-surah practice applying tashdeed, including complete surahs like Ash-Shams and Ad-Duha.',
    focus: ['makhraj', 'tajweed', 'fluency'] },
  { number: 14, key: 'mashq_tashdeed_sukoon', titleEn: "Mashq Tashdeed ma' Sukoon", titleUr: 'مشق تشدید مع سکون',
    description: 'Tashdeed combined with sukoon in the same word - e.g. Surah At-Tin, Al-Inshiqaq.',
    focus: ['tajweed', 'fluency'] },
  { number: 15, key: 'tashdeed_tashdeed', titleEn: "Tashdeed ma' Tashdeed", titleUr: 'تشدید مع تشدید',
    description: 'Two consecutive shadda-marked letters in the same word.',
    focus: ['tajweed', 'fluency'] },
  { number: 16, key: 'tashdeed_baad_madd', titleEn: 'Tashdeed ba’d Huroof-e-Madd', titleUr: 'تشدید بعد حروف مدہ',
    description: 'Shadda immediately following a letter of elongation - the rule that the madd is not shortened.',
    focus: ['tajweed', 'fluency'] },
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
  @Prop({ required: true, default: () => new Date() }) date: Date;
  @Prop({ required: true }) assessedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assessedById?: Types.ObjectId;

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
