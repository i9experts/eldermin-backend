import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubjectCategoryDocument = SubjectCategory & Document;

// School-configurable replacement for the old hardcoded SUBJECT_CATEGORIES
// list. Same shape/convention as Designation (hr/schemas/designation.schema.ts):
// {tenantId, name, code, isActive} with a unique (tenantId, code) index, no
// campus-scoping - this is catalog data shared across a school's campuses,
// same as Designation. institutionId is carried (subjects themselves are
// institution-scoped) but not part of the uniqueness key, matching how
// Subject.code is unique per-tenant, not per-institution.
@Schema({ timestamps: true, collection: 'subject_categories' })
export class SubjectCategory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  // Optional badge color for the Subjects list UI (e.g. '#3B82F6'). Not
  // required - purely cosmetic, left blank falls back to a default swatch.
  @Prop()
  color: string;

  // Optional display/sort order for the category dropdown and any
  // "manage categories" list. Left undefined falls back to name-sort.
  @Prop({ default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const SubjectCategorySchema = SchemaFactory.createForClass(SubjectCategory);
SubjectCategorySchema.index({ tenantId: 1, code: 1 }, { unique: true });
