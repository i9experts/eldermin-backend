import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  VendorCategory, VendorCategoryDocument,
  ItemCategory, ItemCategoryDocument,
  AssetCategory, AssetCategoryDocument,
  UnitOfMeasure, UnitOfMeasureDocument,
  PaymentTerm, PaymentTermDocument,
  DepreciationMethod, DepreciationMethodDocument,
} from './procurement-settings.schema';
import { Vendor, VendorDocument, InventoryItem, InventoryItemDocument } from './procurement.schema';
import { Asset, AssetDocument } from './asset.schema';
import {
  buildVendorCategoryInUseMessage,
  buildItemCategoryInUseMessage,
  buildAssetCategoryInUseMessage,
} from './procurement-settings-reference.util';

// ============================================================
// PROCUREMENT SETTINGS SERVICE — school-configurable master data behind
// the Master Settings tab (Vendor/Item/Asset categories, Units of
// Measure, Payment Terms, Depreciation Methods). Split out of
// ProcurementService to keep that file focused on transactional
// PR/PO/GRN/inventory flows — same {schoolSlug, name, code, isActive,
// order} CRUD + idempotent upsert-by-code seed pattern as
// AcademicsService's getSubjectCategories/.../seedDefaultSubjectCategories,
// but keyed on schoolSlug (string) rather than tenantId (ObjectId) to
// match every other schema in this module.
// ============================================================
@Injectable()
export class ProcurementSettingsService {
  constructor(
    @InjectModel(VendorCategory.name) private vendorCategoryModel: Model<VendorCategoryDocument>,
    @InjectModel(ItemCategory.name) private itemCategoryModel: Model<ItemCategoryDocument>,
    @InjectModel(AssetCategory.name) private assetCategoryModel: Model<AssetCategoryDocument>,
    @InjectModel(UnitOfMeasure.name) private uomModel: Model<UnitOfMeasureDocument>,
    @InjectModel(PaymentTerm.name) private paymentTermModel: Model<PaymentTermDocument>,
    @InjectModel(DepreciationMethod.name) private depreciationMethodModel: Model<DepreciationMethodDocument>,
    @InjectModel(Vendor.name) private vendorModel: Model<VendorDocument>,
    @InjectModel(InventoryItem.name) private inventoryModel: Model<InventoryItemDocument>,
    @InjectModel(Asset.name) private assetModel: Model<AssetDocument>,
  ) {}

  // ── generic list/create/update helpers (shared shape across all six) ──
  private async list(model: Model<any>, schoolSlug: string, query: any = {}) {
    const filter: any = { schoolSlug };
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive !== 'false';
    } else if (query.includeInactive !== 'true') {
      filter.isActive = true;
    }
    return model.find(filter).sort({ order: 1, name: 1 }).lean();
  }

  private async create(model: Model<any>, schoolSlug: string, data: any) {
    try {
      return await model.create({ ...data, schoolSlug });
    } catch (e: any) {
      if (e?.code === 11000) throw new BadRequestException('A record with this code already exists');
      throw new BadRequestException(e.message);
    }
  }

  private async update(model: Model<any>, schoolSlug: string, id: string, data: any, notFoundMsg: string) {
    const doc = await model.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true }).lean();
    if (!doc) throw new NotFoundException(notFoundMsg);
    return doc;
  }

  // ── VENDOR CATEGORIES ─────────────────────────────────────
  getVendorCategories(schoolSlug: string, query?: any) {
    return this.list(this.vendorCategoryModel, schoolSlug, query);
  }
  createVendorCategory(schoolSlug: string, data: any) {
    return this.create(this.vendorCategoryModel, schoolSlug, data);
  }
  updateVendorCategory(schoolSlug: string, id: string, data: any) {
    return this.update(this.vendorCategoryModel, schoolSlug, id, data, 'Vendor category not found');
  }
  async deleteVendorCategory(schoolSlug: string, id: string) {
    const category = await this.vendorCategoryModel.findOne({ _id: id, schoolSlug }).lean();
    if (!category) throw new NotFoundException('Vendor category not found');
    const vendorCount = await this.vendorModel.countDocuments({ schoolSlug, category: category.name });
    if (vendorCount > 0) throw new BadRequestException(buildVendorCategoryInUseMessage(vendorCount));
    await this.vendorCategoryModel.deleteOne({ _id: id, schoolSlug });
    return { deleted: true };
  }

  // ── ITEM CATEGORIES ───────────────────────────────────────
  getItemCategories(schoolSlug: string, query?: any) {
    return this.list(this.itemCategoryModel, schoolSlug, query);
  }
  createItemCategory(schoolSlug: string, data: any) {
    return this.create(this.itemCategoryModel, schoolSlug, data);
  }
  updateItemCategory(schoolSlug: string, id: string, data: any) {
    return this.update(this.itemCategoryModel, schoolSlug, id, data, 'Item category not found');
  }
  async deleteItemCategory(schoolSlug: string, id: string) {
    const category = await this.itemCategoryModel.findOne({ _id: id, schoolSlug }).lean();
    if (!category) throw new NotFoundException('Item category not found');
    const itemCount = await this.inventoryModel.countDocuments({ schoolSlug, category: category.name });
    if (itemCount > 0) throw new BadRequestException(buildItemCategoryInUseMessage(itemCount));
    await this.itemCategoryModel.deleteOne({ _id: id, schoolSlug });
    return { deleted: true };
  }

  // ── ASSET CATEGORIES ──────────────────────────────────────
  // Real Asset collection now exists (see asset.schema.ts) — deleteAssetCategory
  // guards the same way deleteVendorCategory/deleteItemCategory do, matching
  // by the category name currently stored on Asset.category. See the class
  // comment in procurement-settings.schema.ts.
  getAssetCategories(schoolSlug: string, query?: any) {
    return this.list(this.assetCategoryModel, schoolSlug, query);
  }
  createAssetCategory(schoolSlug: string, data: any) {
    return this.create(this.assetCategoryModel, schoolSlug, data);
  }
  updateAssetCategory(schoolSlug: string, id: string, data: any) {
    return this.update(this.assetCategoryModel, schoolSlug, id, data, 'Asset category not found');
  }
  async deleteAssetCategory(schoolSlug: string, id: string) {
    const category = await this.assetCategoryModel.findOne({ _id: id, schoolSlug }).lean();
    if (!category) throw new NotFoundException('Asset category not found');
    const assetCount = await this.assetModel.countDocuments({ schoolSlug, category: category.name });
    if (assetCount > 0) throw new BadRequestException(buildAssetCategoryInUseMessage(assetCount));
    await this.assetCategoryModel.deleteOne({ _id: id, schoolSlug });
    return { deleted: true };
  }

  // ── UNITS OF MEASURE ──────────────────────────────────────
  // Used inline as a free string on Vendor/InventoryItem/PR-line-item
  // state, not stored as a formal FK anywhere, so an in-use delete guard
  // isn't feasible — deactivation (isActive: false via update) is the
  // safe alternative, same asymmetry noted for Payment Terms and
  // Depreciation Methods below.
  getUnitsOfMeasure(schoolSlug: string, query?: any) {
    return this.list(this.uomModel, schoolSlug, query);
  }
  createUnitOfMeasure(schoolSlug: string, data: any) {
    return this.create(this.uomModel, schoolSlug, data);
  }
  updateUnitOfMeasure(schoolSlug: string, id: string, data: any) {
    return this.update(this.uomModel, schoolSlug, id, data, 'Unit of measure not found');
  }
  async deleteUnitOfMeasure(schoolSlug: string, id: string) {
    const doc = await this.uomModel.findOneAndDelete({ _id: id, schoolSlug }).lean();
    if (!doc) throw new NotFoundException('Unit of measure not found');
    return { deleted: true };
  }

  // ── PAYMENT TERMS ─────────────────────────────────────────
  getPaymentTerms(schoolSlug: string, query?: any) {
    return this.list(this.paymentTermModel, schoolSlug, query);
  }
  createPaymentTerm(schoolSlug: string, data: any) {
    return this.create(this.paymentTermModel, schoolSlug, data);
  }
  updatePaymentTerm(schoolSlug: string, id: string, data: any) {
    return this.update(this.paymentTermModel, schoolSlug, id, data, 'Payment term not found');
  }
  async deletePaymentTerm(schoolSlug: string, id: string) {
    const doc = await this.paymentTermModel.findOneAndDelete({ _id: id, schoolSlug }).lean();
    if (!doc) throw new NotFoundException('Payment term not found');
    return { deleted: true };
  }

  // ── DEPRECIATION METHODS ──────────────────────────────────
  getDepreciationMethods(schoolSlug: string, query?: any) {
    return this.list(this.depreciationMethodModel, schoolSlug, query);
  }
  createDepreciationMethod(schoolSlug: string, data: any) {
    return this.create(this.depreciationMethodModel, schoolSlug, data);
  }
  updateDepreciationMethod(schoolSlug: string, id: string, data: any) {
    return this.update(this.depreciationMethodModel, schoolSlug, id, data, 'Depreciation method not found');
  }
  async deleteDepreciationMethod(schoolSlug: string, id: string) {
    const doc = await this.depreciationMethodModel.findOneAndDelete({ _id: id, schoolSlug }).lean();
    if (!doc) throw new NotFoundException('Depreciation method not found');
    return { deleted: true };
  }

  // ── SEED DEFAULTS ──────────────────────────────────────────
  /**
   * POST /procurement/settings/seed-defaults — idempotently seeds all six
   * lists at once from the values that used to be hardcoded in the
   * frontend's procurement/types.ts (VENDOR_CATS, ITEM_CATS, ASSET_CATS,
   * UOM_OPTIONS, PAYMENT_TERMS_LIST, DEPRECIATION_METHODS) as each
   * school's starting, editable/extensible lists. Upsert-by-(schoolSlug,
   * code), same pattern as seedDefaultSubjectCategories — safe to call
   * more than once (e.g. auto-triggered by the frontend on first load of
   * an empty section); running it again just refreshes the seeded copies
   * rather than duplicating them.
   */
  async seedDefaults(schoolSlug: string) {
    const upsertAll = async (model: Model<any>, defaults: { name: string; code: string; order: number }[], extra: Record<string, any> = {}) => {
      const names: string[] = [];
      for (const d of defaults) {
        const result = await model.findOneAndUpdate(
          { schoolSlug, code: d.code },
          { $set: { ...d, ...extra, schoolSlug, isActive: true } },
          { upsert: true, new: true },
        );
        names.push(result!.name);
      }
      return names;
    };

    const toDefaults = (values: string[]) =>
      values.map((name, i) => ({ name, code: slugifyCode(name), order: i + 1 }));

    const vendorCategories = await upsertAll(this.vendorCategoryModel, toDefaults(VENDOR_CATS_DEFAULTS));
    const itemCategories = await upsertAll(this.itemCategoryModel, toDefaults(ITEM_CATS_DEFAULTS));
    const assetCategories = await upsertAll(this.assetCategoryModel, toDefaults(ASSET_CATS_DEFAULTS));
    const unitsOfMeasure = await upsertAll(
      this.uomModel,
      UOM_OPTIONS_DEFAULTS.map((name, i) => ({ name, code: slugifyCode(name), order: i + 1, shortCode: UOM_SHORT_CODES[name] })),
    );
    const paymentTerms = await upsertAll(this.paymentTermModel, toDefaults(PAYMENT_TERMS_DEFAULTS));
    const depreciationMethods = await upsertAll(this.depreciationMethodModel, toDefaults(DEPRECIATION_METHODS_DEFAULTS));

    return {
      message: 'Procurement master settings seeded',
      counts: {
        vendorCategories: vendorCategories.length,
        itemCategories: itemCategories.length,
        assetCategories: assetCategories.length,
        unitsOfMeasure: unitsOfMeasure.length,
        paymentTerms: paymentTerms.length,
        depreciationMethods: depreciationMethods.length,
      },
    };
  }
}

// Starting values — exactly the arrays that used to be hardcoded in the
// frontend's procurement/types.ts (VENDOR_CATS / ITEM_CATS / ASSET_CATS /
// UOM_OPTIONS / PAYMENT_TERMS_LIST / DEPRECIATION_METHODS).
const VENDOR_CATS_DEFAULTS = ['IT Equipment', 'Stationery', 'Lab Equipment', 'Books & Curriculum', 'Furniture', 'Electrical', 'Maintenance', 'Catering'];
const ITEM_CATS_DEFAULTS = ['Stationery', 'IT Consumables', 'IT Equipment', 'Lab Supplies', 'Furniture', 'Cleaning Supplies', 'Office Supplies'];
const ASSET_CATS_DEFAULTS = ['IT Equipment', 'AV Equipment', 'Printing', 'Electrical', 'Security', 'Furniture', 'Lab Equipment', 'Transportation'];
const UOM_OPTIONS_DEFAULTS = ['Piece', 'Box', 'Ream', 'Set', 'Kit', 'Liter', 'Meter', 'Pack', 'Bundle'];
const UOM_SHORT_CODES: Record<string, string> = {
  Piece: 'Pcs', Box: 'Box', Ream: 'Rm', Set: 'Set', Kit: 'Kit',
  Liter: 'Ltr', Meter: 'Mtr', Pack: 'Pk', Bundle: 'Bdl',
};
const PAYMENT_TERMS_DEFAULTS = ['Net 30', 'Net 60', 'Net 90', 'Immediate', '50% Advance'];
const DEPRECIATION_METHODS_DEFAULTS = ['Straight Line', 'Declining Balance', 'Units of Production'];

function slugifyCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
