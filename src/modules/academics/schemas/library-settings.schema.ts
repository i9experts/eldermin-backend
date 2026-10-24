import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type LibrarySettingsDocument = LibrarySettings & Document;

// One named physical area of the library (e.g. "Non-fiction", "Islamic
// Books", "Early Years") - the top level of the Zone -> Bookcase/Bay ->
// Shelf hierarchy a book's zoneName/bay/shelfRange fields point into (see
// book.schema.ts). Kept as a simple settings sub-document rather than its
// own collection: a school defines these once, rarely edits them, and
// already has a per-tenant settings document with working get/update
// endpoints to reuse.
@Schema({ _id: false })
export class LibraryZoneDef {
  @Prop({ required: true }) name: string;
  @Prop() description: string;
  // null = shared across all campuses; set to scope a zone to one campus's
  // physical library on a multi-campus school.
  @Prop({ type: String, default: null }) campusId: string | null;
}
export const LibraryZoneDefSchema = SchemaFactory.createForClass(LibraryZoneDef);

// Per-school configurable library/circulation policy - replaces the
// hardcoded `overdueDays * 5` fine formula and the unlimited-checkout/
// unlimited-renewal defaults the first cut shipped with. One document per
// tenant, same "return defaults on read, only persist on explicit save"
// pattern as AttendanceComplianceService.getSettings.
@Schema({ timestamps: true, collection: 'libraryCatalogSettings' })
export class LibrarySettings {
  @Prop({ required: true, unique: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ default: 5 }) finePerDay: number;
  @Prop({ default: 0 }) gracePeriodDays: number;
  // Sentinel: 0 means "no cap" - a positive value clamps the computed
  // fine to that ceiling. Matches this codebase's other 0-means-unlimited
  // policy settings (e.g. DefaulterPolicy-style caps).
  @Prop({ default: 0 }) maxFineCap: number;
  @Prop({ default: 2 }) maxBooksStudent: number;
  @Prop({ default: 5 }) maxBooksStaff: number;
  @Prop({ default: 1 }) maxRenewals: number;
  @Prop({ default: 14 }) renewalDays: number;
  @Prop({ default: 14 }) defaultLoanDays: number;
  @Prop({ type: [LibraryZoneDefSchema], default: [] }) zones: LibraryZoneDef[];
}
export const LibrarySettingsSchema = SchemaFactory.createForClass(LibrarySettings);
