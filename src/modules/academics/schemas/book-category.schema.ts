import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BookCategoryDocument = BookCategory & Document;

// School-configurable library classification catalog, seeded from the
// standard Dewey Decimal Classification (the 10 main classes and their 10
// subdivisions each, 100 entries) via seedDefaultBookCategories - same
// {tenantId, name, code, color, order, isActive} shape and unique
// (tenantId, code) index as SubjectCategory, no campus-scoping (shared
// catalog data across a school's campuses, same as SubjectCategory).
// `code` is the Dewey number itself (e.g. '500', '510') rather than a
// slug, so it sorts and displays exactly as librarians already expect.
@Schema({ timestamps: true, collection: 'library_book_categories' })
export class BookCategory {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Institution' })
  institutionId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  // Optional badge color for the catalog list UI.
  @Prop()
  color: string;

  // Display/sort order - defaults to the Dewey code's own numeric order.
  @Prop({ default: 0 })
  order: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const BookCategorySchema = SchemaFactory.createForClass(BookCategory);
BookCategorySchema.index({ tenantId: 1, code: 1 }, { unique: true });
