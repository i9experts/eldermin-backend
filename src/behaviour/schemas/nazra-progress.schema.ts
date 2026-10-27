// ============================================================
// NAZRA (QUR'AN READING) PROGRESS — Daily Diary Tracker
// Eldermin ERP | NestJS + MongoDB
// ============================================================
//
// Tracks a student's progress reading through the 30-Para (Juz) Qur'an
// after Qaida & Tajweed, using the Sabaq / Sabqi / Manzil structure that
// is the globally recognized standard across Qur'an academies and Hifz/
// Nazra programs:
//   - Sabaq  = today's new lesson (the next unread portion).
//   - Sabqi  = short-cycle revision of recently read portions (the last
//              few days'/week's sabaq), so fluency doesn't fade right
//              after it's first read.
//   - Manzil = long-cycle revision of portions completed long ago, kept
//              fresh over the whole duration of the program.
// This mirrors qaida-progress.schema.ts's proven architecture (a fixed
// curriculum array with per-unit attempts, a recomputed "current unit"
// pointer, sequential progression) but adds a genuine daily diary entity,
// since a day's Nazra lesson is one combined Sabaq+Sabqi+Manzil record,
// not a single attempt against a single unit the way a Qaida takhti is.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// The 30 Para (Juz), named by their opening word(s) - the standard way
// Qur'an academies refer to them (independently verifiable against any
// Mushaf's Juz index), with an approximate page range against the common
// 604-page Madani Mushaf for teachers who assign sabaq by page number.
export interface NazraParaDef {
  number: number;
  titleEn: string;
  titleAr: string;
  approxPageRange: string;
}

export const NAZRA_PARAS: NazraParaDef[] = [
  { number: 1, titleEn: 'Alif Lam Meem', titleAr: 'الم', approxPageRange: 'pp. 1-21' },
  { number: 2, titleEn: 'Sayaqul', titleAr: 'سيقول', approxPageRange: 'pp. 22-41' },
  { number: 3, titleEn: "Tilka'r-Rusul", titleAr: 'تلك الرسل', approxPageRange: 'pp. 42-61' },
  { number: 4, titleEn: 'Lan Tana Lu', titleAr: 'لن تنالوا', approxPageRange: 'pp. 62-81' },
  { number: 5, titleEn: "Wal-Muhsanat", titleAr: 'والمحصنات', approxPageRange: 'pp. 82-101' },
  { number: 6, titleEn: 'La Yuhibbullah', titleAr: 'لا يحب الله', approxPageRange: 'pp. 102-121' },
  { number: 7, titleEn: "Wa Iza Sami'u", titleAr: 'وإذا سمعوا', approxPageRange: 'pp. 122-141' },
  { number: 8, titleEn: 'Wa Lau Annana', titleAr: 'ولو أننا', approxPageRange: 'pp. 142-161' },
  { number: 9, titleEn: "Qalal Mala'u", titleAr: 'قال الملأ', approxPageRange: 'pp. 162-181' },
  { number: 10, titleEn: "Wa A'lamu", titleAr: 'واعلموا', approxPageRange: 'pp. 182-201' },
  { number: 11, titleEn: "Ya'tadhiruna", titleAr: 'يعتذرون', approxPageRange: 'pp. 202-221' },
  { number: 12, titleEn: "Wa Ma Min Da'abat", titleAr: 'وما من دابة', approxPageRange: 'pp. 222-241' },
  { number: 13, titleEn: 'Wa Ma Ubrioo', titleAr: 'وما أبرئ', approxPageRange: 'pp. 242-261' },
  { number: 14, titleEn: 'Rubama', titleAr: 'ربما', approxPageRange: 'pp. 262-281' },
  { number: 15, titleEn: "Subhanalladhi", titleAr: 'سبحان الذي', approxPageRange: 'pp. 282-301' },
  { number: 16, titleEn: 'Qal Alam', titleAr: 'قال ألم', approxPageRange: 'pp. 302-321' },
  { number: 17, titleEn: 'Aqtaraba', titleAr: 'اقترب', approxPageRange: 'pp. 322-341' },
  { number: 18, titleEn: 'Qad Aflaha', titleAr: 'قد أفلح', approxPageRange: 'pp. 342-361' },
  { number: 19, titleEn: 'Wa Qalalladhina', titleAr: 'وقال الذين', approxPageRange: 'pp. 362-381' },
  { number: 20, titleEn: 'A Man Khalaq', titleAr: 'أمن خلق', approxPageRange: 'pp. 382-401' },
  { number: 21, titleEn: 'Utlu Ma Oohi', titleAr: 'اتل ما أوحي', approxPageRange: 'pp. 402-421' },
  { number: 22, titleEn: 'Wa Man Yaqnut', titleAr: 'ومن يقنت', approxPageRange: 'pp. 422-441' },
  { number: 23, titleEn: 'Wa Mali', titleAr: 'وما لي', approxPageRange: 'pp. 442-461' },
  { number: 24, titleEn: 'Faman Azlam', titleAr: 'فمن أظلم', approxPageRange: 'pp. 462-481' },
  { number: 25, titleEn: 'Ilayhi Yuraddu', titleAr: 'إليه يرد', approxPageRange: 'pp. 482-501' },
  { number: 26, titleEn: "Ha Meem", titleAr: 'حم', approxPageRange: 'pp. 502-521' },
  { number: 27, titleEn: 'Qala Fama Khatbukum', titleAr: 'قال فما خطبكم', approxPageRange: 'pp. 522-541' },
  { number: 28, titleEn: 'Qad Sami Allah', titleAr: 'قد سمع الله', approxPageRange: 'pp. 542-561' },
  { number: 29, titleEn: 'Tabarakalladhi', titleAr: 'تبارك الذي', approxPageRange: 'pp. 562-581' },
  { number: 30, titleEn: "Amma Yatasa'aloon", titleAr: 'عم يتساءلون', approxPageRange: 'pp. 582-604' },
];

export const NAZRA_PARA_COUNT = NAZRA_PARAS.length;

export type NazraParaStatus = 'not_started' | 'in_progress' | 'completed' | 'needs_revision';
export type NazraOverallStatus = 'not_started' | 'in_progress' | 'completed';

// Common, specific tajweed/fluency error tags - the globally-taught Qur'an
// recitation rules, distinct from Qaida's makhraj-primer error set since a
// Nazra student is reading connected ayahs, not isolated letters.
export const NAZRA_COMMON_ERRORS = [
  'makhraj_confusion',
  'missed_ghunna',
  'madd_too_short',
  'madd_too_long',
  'qalqalah_missed',
  'idgham_missed',
  'ikhfa_missed',
  'izhar_missed',
  'iqlab_missed',
  'waqf_ignored',
  'tashdeed_not_doubled',
  'fluency_too_slow',
  'word_misread',
] as const;

const RATINGS = ['needs_practice', 'developing', 'proficient', 'mastered'];

@Schema({ _id: false })
class SabaqAttempt {
  @Prop({ required: true, default: () => new Date() }) date: Date;
  @Prop({ required: true }) assessedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assessedById?: Types.ObjectId;

  @Prop() pageFrom?: string;
  @Prop() pageTo?: string;

  @Prop({ min: 1, max: 5 }) makhrajAccuracy?: number;
  @Prop({ min: 1, max: 5 }) tajweedAccuracy?: number;
  @Prop({ min: 1, max: 5 }) fluency?: number;

  @Prop({ enum: RATINGS, required: true }) rating: string;
  @Prop({ type: [String], default: [] }) errorsNoted: string[];
  @Prop() remarks?: string;
}
const SabaqAttemptSchema = SchemaFactory.createForClass(SabaqAttempt);

@Schema({ _id: false })
class ParaRecord {
  @Prop({ required: true }) paraNumber: number;
  @Prop({
    enum: ['not_started', 'in_progress', 'completed', 'needs_revision'],
    default: 'not_started',
  })
  status: NazraParaStatus;

  @Prop() startedDate?: Date;
  @Prop() completedDate?: Date;
  // Bumped whenever a completed Para is reopened, either by a weak Sabaq
  // re-attempt or by a weak Sabqi/Manzil revision against it - the real
  // "which Para keeps slipping" signal for the report.
  @Prop({ default: 0 }) revisionCount: number;

  @Prop({ type: [SabaqAttemptSchema], default: [] }) attempts: SabaqAttempt[];
}
const ParaRecordSchema = SchemaFactory.createForClass(ParaRecord);

// A revision reference (used for both Sabqi and Manzil) - lighter than a
// full Sabaq attempt since it's judging retention of an already-read
// portion, not first-time correctness.
@Schema({ _id: false })
class RevisionEntry {
  @Prop({ required: true }) paraNumber: number;
  @Prop() pageFrom?: string;
  @Prop() pageTo?: string;
  @Prop({ enum: RATINGS, required: true }) rating: string;
  @Prop({ type: [String], default: [] }) errorsNoted: string[];
  @Prop() remarks?: string;
}
const RevisionEntrySchema = SchemaFactory.createForClass(RevisionEntry);

// The Sabaq half of a diary entry, declared directly (rather than reusing
// the SabaqAttempt sub-schema) so paraNumber is a first-class field here
// instead of being bolted onto a schema built for a different purpose.
@Schema({ _id: false })
class DiarySabaq {
  @Prop({ required: true }) paraNumber: number;
  @Prop() pageFrom?: string;
  @Prop() pageTo?: string;
  @Prop({ min: 1, max: 5 }) makhrajAccuracy?: number;
  @Prop({ min: 1, max: 5 }) tajweedAccuracy?: number;
  @Prop({ min: 1, max: 5 }) fluency?: number;
  @Prop({ enum: RATINGS, required: true }) rating: string;
  @Prop({ type: [String], default: [] }) errorsNoted: string[];
  @Prop() remarks?: string;
}
const DiarySabaqSchema = SchemaFactory.createForClass(DiarySabaq);

// One day's complete Nazra diary entry - the actual "daily diary" the
// program is built around. Sabaq is required (every lesson day has a new
// portion); Sabqi/Manzil are optional since not every single day's diary
// necessarily logs both revision cycles, though the roster/report views
// surface when either has been skipped for too long.
@Schema({ _id: false })
class NazraDiaryEntry {
  @Prop({ required: true, default: () => new Date() }) date: Date;
  @Prop({ required: true }) assessedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assessedById?: Types.ObjectId;

  @Prop({ type: DiarySabaqSchema, required: true }) sabaq: DiarySabaq;
  @Prop({ type: RevisionEntrySchema }) sabqi?: RevisionEntry;
  @Prop({ type: RevisionEntrySchema }) manzil?: RevisionEntry;
}
const NazraDiaryEntrySchema = SchemaFactory.createForClass(NazraDiaryEntry);

export type NazraProgressDocument = NazraProgress & Document;

@Schema({ timestamps: true, collection: 'nazra_progress' })
export class NazraProgress {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;

  @Prop({ type: [ParaRecordSchema], default: () => NAZRA_PARAS.map((p, i) => ({
    paraNumber: p.number,
    status: i === 0 ? 'in_progress' : 'not_started',
    startedDate: i === 0 ? new Date() : undefined,
    revisionCount: 0,
    attempts: [],
  })) })
  paras: ParaRecord[];

  // Cached pointer to the furthest Para currently in_progress/needs_revision
  // (or the next not_started one) - same convention as Qaida's currentTakhti.
  @Prop({ default: 1 }) currentPara: number;

  @Prop({
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'in_progress',
  })
  overallStatus: NazraOverallStatus;

  @Prop() startDate: Date;
  @Prop() completionDate?: Date;

  @Prop() currentTeacher?: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) currentTeacherId?: Types.ObjectId;

  @Prop() overallRemarks?: string;

  // The full daily diary log - every Sabaq/Sabqi/Manzil entry ever recorded,
  // oldest first, the single real record of "what did this student read and
  // revise, and how well, on every day of the program".
  @Prop({ type: [NazraDiaryEntrySchema], default: [] }) diaryEntries: NazraDiaryEntry[];

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const NazraProgressSchema = SchemaFactory.createForClass(NazraProgress);
NazraProgressSchema.index({ studentId: 1, schoolSlug: 1 }, { unique: true });
NazraProgressSchema.index({ schoolSlug: 1, grade: 1, section: 1 });
NazraProgressSchema.index({ schoolSlug: 1, overallStatus: 1 });
