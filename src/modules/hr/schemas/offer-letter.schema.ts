import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OfferLetterDocument = OfferLetter & Document;

// A real, distinct employment document - sent BEFORE someone is a Staff
// member at all, unlike StaffContract which assumes a real staffId
// already exists. jobApplicationId is genuinely optional: a candidate
// who came through the formal recruitment pipeline has one, but a
// direct hire (no job posting, no formal application) never will, and
// that's a legitimate, real scenario, not a data gap.
@Schema({ timestamps: true, collection: 'offerLetters' })
export class OfferLetter {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Institution' }) institutionId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;

  @Prop({ type: Types.ObjectId, ref: 'JobApplication', default: null }) jobApplicationId: Types.ObjectId | null;

  @Prop() offerNo: string;
  @Prop({ required: true }) candidateName: string;
  @Prop({ required: true }) candidateEmail: string;
  @Prop() candidatePhone: string;
  @Prop({ required: true }) designation: string;
  @Prop() department: string;
  @Prop({ required: true }) proposedSalary: number;
  @Prop({ default: 'PKR' }) currency: string;
  @Prop({ required: true }) proposedJoiningDate: Date;
  @Prop({ required: true }) offerValidUntil: Date;
  @Prop() probationPeriodMonths: number;
  @Prop() reportingTo: string;
  @Prop() additionalTerms: string;

  @Prop({ enum: ['draft','sent','accepted','declined','expired','withdrawn'], default: 'draft' }) status: string;
  @Prop() respondedAt: Date;
  @Prop() declineReason: string;

  @Prop() pdfS3Key: string; // the actual generated letter, not a manually-uploaded file
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}

export const OfferLetterSchema = SchemaFactory.createForClass(OfferLetter);
OfferLetterSchema.index({ schoolSlug: 1, offerNo: 1 }, { unique: true, sparse: true });
OfferLetterSchema.index({ schoolSlug: 1, status: 1 });
