// ============================================================
// TAX ENGINE — Eldermin ERP | NestJS + MongoDB
// Phase 3 of the Odoo-standard finance rebuild: sales/purchase/
// withholding tax templates, item-level tax defaults, a lightweight
// rule-override layer, and withholding tax categories (Pakistan's
// withholding-at-source regime). Every tax template posts to its own
// COA account so tax collected/paid flows through the same ledger
// instead of being a side calculation. See
// claude/finance-module-odoo-standard-build-plan.md.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ============================================================
// TAX TEMPLATE — models Odoo's "Sales Taxes and Charges Template",
// "Purchase Taxes and Charges Template" and "Tax Withholding Category"
// as one shape (name/rate/account), differentiated by `type`, since all
// three are really just "a rate that posts to a GL account."
// ============================================================
export type TaxTemplateDocument = TaxTemplate & Document;

@Schema({ timestamps: true, collection: 'tax_templates' })
export class TaxTemplate {
  @Prop({ required: true }) name: string; // e.g. "GST 17%", "Services Withholding Tax"
  @Prop({ enum: ['sales', 'purchase', 'withholding'], required: true }) type: string;
  @Prop({ required: true }) rate: number; // percentage (e.g. 17) or flat amount when computationMethod === 'fixed'
  @Prop({ enum: ['percentage', 'fixed'], default: 'percentage' }) computationMethod: string;
  @Prop({ required: true }) accountCode: string; // COA account this tax posts to (Tax Payable / Input Tax Receivable / Withholding Tax Payable)
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const TaxTemplateSchema = SchemaFactory.createForClass(TaxTemplate);
TaxTemplateSchema.index({ schoolSlug: 1, name: 1 }, { unique: true });
TaxTemplateSchema.index({ schoolSlug: 1, type: 1 });

// ============================================================
// ITEM TAX TEMPLATE — maps a "sellable item" (a fee type on the sales
// side — tuition/admission/transport — or an expense/account-code on
// the purchase side) to the default TaxTemplate that should auto-apply,
// so invoice/bill creation doesn't need a manual tax lookup every time.
// ============================================================
export type ItemTaxTemplateDocument = ItemTaxTemplate & Document;

@Schema({ timestamps: true, collection: 'item_tax_templates' })
export class ItemTaxTemplate {
  @Prop({ required: true }) itemType: string; // free string — e.g. "tuition", "admission", or an expense account code
  @Prop({ enum: ['sales', 'purchase'], required: true }) direction: string;
  @Prop({ type: Types.ObjectId, ref: 'TaxTemplate', required: true }) taxTemplateId: Types.ObjectId;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const ItemTaxTemplateSchema = SchemaFactory.createForClass(ItemTaxTemplate);
ItemTaxTemplateSchema.index({ schoolSlug: 1, direction: 1, itemType: 1 });

// ============================================================
// TAX RULE — a simple, single-condition override layer checked in
// priority order before falling back to the ItemTaxTemplate default.
// Deliberately NOT a full rule-engine DSL — one field/operator/value
// per rule is enough for "this campus is tax-exempt" style overrides.
// ============================================================
export type TaxRuleDocument = TaxRule & Document;

@Schema({ _id: false })
class TaxRuleCondition {
  @Prop({ required: true }) field: string; // e.g. 'grade' | 'campus' | 'vendorId'
  @Prop({ enum: ['eq'], default: 'eq' }) operator: string;
  @Prop({ required: true }) value: string;
}
const TaxRuleConditionSchema = SchemaFactory.createForClass(TaxRuleCondition);

@Schema({ timestamps: true, collection: 'tax_rules' })
export class TaxRule {
  @Prop({ type: Types.ObjectId, ref: 'TaxTemplate', required: true }) taxTemplateId: Types.ObjectId;
  @Prop({ type: TaxRuleConditionSchema, required: true }) condition: TaxRuleCondition;
  @Prop({ default: 10 }) priority: number; // lower = evaluated first
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const TaxRuleSchema = SchemaFactory.createForClass(TaxRule);
TaxRuleSchema.index({ schoolSlug: 1, priority: 1 });

// ============================================================
// WITHHOLDING TAX CATEGORY — kept as its own schema (rather than folded
// into TaxTemplate) because a withholding category attaches to a
// vendor/staff record, not a transaction line — e.g. "this vendor is
// subject to 4% withholding on every bill." See Vendor.withholdingCategoryId.
// ============================================================
export type WithholdingTaxCategoryDocument = WithholdingTaxCategory & Document;

@Schema({ timestamps: true, collection: 'withholding_tax_categories' })
export class WithholdingTaxCategory {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) rate: number; // percentage
  @Prop({ required: true }) accountCode: string; // Withholding Tax Payable
  @Prop({ enum: ['vendor', 'staff', 'other'], default: 'vendor' }) appliesTo: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}
export const WithholdingTaxCategorySchema = SchemaFactory.createForClass(WithholdingTaxCategory);
WithholdingTaxCategorySchema.index({ schoolSlug: 1, name: 1 });
