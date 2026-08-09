import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ECEEvidenceItem, ECEEvidenceItemSchema } from './observation.schema';

export type ECEPortfolioEntryDocument = ECEPortfolioEntry & Document;

@Schema({ timestamps: true, collection: 'ece_portfolio_entries' })
export class ECEPortfolioEntry {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true, type: Types.ObjectId, ref: 'Student', index: true }) studentId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'ECEObservation' }) sourceObservationId: Types.ObjectId; // most entries originate from an observation
  @Prop({ required: true }) title: string;
  @Prop({ required: true }) narrative: string;
  @Prop({ type: [ECEEvidenceItemSchema], default: [] }) evidence: ECEEvidenceItem[];
  @Prop({ default: false }) isVisibleToFamily: boolean;
  // "Try This at Home" - a concrete, actionable suggestion for the family,
  // sent in the same notification as the entry itself rather than as a
  // separate system, since it's fundamentally the same share-and-notify
  // flow with one extra piece of content.
  @Prop() tryThisAtHome: string;
  @Prop({
    type: { text: String, respondedAt: Date, respondedBy: String },
    default: null,
  })
  familyResponse: { text: string; respondedAt: Date; respondedBy: string } | null;
}

export const ECEPortfolioEntrySchema = SchemaFactory.createForClass(ECEPortfolioEntry);
ECEPortfolioEntrySchema.index({ schoolSlug: 1, studentId: 1, createdAt: -1 });
