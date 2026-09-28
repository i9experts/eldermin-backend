import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document as MongoDoc, Types } from 'mongoose';

// ============================================================
// SCHEMA: SIGNATURE REQUEST
// A real e-signature workflow (the "E-Signatures" tab was previously a
// pure UI mockup - no backend, no state, the Send button had no onClick
// at all). One request targets an existing DocumentRecord (or a freshly
// attached file) and carries one or more recipients, each with their own
// unique, unguessable token used both for the emailed public sign link
// and for the in-app "sign as me" flow when the recipient happens to be
// a logged-in staff member.
// ============================================================
export type SignatureRequestDocument = SignatureRequest & MongoDoc;

@Schema({ _id: true })
export class SignatureRecipient {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) email: string;
  // Only meaningful when the parent request's signingOrder is
  // 'sequential' - recipients must sign in ascending order. Ignored
  // entirely for 'any' order.
  @Prop({ default: 0 }) order: number;
  @Prop({ enum: ['pending', 'viewed', 'signed', 'declined'], default: 'pending' }) status: string;
  // Long random token, unique across the whole collection - this IS the
  // access credential for the public (unauthenticated) sign link, so it
  // has to be unguessable, not just unique.
  @Prop({ required: true, index: true }) token: string;
  @Prop() viewedAt: Date;
  @Prop() signedAt: Date;
  @Prop() declinedAt: Date;
  @Prop() declineReason?: string;
  @Prop() typedName?: string;
  @Prop() designation?: string;
  @Prop() signatureImage?: string; // data: URL (PNG) from the sign canvas, or a typed-signature render
  @Prop() ipAddress?: string;
}
export const SignatureRecipientSchema = SchemaFactory.createForClass(SignatureRecipient);

@Schema({ timestamps: true, collection: 'signature_requests' })
export class SignatureRequest {
  // Either references an existing DocumentRecord from the library, or is
  // null when the sender attached a fresh one-off file instead - either
  // way fileUrl/documentName are always set so the sign page never needs
  // to resolve a document separately.
  @Prop({ type: Types.ObjectId, ref: 'DocumentRecord', default: null }) documentId: Types.ObjectId | null;
  @Prop({ required: true }) documentName: string;
  @Prop({ required: true }) fileUrl: string;
  @Prop() fileName: string;
  @Prop({ type: [SignatureRecipientSchema], default: [] }) recipients: SignatureRecipient[];
  @Prop({ enum: ['any', 'sequential'], default: 'any' }) signingOrder: string;
  @Prop() deadline: Date;
  @Prop() message: string;
  // 'declined' is terminal the moment ANY recipient declines - the
  // request doesn't wait for the rest to finish signing first.
  @Prop({ enum: ['pending', 'completed', 'declined', 'cancelled'], default: 'pending' }) status: string;
  @Prop({ required: true }) createdBy: string;
  @Prop() createdByEmail: string;
  @Prop() completedAt: Date;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const SignatureRequestSchema = SchemaFactory.createForClass(SignatureRequest);
SignatureRequestSchema.index({ schoolSlug: 1, status: 1, createdAt: -1 });
SignatureRequestSchema.index({ 'recipients.email': 1 });
SignatureRequestSchema.index({ 'recipients.token': 1 });
