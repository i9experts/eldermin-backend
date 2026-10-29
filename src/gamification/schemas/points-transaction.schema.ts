import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// POINTS TRANSACTION — LMS Phase 5 (gamification)
// Append-only ledger, one row per awarded-points event - never updated
// in place, mirroring the audit-trail reasoning of Finance's
// JournalEntry (src/finance/schemas/ledger.schema.ts): a student's point
// history should be reconstructible from this collection alone.
// sourceType/sourceId is the same dedup/traceability pair
// IssuedCertificate already uses (see its own partial unique index) -
// paired with the identical index shape below, re-awarding the same
// event (e.g. completing the same lesson twice) is a no-op, not a
// duplicate credit.
// ============================================================
export type PointsTransactionDocument = PointsTransaction & Document;

export const POINTS_SOURCE_TYPES = [
  'lesson_completion', 'course_completion', 'quiz_attempt', 'forum_post', 'manual_award',
] as const;
export type PointsSourceType = typeof POINTS_SOURCE_TYPES[number];

@Schema({ timestamps: true, collection: 'points_transactions' })
export class PointsTransaction {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  // schoolSlug, not tenantId, is the scoping key here - Student (and
  // Assessments, where quiz-completion points originate) only carries
  // schoolSlug, not tenantId (that's a Syllabus/Teaching/Organization-
  // module concept). tenantId is stored when the awarding call site
  // happens to have it (lesson/forum events do), purely for cross-
  // reference - never required to read this collection back.
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ type: Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;

  // Always positive in practice (no points-deduction event exists yet) -
  // signed anyway so a future "revoke" need never requires a schema
  // migration, same reasoning as BehaviourRecord.points being signed.
  @Prop({ required: true }) delta: number;
  @Prop({ required: true }) reason: string;

  @Prop({ required: true, enum: POINTS_SOURCE_TYPES }) sourceType: string;
  @Prop({ required: true }) sourceId: string;
  @Prop() awardedBy: string;
}

export const PointsTransactionSchema = SchemaFactory.createForClass(PointsTransaction);
PointsTransactionSchema.index({ studentId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
PointsTransactionSchema.index({ schoolSlug: 1, studentId: 1, createdAt: -1 });
