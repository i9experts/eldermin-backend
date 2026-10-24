import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type BookDocument = Book & Document;

// One physical copy of a title - the Koha "item" to Book's "biblio".
// Each copy carries its own accession number/barcode so it can be
// individually tracked, issued, and printed as a label, independent of
// its siblings under the same title.
@Schema({ _id: false })
export class BookCopy {
  @Prop({ required: true }) accessionNo: string;
  @Prop({ required: true }) barcode: string;
  @Prop({ enum: ['available','issued','reserved','damaged','lost','deaccessioned'], default: 'available' }) status: string;
  @Prop({ default: 'good' }) condition: string;
  @Prop() shelfNo: string;
  @Prop({ default: () => new Date() }) addedDate: Date;
}
export const BookCopySchema = SchemaFactory.createForClass(BookCopy);

@Schema({ timestamps: true, collection: 'libraryBooks' })
export class Book {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  // Which campus's physical library this copy belongs to - null means
  // school-wide/unscoped (e.g. a single-campus school, or a shared
  // digital catalog not yet split per campus).
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop({ required: true }) accessionNo: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) author: string;
  @Prop() isbn: string;
  // ISSN is a serial/periodical identifier, distinct from ISBN - kept as
  // its own field rather than overloading isbn for category:'periodical'.
  @Prop() issn: string;
  @Prop() publisher: string;
  @Prop() publishYear: number;
  @Prop() edition: string;
  // Classification code (Dewey Decimal or Library of Congress) used to
  // shelve and browse the collection - distinct from shelfNo/location,
  // which are just where it physically sits, not what it's classified as.
  @Prop() callNumber: string;
  @Prop({ enum: ['fiction','non_fiction','textbook','reference','periodical','islamic','science','biography','children','other'], default: 'non_fiction' }) category: string;
  @Prop({ type: [String], default: [] }) subjects: string[];
  @Prop({ type: [String], default: [] }) gradeLevels: string[];
  @Prop() language: string;
  @Prop() location: string;
  @Prop() shelfNo: string;
  // Structured Zone -> Bookcase/Bay -> Shelf hierarchy, modelled on a
  // physical library shelf-labelling scheme. Additive to location/shelfNo
  // above (kept for backward compatibility with existing free-text data) -
  // the catalogue UI prefers these when present and falls back to
  // location/shelfNo otherwise. zoneName is free text but normally picked
  // from LibrarySettings.zones once a school has configured its zones.
  @Prop() zoneName: string;
  @Prop() bay: string;
  @Prop() shelfRange: string;
  // Parallel-language title, shown on bilingual shelf signage/labels -
  // distinct from the free-text `language` tag above, which just records
  // which language the book itself is written in.
  @Prop() urduTitle: string;
  // Drives the "Reference / Teachers" age band, which (per the guide) isn't
  // a class range - it applies to books meant for staff/reference use
  // regardless of gradeLevels.
  @Prop({ default: false }) isReferenceOnly: boolean;
  // Flags the Mushaf (the Qur'an itself) among category:'islamic' books, so
  // it can be surfaced for the guide's "keep separate on the top shelf,
  // nothing placed above or on it" handling - a data flag only, no
  // physical automation.
  @Prop({ default: false }) isMushaf: boolean;
  // One of ISLAMIC_SUBSCHEME's codes (library-age-band.util.ts), e.g.
  // "297.63" for Seerah - a proposed local scheme the librarian approves,
  // not a verified published Dewey edition.
  @Prop() islamicSubCode: string;
  // One of PICTURE_CODES (library-age-band.util.ts) - used instead of a
  // call number for Early-Years-band books, which are shelved into
  // picture-matched bins rather than filed by classification.
  @Prop() pictureCode: string;
  // Per-copy records (accession no, barcode, individual status). Lazily
  // backfilled from the legacy aggregate counters below for books that
  // existed before this field - see AcademicsService.ensureCopies.
  @Prop({ type: [BookCopySchema], default: [] }) copies: BookCopy[];
  @Prop({ default: 1 }) totalCopies: number;
  @Prop({ default: 1 }) availableCopies: number;
  @Prop({ default: 0 }) issuedCopies: number;
  @Prop({ default: 0 }) damagedCopies: number;
  @Prop({ default: 0 }) lostCopies: number;
  @Prop({ default: 0 }) reservedCopies: number;
  @Prop({ default: 0 }) purchasePrice: number;
  @Prop() purchaseDate: Date;
  @Prop({ enum: ['available','fully_issued','reserved','damaged','lost','deaccessioned'], default: 'available' }) status: string;
  @Prop() coverImageUrl: string;
  @Prop() description: string;
  @Prop({ default: 0 }) totalIssues: number;
  @Prop({ default: 0 }) rating: number;
}
export const BookSchema = SchemaFactory.createForClass(Book);
BookSchema.index({ tenantId: 1, accessionNo: 1 }, { unique: true });
BookSchema.index({ tenantId: 1, isbn: 1 }, { sparse: true });
BookSchema.index({ tenantId: 1, category: 1, status: 1 });
BookSchema.index({ title: 'text', author: 'text', isbn: 'text' }, { name: 'idx_book_text' });
