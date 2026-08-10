// ============================================================
// BEHAVIOUR & TARBIYAH SCHEMAS
// Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// BEHAVIOUR RECORD — Incidents & Observations
// ============================================================
export type BehaviourRecordDocument = BehaviourRecord & Document;

@Schema({ timestamps: true, collection: 'behaviour_records' })
export class BehaviourRecord {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;
  @Prop() rollNumber: string;

  @Prop({ required: true }) date: Date;

  @Prop({
    enum: ['positive', 'negative', 'neutral'],
    required: true,
  })
  type: string;

  @Prop({
    enum: [
      // Positive
      'academic_excellence', 'helping_others', 'leadership',
      'good_conduct', 'community_service', 'innovation',
      'sportsmanship', 'attendance_excellence', 'moral_courage',
      // Negative
      'misconduct', 'bullying', 'cheating', 'dishonesty',
      'disrespect', 'property_damage', 'late_coming',
      'uniform_violation', 'phone_misuse', 'absenteeism',
      'fighting', 'harassment', 'vandalism',
      // Neutral
      'counselling_referral', 'parent_meeting', 'warning_issued',
      'behaviour_contract', 'restorative_practice',
    ],
    required: true,
  })
  category: string;

  @Prop({ required: true }) title: string;
  @Prop({ required: true }) description: string;
  @Prop() location: string;
  @Prop() witnesses: string[];

  @Prop({
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  severity: string;

  // Points
  @Prop({ default: 0 }) points: number; // + for positive, - for negative

  // Action taken
  @Prop() actionTaken: string;
  @Prop({
    enum: [
      'verbal_warning', 'written_warning', 'detention',
      'parent_notification', 'suspension', 'counselling',
      'behaviour_contract', 'community_service', 'commendation',
      'merit_award', 'no_action',
    ],
  })
  consequence: string;

  // Follow-up
  @Prop({ default: false }) followUpRequired: boolean;
  @Prop() followUpDate: Date;
  @Prop() followUpNote: string;
  @Prop({ default: false }) resolved: boolean;
  @Prop() resolvedDate: Date;
  @Prop() resolvedNote: string;

  // Parent communication
  @Prop({ default: false }) parentNotified: boolean;
  @Prop() parentNotifiedDate: Date;
  @Prop() parentNotifiedBy: string;
  @Prop() parentResponse: string;

  // Staff
  @Prop({ required: true }) reportedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) reportedById: Types.ObjectId;
  @Prop() verifiedBy: string;
  @Prop({ default: false }) verified: boolean;

  // Attachments
  @Prop({ type: [String], default: [] }) attachments: string[];

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const BehaviourRecordSchema = SchemaFactory.createForClass(BehaviourRecord);
BehaviourRecordSchema.index({ studentId: 1, date: -1 });
BehaviourRecordSchema.index({ schoolSlug: 1, date: -1 });
BehaviourRecordSchema.index({ schoolSlug: 1, type: 1, grade: 1 });
BehaviourRecordSchema.index({ schoolSlug: 1, severity: 1, resolved: 1 });

// ============================================================
// TARBIYAH TRAIT — Islamic Character Assessment
// ============================================================
export type TarbiyahAssessmentDocument = TarbiyahAssessment & Document;

// Tarbiyah Traits (Islamic character pillars)
export const TARBIYAH_TRAITS = [
  { key: 'sidq',       nameEn: 'Truthfulness (Sidq)',       nameAr: 'الصدق',      category: 'character' },
  { key: 'amanah',     nameEn: 'Trustworthiness (Amanah)',  nameAr: 'الأمانة',    category: 'character' },
  { key: 'adab',       nameEn: 'Manners & Respect (Adab)',  nameAr: 'الأدب',      category: 'social' },
  { key: 'ihsan',      nameEn: 'Excellence (Ihsan)',         nameAr: 'الإحسان',   category: 'academic' },
  { key: 'sabr',       nameEn: 'Patience (Sabr)',            nameAr: 'الصبر',      category: 'character' },
  { key: 'tawadu',     nameEn: 'Humility (Tawadu\')',        nameAr: 'التواضع',   category: 'character' },
  { key: 'shukr',      nameEn: 'Gratitude (Shukr)',          nameAr: 'الشكر',      category: 'spiritual' },
  { key: 'ukhuwwah',   nameEn: 'Brotherhood (Ukhuwwah)',     nameAr: 'الأخوة',    category: 'social' },
  { key: 'ijtihad',    nameEn: 'Diligence (Ijtihad)',        nameAr: 'الاجتهاد',  category: 'academic' },
  { key: 'nazafah',    nameEn: 'Cleanliness (Nazafah)',      nameAr: 'النظافة',   category: 'spiritual' },
  { key: 'itqan',      nameEn: 'Precision (Itqan)',          nameAr: 'الإتقان',   category: 'academic' },
  { key: 'tawakkul',   nameEn: 'Trust in Allah (Tawakkul)', nameAr: 'التوكل',    category: 'spiritual' },
];

@Schema({ _id: false })
class TraitScore {
  @Prop({ required: true }) traitKey: string;
  // No hardcoded min/max here anymore - a school's rating scale is now
  // real, configurable data (CharacterProgramSettings), not a fixed 1-5.
  // Real bounds-checking against the school's actual configured scale
  // happens in BehaviourService.createTarbiyahAssessment/update.
  @Prop({ required: true }) score: number;
  @Prop() observation: string;
}
const TraitScoreSchema = SchemaFactory.createForClass(TraitScore);

@Schema({ timestamps: true, collection: 'tarbiyah_assessments' })
export class TarbiyahAssessment {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  @Prop({ required: true }) period: string; // e.g. "Term 1 2025-26", "Monthly 2025-02"
  @Prop({
    enum: ['monthly', 'termly', 'annual'],
    default: 'termly',
  })
  periodType: string;

  @Prop({ required: true }) assessmentDate: Date;

  @Prop({ type: [TraitScoreSchema], default: [] })
  traits: TraitScore[];

  @Prop() overallScore: number;        // Average 1-5
  @Prop() overallPercentage: number;   // converted to %
  @Prop({
    enum: ['excellent', 'good', 'satisfactory', 'needs_improvement', 'critical'],
  })
  overallRating: string;

  @Prop() teacherObservations: string;
  @Prop() areasOfStrength: string[];
  @Prop() areasForImprovement: string[];
  @Prop() recommendedActions: string;

  @Prop({ required: true }) assessedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) assessedById: Types.ObjectId;

  @Prop({ default: false }) parentShared: boolean;
  @Prop() parentSharedDate: Date;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const TarbiyahAssessmentSchema = SchemaFactory.createForClass(TarbiyahAssessment);
TarbiyahAssessmentSchema.index({ studentId: 1, period: 1 }, { unique: true });
TarbiyahAssessmentSchema.index({ schoolSlug: 1, grade: 1, period: 1 });

// ============================================================
// COUNSELLING SESSION
// ============================================================
export type CounsellingSessionDocument = CounsellingSession & Document;

@Schema({ timestamps: true, collection: 'counselling_sessions' })
export class CounsellingSession {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  @Prop({ required: true }) sessionDate: Date;
  @Prop() sessionTime: string;
  @Prop() duration: number; // minutes

  @Prop({
    enum: ['academic', 'behavioural', 'emotional', 'social',
           'family', 'career', 'tarbiyah', 'general'],
    required: true,
  })
  type: string;

  @Prop({
    enum: ['individual', 'group', 'parent', 'family'],
    default: 'individual',
  })
  format: string;

  @Prop({ required: true }) referredBy: string;
  @Prop() referralReason: string;
  @Prop({ type: Types.ObjectId, ref: 'BehaviourRecord' }) relatedIncidentId: Types.ObjectId;

  @Prop({ required: true }) counsellor: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) counsellorId: Types.ObjectId;

  @Prop() sessionNotes: string;         // What was discussed
  @Prop() studentResponse: string;      // How student responded
  @Prop() actionPlan: string;           // What was agreed
  @Prop({ type: [String] }) goals: string[];

  @Prop({
    enum: ['scheduled', 'completed', 'cancelled', 'no_show'],
    default: 'scheduled',
  })
  status: string;

  @Prop({ default: false }) followUpRequired: boolean;
  @Prop() nextSessionDate: Date;
  @Prop() nextSessionFocus: string;

  // Parent involvement
  @Prop({ default: false }) parentInformed: boolean;
  @Prop() parentInformedDate: Date;
  @Prop({ default: false }) parentPresent: boolean;

  @Prop({ default: false }) confidential: boolean;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const CounsellingSessionSchema = SchemaFactory.createForClass(CounsellingSession);
CounsellingSessionSchema.index({ studentId: 1, sessionDate: -1 });
CounsellingSessionSchema.index({ schoolSlug: 1, counsellor: 1, sessionDate: -1 });
CounsellingSessionSchema.index({ schoolSlug: 1, status: 1 });

// ============================================================
// INTERVENTION PLAN
// ============================================================
export type InterventionDocument = Intervention & Document;

@Schema({ _id: true })
class InterventionAction {
  @Prop({ required: true }) action: string;
  @Prop() responsible: string;
  @Prop() dueDate: Date;
  @Prop({
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending',
  })
  status: string;
  @Prop() completionNote: string;
  @Prop() completedAt: Date;
}
const InterventionActionSchema = SchemaFactory.createForClass(InterventionAction);

@Schema({ timestamps: true, collection: 'interventions' })
export class Intervention {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  @Prop({ required: true }) title: string;
  @Prop() description: string;

  @Prop({
    enum: ['behavioural', 'academic', 'emotional', 'social', 'tarbiyah', 'attendance'],
    required: true,
  })
  type: string;

  @Prop({
    enum: ['tier1_universal', 'tier2_targeted', 'tier3_intensive'],
    default: 'tier2_targeted',
  })
  tier: string; // PBIS framework

  @Prop({ required: true }) concern: string;     // What is the concern
  @Prop() rootCause: string;                      // Root cause analysis
  @Prop({ type: [String], default: [] }) goals: string[];
  @Prop({ type: [String], default: [] }) strategies: string[];

  @Prop({ type: [InterventionActionSchema], default: [] })
  actions: InterventionAction[];

  @Prop({ required: true }) startDate: Date;
  @Prop() reviewDate: Date;
  @Prop() endDate: Date;

  @Prop({
    enum: ['active', 'under_review', 'completed', 'discontinued'],
    default: 'active',
  })
  status: string;

  @Prop() outcome: string;
  @Prop({
    enum: ['significant_improvement', 'moderate_improvement',
           'minimal_improvement', 'no_change', 'deteriorated'],
  })
  outcomeRating: string;

  // Team
  @Prop({ required: true }) createdBy: string;
  @Prop({ type: [String], default: [] }) team: string[]; // counsellor, teacher, HOD etc.
  @Prop() parentConsented: boolean;
  @Prop() parentConsentDate: Date;

  // Progress notes
  @Prop({ type: [{ date: Date, note: String, addedBy: String }], default: [] })
  progressNotes: { date: Date; note: string; addedBy: string }[];

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const InterventionSchema = SchemaFactory.createForClass(Intervention);
InterventionSchema.index({ studentId: 1, status: 1 });
InterventionSchema.index({ schoolSlug: 1, status: 1, type: 1 });
InterventionSchema.index({ schoolSlug: 1, reviewDate: 1 });

// ============================================================
// BEHAVIOUR CONTRACT
// ============================================================
export type BehaviourContractDocument = BehaviourContract & Document;

@Schema({ timestamps: true, collection: 'behaviour_contracts' })
export class BehaviourContract {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true }) studentId: Types.ObjectId;
  @Prop({ required: true }) studentName: string;
  @Prop({ required: true }) grade: string;
  @Prop() section: string;

  @Prop({ required: true }) title: string;
  @Prop({ required: true }) concerns: string;
  @Prop({ type: [String], default: [] }) expectedBehaviours: string[];
  @Prop({ type: [String], default: [] }) consequences: string[];
  @Prop({ type: [String], default: [] }) supports: string[];

  @Prop({ required: true }) startDate: Date;
  @Prop({ required: true }) reviewDate: Date;
  @Prop() endDate: Date;

  @Prop({ default: false }) studentSigned: boolean;
  @Prop() studentSignedDate: Date;
  @Prop({ default: false }) parentSigned: boolean;
  @Prop() parentSignedDate: Date;
  @Prop({ default: false }) teacherSigned: boolean;
  @Prop() teacherSignedDate: Date;

  @Prop({
    enum: ['draft', 'active', 'completed', 'breached', 'expired'],
    default: 'draft',
  })
  status: string;

  @Prop() outcome: string;
  @Prop() createdBy: string;

  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const BehaviourContractSchema = SchemaFactory.createForClass(BehaviourContract);
BehaviourContractSchema.index({ studentId: 1, status: 1 });
