import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type LibrarySettingsDocument = LibrarySettings & Document;

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
}
export const LibrarySettingsSchema = SchemaFactory.createForClass(LibrarySettings);
