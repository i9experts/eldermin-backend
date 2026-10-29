import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// AWARDED BADGE — LMS Phase 5 (gamification)
// The "earned instance" half of the badge-catalog/awarded-instance split
// - mirrors CertificateTemplate (definition) + IssuedCertificate
// (earned instance), except the "definition" side here is the static
// BADGE_CATALOG in badge-catalog.ts rather than a per-school DB
// collection (see that file's header for why). `badgeKey` looks up
// label/description/icon from the catalog at read time - nothing about
// a badge's display is duplicated into this row, so updating the
// catalog's wording retroactively updates every already-earned badge's
// display too.
// ============================================================
export type AwardedBadgeDocument = AwardedBadge & Document;

@Schema({ timestamps: true, collection: 'awarded_badges' })
export class AwardedBadge {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student' }) studentId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ type: Types.ObjectId, ref: 'Tenant' }) tenantId?: Types.ObjectId;
  @Prop({ required: true }) badgeKey: string;
  @Prop() sourceType?: string;
  @Prop() sourceId?: string;
}

export const AwardedBadgeSchema = SchemaFactory.createForClass(AwardedBadge);
// A given badge key is earned once per student - re-triggering the same
// condition (e.g. completing a second course) is a no-op for
// 'course_complete', which is a "have you ever" badge, not a per-course one.
AwardedBadgeSchema.index({ studentId: 1, badgeKey: 1 }, { unique: true });
