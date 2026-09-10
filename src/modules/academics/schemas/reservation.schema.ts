import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
export type ReservationDocument = Reservation & Document;

// A hold queue entry against a fully-issued book. Denormalizes the same
// borrower fields as BookIssue (resolved server-side from the real
// Student/Staff record, never trusted from the client) and the book's
// title, for the same "list this without a join" reasons BookIssue
// denormalizes bookTitle/accessionNo.
@Schema({ timestamps: true, collection: 'libraryReservations' })
export class Reservation {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  // Inherited from the book at reservation time, same rationale as
  // BookIssue.campusId - a book physically at one campus's library
  // shouldn't read as reserved from another campus's view.
  @Prop({ type: Types.ObjectId, ref: 'Campus', default: null }) campusId: Types.ObjectId | null;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Book' }) bookId: Types.ObjectId;
  @Prop() bookTitle: string;
  @Prop({ enum: ['student','staff'], required: true }) borrowerType: string;
  @Prop({ type: Types.ObjectId, refPath: 'borrowerType' }) borrowerId: Types.ObjectId;
  @Prop() borrowerName: string;
  @Prop() borrowerAdmissionNo: string;
  @Prop() borrowerClass: string;
  @Prop({ required: true }) reservedDate: Date;
  @Prop({ enum: ['waiting','ready','fulfilled','cancelled','expired'], default: 'waiting' }) status: string;
  @Prop() notes: string;
}
export const ReservationSchema = SchemaFactory.createForClass(Reservation);
ReservationSchema.index({ tenantId: 1, bookId: 1, status: 1 });
ReservationSchema.index({ tenantId: 1, borrowerId: 1, status: 1 });
