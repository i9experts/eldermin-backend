// ============================================================
// QAIDA/NAZRA EXTRAS — per-school settings, invigilator assessments,
// and the parent-reported home-tutoring reference log.
// Eldermin ERP | NestJS + MongoDB
// ============================================================
//
// Three related but independent concerns, kept in one file since each is
// small and they're always read/written together from the same settings
// screen and student view:
//   - QaidaNazraSettings: one doc per school - the Nazra progression
//     direction, and a customizable invigilator KPI list + rating scale,
//     mirroring CharacterProgramSettings' proven "school can edit this"
//     pattern (not a fixed Islamic-pillars-style list).
//   - InvigilatorAssessment: a periodic, invigilator-administered
//     assessment - distinct from the teacher's day-to-day Takhti attempt/
//     Nazra diary log, the same way TarbiyahAssessment (periodic) is kept
//     distinct from BehaviourRecord (daily).
//   - HomeRecitationLog: a PARENT-WRITTEN reference log of lessons taught
//     at home (e.g. by a qari sahab outside school) - purely informational
//     for the school's Qaida/Nazra teacher, never authoritative over the
//     official takhtis/paras progress a teacher records.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class InvigilatorKpi {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) label: string;
  @Prop() labelUrdu?: string;
}
export const InvigilatorKpiSchema = SchemaFactory.createForClass(InvigilatorKpi);

@Schema({ _id: false })
export class QaidaNazraRatingScale {
  @Prop({ default: 1 }) min: number;
  @Prop({ default: 5 }) max: number;
  @Prop({ type: [String], default: [] }) labels: string[];
}
export const QaidaNazraRatingScaleSchema = SchemaFactory.createForClass(QaidaNazraRatingScale);

// The default KPI set named in the request this module was built for -
// schools can rename, remove or add to these freely via the settings route.
export const DEFAULT_INVIGILATOR_KPIS: InvigilatorKpi[] = [
  { key: 'makharij', label: 'Makharij (Articulation Points)', labelUrdu: 'مخارج' },
  { key: 'qawaid', label: "Qawa'id (Rules)", labelUrdu: 'قواعد' },
  { key: 'lehja', label: 'Lehja (Accent/Tone)', labelUrdu: 'لہجہ' },
  { key: 'tajweed', label: 'Tajweed', labelUrdu: 'تجوید' },
  { key: 'rawani', label: 'Rawani (Fluency)', labelUrdu: 'روانی' },
];

export type QaidaNazraSettingsDocument = QaidaNazraSettings & Document;

@Schema({ timestamps: true, collection: 'qaida_nazra_settings' })
export class QaidaNazraSettings {
  @Prop({ required: true, unique: true, index: true }) schoolSlug: string;

  // Many schools teach Nazra starting from Para/Juzz 30 and work backward
  // toward Juzz 1 (the shorter, easier-to-memorize surahs come first) -
  // off (standard Juzz 1->30 order) by default so existing schools see no
  // change until they opt in.
  @Prop({ default: false }) nazraReverseOrder: boolean;

  @Prop({ type: [InvigilatorKpiSchema], default: () => DEFAULT_INVIGILATOR_KPIS })
  invigilatorKpis: InvigilatorKpi[];

  @Prop({ type: QaidaNazraRatingScaleSchema, default: () => ({ min: 1, max: 5, labels: [] }) })
  invigilatorRatingScale: QaidaNazraRatingScale;
}
export const QaidaNazraSettingsSchema = SchemaFactory.createForClass(QaidaNazraSettings);

// ============================================================
// INVIGILATOR ASSESSMENT
// ============================================================

@Schema({ _id: false })
export class KpiScore {
  @Prop({ required: true }) key: string;
  @Prop({ required: true }) score: number;
  @Prop() remarks?: string;
}
export const KpiScoreSchema = SchemaFactory.createForClass(KpiScore);

export type InvigilatorAssessmentDocument = InvigilatorAssessment & Document;

@Schema({ timestamps: true, collection: 'invigilator_assessments' })
export class InvigilatorAssessment {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true, index: true }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section?: string;
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;

  @Prop({ required: true, enum: ['qaida', 'nazra'] }) program: string;
  // Which Takhti (Qaida) or Para (Nazra) was being assessed, if the visit
  // targeted one in particular - optional, since a visit can also just be
  // a general recitation check not tied to a specific board/para.
  @Prop() takhtiOrParaNumber?: number;

  @Prop({ required: true, default: () => new Date() }) visitDate: Date;

  // An invigilator doesn't need a system account at all - most "external"
  // ones (a visiting qari/examiner from outside the school) never will.
  @Prop({ required: true, enum: ['internal', 'external'] }) invigilatorType: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) invigilatorStaffId?: Types.ObjectId;
  @Prop({ required: true }) invigilatorName: string;
  @Prop() invigilatorOrganization?: string; // external only - e.g. the madrassa/board they represent

  // One score per the school's configured InvigilatorKpi key - never a
  // fixed field set, so a school's own customized KPI list (settings
  // above) is always what gets scored, the same "trait key, not a
  // hardcoded enum field" pattern TraitScore/CharacterProgramSettings use.
  @Prop({ type: [KpiScoreSchema], required: true }) scores: KpiScore[];
  @Prop() overallScore?: number; // cached average of scores[], against invigilatorRatingScale
  @Prop() overallRemarks?: string;

  // Whoever actually entered this record into the system - may be an admin
  // typing up an external invigilator's paper scoresheet, not the
  // invigilator themselves.
  @Prop({ required: true }) recordedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) recordedById?: Types.ObjectId;

  @Prop({ default: false }) parentShared: boolean;
  @Prop() parentSharedDate?: Date;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}
export const InvigilatorAssessmentSchema = SchemaFactory.createForClass(InvigilatorAssessment);
InvigilatorAssessmentSchema.index({ schoolSlug: 1, studentId: 1, visitDate: -1 });
InvigilatorAssessmentSchema.index({ schoolSlug: 1, program: 1, visitDate: -1 });

// ============================================================
// HOME RECITATION LOG — parent-reported, reference only
// ============================================================

export type HomeRecitationLogDocument = HomeRecitationLog & Document;

@Schema({ timestamps: true, collection: 'home_recitation_logs' })
export class HomeRecitationLog {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true, index: true }) studentId: Types.ObjectId;
  @Prop({ required: true, enum: ['qaida', 'nazra'] }) program: string;
  @Prop({ required: true, default: () => new Date() }) date: Date;

  @Prop() takhtiNumber?: number; // for program: 'qaida'
  @Prop() paraNumber?: number;   // for program: 'nazra'
  @Prop() pageFrom?: string;
  @Prop() pageTo?: string;

  // Who actually taught this at home, if not the parent themselves - e.g.
  // "Qari Abdullah Sahab", so the school teacher knows who to ask about it.
  @Prop() tutorName?: string;
  @Prop() notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) loggedByGuardianId: Types.ObjectId;
  @Prop({ required: true }) loggedByGuardianName: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const HomeRecitationLogSchema = SchemaFactory.createForClass(HomeRecitationLog);
HomeRecitationLogSchema.index({ schoolSlug: 1, studentId: 1, program: 1, date: -1 });
