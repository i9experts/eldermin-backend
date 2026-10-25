// ============================================================
// LEAD CAPTURE LINK SCHEMA — Admission Lifecycle
// Eldermin ERP | NestJS + MongoDB
//
// A shareable, unauthenticated public form link a school admin
// generates and posts on social media / their website. Parent
// submissions against a valid, active token create a real Lead
// (source: 'website') scoped to the link's own schoolSlug — the
// token is the ONLY thing identifying the tenant on a public
// request, so it must never be guessable and must always be
// re-validated server-side before a Lead is created.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeadCaptureLinkDocument = LeadCaptureLink & Document;

@Schema({ timestamps: true, collection: 'admission_lead_capture_links' })
export class LeadCaptureLink {
  @Prop({ required: true, index: true })
  schoolSlug: string;

  @Prop({ required: true, unique: true, index: true })
  token: string;

  // Optional campus-specific link (e.g. a school with multiple campuses
  // wants a separate link per campus's own social media page). Null means
  // the link applies school-wide and campusPreference is left to the
  // applicant to type/select on the form.
  @Prop({ type: String, default: null })
  campusId: string | null;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ default: 0 })
  submissionCount: number;

  @Prop()
  lastSubmittedAt: Date;
}

export const LeadCaptureLinkSchema = SchemaFactory.createForClass(LeadCaptureLink);
LeadCaptureLinkSchema.index({ schoolSlug: 1, isActive: 1 });
