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
  @Prop({
    type: { text: String, respondedAt: Date, respondedBy: String },
    default: null,
  })
  familyResponse: { text: string; respondedAt: Date; respondedBy: string } | null;
}

export const ECEPortfolioEntrySchema = SchemaFactory.createForClass(ECEPortfolioEntry);
ECEPortfolioEntrySchema.index({ schoolSlug: 1, studentId: 1, createdAt: -1 });
