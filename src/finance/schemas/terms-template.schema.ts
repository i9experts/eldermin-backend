// ============================================================
// TERMS & CONDITIONS TEMPLATES — Eldermin ERP | NestJS + MongoDB
// Phase 8 of the Odoo-standard finance rebuild: reusable T&C text blocks
// attachable to invoices/fee structures/vendor bills. Purely additive —
// Invoice.termsTemplateId and FeeStructure.termsTemplateId (see
// finance.schema.ts) are optional refs, so no existing document-creation
// flow is required to set one and behavior for schools that never touch
// this feature is unchanged.
// See claude/finance-module-odoo-standard-build-plan.md.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TermsTemplateDocument = TermsTemplate & Document;

@Schema({ timestamps: true, collection: 'terms_templates' })
export class TermsTemplate {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) content: string; // markdown/rich text
  @Prop({ enum: ['invoice', 'fee_structure', 'vendor_bill', 'general'], default: 'general' })
  appliesTo: string;
  @Prop({ default: false }) isDefault: boolean;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const TermsTemplateSchema = SchemaFactory.createForClass(TermsTemplate);
TermsTemplateSchema.index({ schoolSlug: 1, appliesTo: 1 });
