import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type BookIssueDocument = BookIssue & Document;

@Schema({ timestamps: true, collection: 'libraryIssues' })
export class BookIssue {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Book' }) bookId: Types.ObjectId;
  // Denormalized from the book's own campus (which library copy this is)
  // at issue time - a book physically at one campus's library shouldn't
  // read as available/checked-out from another campus's view.
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop() bookTitle: string;
  @Prop() accessionNo: string;
  @Prop({ enum: ['student','staff'], required: true }) borrowerType: string;
  @Prop({ type: Types.ObjectId, refPath: 'borrowerType' }) borrowerId: Types.ObjectId;
  @Prop() borrowerName: string;
  @Prop() borrowerAdmissionNo: string;
  @Prop() borrowerClass: string;
  @Prop({ required: true }) issueDate: Date;
  @Prop({ required: true }) dueDate: Date;
  @Prop() returnDate: Date;
  @Prop({ enum: ['issued','returned','overdue','lost','damaged'], default: 'issued' }) status: string;
  @Prop({ default: 0 }) fineAmount: number;
  @Prop({ default: false }) finePaid: boolean;
  @Prop() condition: string;
  @Prop() notes: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) issuedBy: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User' }) returnedTo: Types.ObjectId;
}
export const BookIssueSchema = SchemaFactory.createForClass(BookIssue);
BookIssueSchema.index({ tenantId: 1, bookId: 1, status: 1 });
BookIssueSchema.index({ tenantId: 1, borrowerId: 1, status: 1 });
BookIssueSchema.index({ tenantId: 1, dueDate: 1, status: 1 });
BookIssueSchema.index({ tenantId: 1, returnDate: 1 });
