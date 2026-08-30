// ============================================================
// ASSET — fixed-asset register (desktops, projectors, furniture, vehicles,
// etc.), replacing the frontend's hardcoded INIT_ASSETS mock data (see
// procurement/index.tsx's AssetsTab, previously `useState<Asset[]>
// (INIT_ASSETS)` — every "Register Asset"/"Edit"/"Delete" only mutated
// local React state, nothing persisted, every school saw the same 11 fake
// rows). Field set matches the frontend's Asset interface in
// procurement/types.ts exactly — see that file for the source of truth.
//
// Keyed on `schoolSlug: string`, same tenancy convention as every other
// schema in this module (Vendor, PurchaseRequest, InventoryItem, …) — not
// tenantId/institutionId ObjectIds.
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';
import { formatAssetTag } from './asset-tag.util';

export type AssetDocument = Asset & Document;

@Schema({ timestamps: true, collection: 'assets' })
export class Asset {
  // Uniqueness is enforced by the compound (schoolSlug, tag) index below,
  // not here — tag alone is only unique per tenant, matching how it's
  // generated (see the pre('validate') hook, same pattern as
  // PurchaseRequest.prNumber in procurement.schema.ts).
  @Prop({ required: true }) tag: string;            // AST-2025-0001
  @Prop({ required: true }) name: string;
  // Plain string, matched by name against AssetCategory.name for the
  // delete-in-use guard — same "match by the value currently stored"
  // convention as Vendor.category / InventoryItem.category.
  @Prop({ required: true }) category: string;
  // Real Campus _id — replaces the frontend's old free-text CAMPUSES pick
  // list (same root-cause fix as RequisitionModal's campusId). Optional:
  // an asset not yet assigned to a specific campus (e.g. still in central
  // stores) is a legitimate state.
  @Prop() campusId: string;
  @Prop() location: string;                          // free text: room/block within the campus
  @Prop() purchaseDate: Date;
  @Prop({ default: 0 }) price: number;
  // Real Vendor _id — replaces the frontend's old INIT_VENDORS-derived
  // vendorNames list (VendorsTab already reads real vendors; AssetModal
  // didn't). Optional: an asset's original vendor isn't always known/kept.
  @Prop() vendorId: string;
  @Prop() warranty: Date;                             // warranty expiry date
  @Prop({ default: 0 }) usefulLife: number;           // years
  // Plain string matched against DepreciationMethod.name — no in-use
  // delete guard for that collection (pre-existing, unchanged convention).
  @Prop() depreciation: string;
  @Prop({
    enum: ['Excellent', 'Good', 'Fair', 'Poor'],
    default: 'Good',
  })
  condition: string;
  @Prop() assignedTo: string;                         // free text: person/department
  @Prop({
    enum: ['Active', 'Maintenance', 'Warranty Expired', 'Disposed'],
    default: 'Active',
  })
  status: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
AssetSchema.index({ schoolSlug: 1, status: 1 });
AssetSchema.index({ schoolSlug: 1, category: 1 });
AssetSchema.index({ schoolSlug: 1, campusId: 1 });
AssetSchema.index({ schoolSlug: 1, tag: 1 }, { unique: true });
AssetSchema.pre('validate', async function () {
  if (this.isNew && !this.tag) {
    const y = new Date().getFullYear();
    const Model = this.constructor as Model<AssetDocument>;
    // Sequential per (school, year) — same countDocuments()-then-increment
    // pattern PurchaseRequest.prNumber uses (see procurement.schema.ts).
    // Not perfectly race-proof under concurrent creates (no atomic counter
    // document), same caveat that pattern shares elsewhere in this module.
    const count = await Model.countDocuments({
      schoolSlug: this.schoolSlug,
      tag: { $regex: `^AST-${y}-` },
    });
    this.tag = formatAssetTag(y, count + 1);
  }
});
