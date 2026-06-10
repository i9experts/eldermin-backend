import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type BookDocument = Book & Document;

@Schema({ timestamps: true, collection: 'libraryBooks' })
export class Book {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true }) accessionNo: string;
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) author: string;
  @Prop() isbn: string;
  @Prop() publisher: string;
  @Prop() publishYear: number;
  @Prop() edition: string;
  @Prop({ enum: ['fiction','non_fiction','textbook','reference','periodical','islamic','science','biography','children','other'], default: 'non_fiction' }) category: string;
  @Prop({ type: [String], default: [] }) subjects: string[];
  @Prop({ type: [String], default: [] }) gradeLevels: string[];
  @Prop() language: string;
  @Prop() location: string;
  @Prop() shelfNo: string;
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
