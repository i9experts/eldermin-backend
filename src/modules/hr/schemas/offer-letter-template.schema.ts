import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OfferLetterTemplateDocument = OfferLetterTemplate & Document;

// Offer letter WORDING template - the free-text body (with {{variable}}
// placeholders, e.g. {{candidateName}}, {{designation}}, {{proposedSalary}})
// rendered into a generated offer letter's PDF. Mirrors ContractTemplate
// (see contract-template.schema.ts) exactly, and is deliberately separate
// from a ReportTemplate (report-templates module), which controls only the
// printed PDF's letterhead/layout/branding, not its wording. Additive: the
// legacy single free-text HiringSettings.offerLetterTemplate field is left
// untouched and still used as a fallback when no OfferLetterTemplate is
// selected on an offer letter.
@Schema({ timestamps: true, collection: 'hrOfferLetterTemplates' })
export class OfferLetterTemplate {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Tenant' }) tenantId: Types.ObjectId;
  @Prop({ index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) body: string;
  @Prop({ default: false }) isDefault: boolean;
  @Prop({ type: Types.ObjectId, ref: 'User' }) createdBy: Types.ObjectId;
}
export const OfferLetterTemplateSchema = SchemaFactory.createForClass(OfferLetterTemplate);
OfferLetterTemplateSchema.index({ tenantId: 1, name: 1 });
