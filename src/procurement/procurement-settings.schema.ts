// ============================================================
// PROCUREMENT MASTER-DATA SCHEMAS — school-configurable replacements
// for the hardcoded VENDOR_CATS / ITEM_CATS / ASSET_CATS / UOM_OPTIONS /
// PAYMENT_TERMS_LIST / DEPRECIATION_METHODS arrays that used to live in
// the frontend's procurement/types.ts, same anti-pattern (and same fix)
// as Subject Category in academics (see subject-category.schema.ts +
// academics.service.ts's getSubjectCategories/.../seedDefaultSubjectCategories).
//
// Unlike Subject Category (tenantId/institutionId ObjectId tenancy), every
// other schema in this module keys off a plain `schoolSlug: string`
// (see procurement.schema.ts — Vendor, PurchaseRequest, etc.), so these
// six collections follow that convention instead: no tenantId/institutionId
// here, `schoolSlug` + unique-per-school `code` is the tenancy/identity key.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Shared shape: { schoolSlug, name, code, isActive, order }, unique
// (schoolSlug, code) index — same convention on all six collections below.
function applyCommonIndex(schema: any) {
  schema.index({ schoolSlug: 1, code: 1 }, { unique: true });
  schema.index({ schoolSlug: 1, isActive: 1 });
}

// ============================================================
// VENDOR CATEGORY — replaces VENDOR_CATS. Vendor.category is a plain
// string (not a code ref, see procurement.schema.ts), so the delete guard
// matches by the *name* currently stored on Vendor.category, same
// "match by the value currently stored" approach as
// subject-category-reference.util.ts.
// ============================================================
export type VendorCategoryDocument = VendorCategory & Document;

@Schema({ timestamps: true, collection: 'vendor_categories' })
export class VendorCategory {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) order: number;
}
export const VendorCategorySchema = SchemaFactory.createForClass(VendorCategory);
applyCommonIndex(VendorCategorySchema);

// ============================================================
// ITEM CATEGORY — replaces ITEM_CATS. Delete guard matches by name against
// InventoryItem.category (also a plain string).
// ============================================================
export type ItemCategoryDocument = ItemCategory & Document;

@Schema({ timestamps: true, collection: 'item_categories' })
export class ItemCategory {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) order: number;
}
export const ItemCategorySchema = SchemaFactory.createForClass(ItemCategory);
applyCommonIndex(ItemCategorySchema);

// ============================================================
// ASSET CATEGORY — replaces ASSET_CATS. Delete guard matches by name
// against Asset.category (see asset.schema.ts, also a plain string) —
// same "match by the value currently stored" approach as VendorCategory/
// ItemCategory above.
// ============================================================
export type AssetCategoryDocument = AssetCategory & Document;

@Schema({ timestamps: true, collection: 'asset_categories' })
export class AssetCategory {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) order: number;
}
export const AssetCategorySchema = SchemaFactory.createForClass(AssetCategory);
applyCommonIndex(AssetCategorySchema);

// ============================================================
// UNIT OF MEASURE — replaces UOM_OPTIONS. Used inline on Vendor/
// InventoryItem/PR-line-item state as a free string (not a formal FK
// anywhere), so no in-use delete guard is feasible — deactivate
// (isActive: false) is offered as the safe alternative instead.
// ============================================================
export type UnitOfMeasureDocument = UnitOfMeasure & Document;

@Schema({ timestamps: true, collection: 'units_of_measure' })
export class UnitOfMeasure {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string;
  @Prop() shortCode: string;         // e.g. "Pcs", "Ltr"
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) order: number;
}
export const UnitOfMeasureSchema = SchemaFactory.createForClass(UnitOfMeasure);
applyCommonIndex(UnitOfMeasureSchema);

// ============================================================
// PAYMENT TERM — replaces PAYMENT_TERMS_LIST. Used inline on
// Vendor.paymentTerms as a free string; no in-use delete guard, same
// reasoning as UnitOfMeasure.
// ============================================================
export type PaymentTermDocument = PaymentTerm & Document;

@Schema({ timestamps: true, collection: 'payment_terms' })
export class PaymentTerm {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) order: number;
}
export const PaymentTermSchema = SchemaFactory.createForClass(PaymentTerm);
applyCommonIndex(PaymentTermSchema);

// ============================================================
// DEPRECIATION METHOD — replaces DEPRECIATION_METHODS. Same reasoning
// as PaymentTerm — no in-use delete guard (Asset schema doesn't exist yet).
// ============================================================
export type DepreciationMethodDocument = DepreciationMethod & Document;

@Schema({ timestamps: true, collection: 'depreciation_methods' })
export class DepreciationMethod {
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) code: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 0 }) order: number;
}
export const DepreciationMethodSchema = SchemaFactory.createForClass(DepreciationMethod);
applyCommonIndex(DepreciationMethodSchema);
