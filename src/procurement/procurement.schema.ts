// ============================================================
// PROCUREMENT SCHEMAS — Eldermin ERP | NestJS + MongoDB
// ============================================================

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Model, Types } from 'mongoose';
import { formatPrNumber } from './pr-number.util';

// ============================================================
// VENDOR
// ============================================================
export type VendorDocument = Vendor & Document;

@Schema({ _id: false })
class BankDetail {
  @Prop() bankName: string;
  @Prop() accountTitle: string;
  @Prop() accountNumber: string;
  @Prop() iban: string;
}

@Schema({ timestamps: true, collection: 'vendors' })
export class Vendor {
  @Prop({ required: true }) name: string;
  @Prop() code: string;                    // VND-001
  @Prop() category: string;               // Stationery, IT, Furniture, Food, Services
  @Prop() contactPerson: string;
  @Prop() phone: string;
  @Prop() email: string;
  @Prop() address: string;
  @Prop() city: string;
  @Prop() website: string;
  @Prop() taxNumber: string;
  @Prop() registrationNumber: string;
  @Prop({ type: BankDetail }) bank: BankDetail;
  @Prop({
    enum: ['active', 'inactive', 'blacklisted', 'on_hold'],
    default: 'active',
  })
  status: string;
  @Prop({ default: 0, min: 0, max: 5 }) rating: number;
  @Prop() paymentTerms: string;           // Net 30, Advance, COD
  @Prop({ default: 0 }) creditLimit: number;
  @Prop({ default: 0 }) totalPurchased: number;
  @Prop({ default: 0 }) outstandingBalance: number;
  @Prop() notes: string;
  @Prop({ type: [String], default: [] }) tags: string[];
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const VendorSchema = SchemaFactory.createForClass(Vendor);
VendorSchema.index({ schoolSlug: 1, status: 1 });
VendorSchema.index({ schoolSlug: 1, category: 1 });

// ============================================================
// PURCHASE REQUEST (PR)
// ============================================================
export type PurchaseRequestDocument = PurchaseRequest & Document;

@Schema({ _id: true })
class PRLineItem {
  @Prop({ required: true }) itemName: string;
  @Prop() description: string;
  @Prop() unit: string;                   // Pcs, Box, Ream, Kg, Litre
  @Prop({ required: true }) quantity: number;
  @Prop() estimatedUnitPrice: number;
  @Prop() estimatedTotal: number;
  @Prop() specifications: string;
  @Prop() urgency: string;
  @Prop() inventoryItemId: string;       // link to inventory if exists
}
const PRLineItemSchema = SchemaFactory.createForClass(PRLineItem);

@Schema({ timestamps: true, collection: 'purchase_requests' })
export class PurchaseRequest {
  // Uniqueness is enforced by the compound (schoolSlug, prNumber) index below,
  // not here — prNumber alone is only unique per tenant, matching how it's
  // generated (see the pre('validate') hook).
  @Prop({ required: true }) prNumber: string;    // PR-2025-0001
  @Prop({ required: true }) title: string;
  @Prop() description: string;
  @Prop({
    enum: ['stationery', 'it_equipment', 'furniture', 'cleaning',
           'food', 'maintenance', 'books', 'sports', 'medical', 'other'],
    required: true,
  })
  category: string;
  @Prop({ enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: string;
  @Prop() requiredByDate: Date;
  @Prop({ type: [PRLineItemSchema], default: [] }) items: PRLineItem[];
  @Prop({ default: 0 }) estimatedTotal: number;
  @Prop() departmentId: string;
  @Prop() campusId: string;
  @Prop({ required: true }) requestedBy: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) requestedById: Types.ObjectId;
  @Prop({
    enum: ['draft', 'submitted', 'under_review', 'approved',
           'rejected', 'po_raised', 'completed', 'cancelled'],
    default: 'draft',
  })
  status: string;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;
  @Prop() rejectedBy: string;
  @Prop() rejectionReason: string;
  @Prop() approvalNotes: string;
  @Prop({ type: Types.ObjectId, ref: 'PurchaseOrder' }) purchaseOrderId: Types.ObjectId;
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const PurchaseRequestSchema = SchemaFactory.createForClass(PurchaseRequest);
PurchaseRequestSchema.index({ schoolSlug: 1, status: 1 });
PurchaseRequestSchema.index({ schoolSlug: 1, priority: 1 });
PurchaseRequestSchema.index({ schoolSlug: 1, prNumber: 1 }, { unique: true });
PurchaseRequestSchema.pre('validate', async function () {
  if (this.isNew && !this.prNumber) {
    const y = new Date().getFullYear();
    const Model = this.constructor as Model<PurchaseRequestDocument>;
    // Sequential per (school, year) — same countDocuments()-then-increment
    // pattern already used by createVendor/createInventoryItem in
    // ProcurementService, and by student/HR/academics number generators
    // elsewhere in this codebase. Not perfectly race-proof under concurrent
    // creates (no atomic counter document), same caveat those share, but it
    // replaces a random 4-digit draw that could — and, being unique across
    // *all* schools, regularly would — collide and fail the insert.
    const count = await Model.countDocuments({
      schoolSlug: this.schoolSlug,
      prNumber: { $regex: `^PR-${y}-` },
    });
    this.prNumber = formatPrNumber(y, count + 1);
  }
});

// ============================================================
// PURCHASE ORDER (PO)
// ============================================================
export type PurchaseOrderDocument = PurchaseOrder & Document;

@Schema({ _id: true })
class POLineItem {
  @Prop({ required: true }) itemName: string;
  @Prop() description: string;
  @Prop() unit: string;
  @Prop({ required: true }) quantity: number;
  @Prop({ required: true }) unitPrice: number;
  @Prop({ default: 0 }) discount: number;
  @Prop({ default: 0 }) taxRate: number;
  @Prop() netAmount: number;
  @Prop({ default: 0 }) receivedQuantity: number;
  @Prop() inventoryItemId: string;
}
const POLineItemSchema = SchemaFactory.createForClass(POLineItem);

@Schema({ timestamps: true, collection: 'purchase_orders' })
export class PurchaseOrder {
  @Prop({ required: true, unique: true }) poNumber: string;    // PO-2025-0001
  @Prop({ type: Types.ObjectId, ref: 'PurchaseRequest' }) purchaseRequestId: Types.ObjectId;
  @Prop() prNumber: string;
  @Prop({ type: Types.ObjectId, ref: 'Vendor', required: true }) vendorId: Types.ObjectId;
  @Prop({ required: true }) vendorName: string;

  @Prop({ required: true }) title: string;
  @Prop() description: string;
  @Prop() category: string;
  // Real Campus _id (see AssetSchema/PurchaseRequestSchema's campusId) — was
  // missing entirely, so the old hardcoded-string Campus <select> in the
  // frontend's POModal had nowhere real to persist to.
  @Prop() campusId: string;

  @Prop({ type: [POLineItemSchema], default: [] }) items: POLineItem[];

  @Prop({ default: 0 }) subtotal: number;
  @Prop({ default: 0 }) totalDiscount: number;
  @Prop({ default: 0 }) totalTax: number;
  @Prop({ default: 0 }) totalAmount: number;
  @Prop({ default: 0 }) paidAmount: number;
  @Prop({ default: 0 }) balanceDue: number;

  @Prop({
    enum: ['draft', 'sent', 'acknowledged', 'partially_received',
           'fully_received', 'invoiced', 'paid', 'cancelled', 'disputed'],
    default: 'draft',
  })
  status: string;

  @Prop() orderDate: Date;
  @Prop() expectedDeliveryDate: Date;
  @Prop() deliveredDate: Date;
  @Prop() deliveryAddress: string;

  @Prop() paymentTerms: string;
  @Prop() paymentMethod: string;
  @Prop({ default: false }) isPaid: boolean;
  @Prop() paidDate: Date;
  @Prop() paymentReference: string;

  // Approval
  @Prop() createdBy: string;
  @Prop() approvedBy: string;
  @Prop() approvedAt: Date;

  // Vendor invoice
  @Prop() vendorInvoiceNumber: string;
  @Prop() vendorInvoiceDate: Date;

  @Prop() notes: string;
  @Prop() termsAndConditions: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
  @Prop({ required: true }) academicYear: string;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
PurchaseOrderSchema.index({ schoolSlug: 1, status: 1 });
PurchaseOrderSchema.index({ schoolSlug: 1, vendorId: 1 });
PurchaseOrderSchema.pre('validate', function () {
  if (this.isNew && !this.poNumber) {
    const y = new Date().getFullYear();
    const r = Math.floor(1000 + Math.random() * 9000);
    this.poNumber = `PO-${y}-${r}`;
  }
});

// ============================================================
// GOODS RECEIPT NOTE (GRN)
// ============================================================
export type GRNDocument = GRN & Document;

@Schema({ _id: true })
class GRNItem {
  @Prop({ required: true }) itemName: string;
  @Prop() unit: string;
  @Prop({ required: true }) orderedQuantity: number;
  @Prop({ required: true }) receivedQuantity: number;
  @Prop({ default: 0 }) rejectedQuantity: number;
  @Prop() rejectionReason: string;
  @Prop({ enum: ['good', 'damaged', 'partial', 'wrong_item'], default: 'good' }) condition: string;
  @Prop() batchNumber: string;
  @Prop() expiryDate: Date;
  @Prop() inventoryItemId: string;
}
const GRNItemSchema = SchemaFactory.createForClass(GRNItem);

@Schema({ timestamps: true, collection: 'grn' })
export class GRN {
  @Prop({ required: true, unique: true }) grnNumber: string;    // GRN-2025-0001
  @Prop({ type: Types.ObjectId, ref: 'PurchaseOrder', required: true }) purchaseOrderId: Types.ObjectId;
  @Prop({ required: true }) poNumber: string;
  @Prop({ required: true }) vendorName: string;
  @Prop({ type: [GRNItemSchema], default: [] }) items: GRNItem[];
  @Prop({ required: true }) receivedDate: Date;
  @Prop() deliveryNote: string;
  @Prop() receivedBy: string;
  @Prop() verifiedBy: string;
  @Prop({ default: false }) verified: boolean;
  @Prop() verifiedAt: Date;
  @Prop({ enum: ['full', 'partial', 'rejected'], default: 'full' }) receiptType: string;
  @Prop() storageLocation: string;
  @Prop() notes: string;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const GRNSchema = SchemaFactory.createForClass(GRN);
GRNSchema.index({ schoolSlug: 1, purchaseOrderId: 1 });
GRNSchema.pre('validate', function () {
  if (this.isNew && !this.grnNumber) {
    const y = new Date().getFullYear();
    const r = Math.floor(1000 + Math.random() * 9000);
    this.grnNumber = `GRN-${y}-${r}`;
  }
});

// ============================================================
// INVENTORY ITEM
// ============================================================
export type InventoryItemDocument = InventoryItem & Document;

@Schema({ timestamps: true, collection: 'inventory' })
export class InventoryItem {
  @Prop({ required: true }) name: string;
  @Prop() code: string;                    // ITM-001
  @Prop() description: string;
  @Prop({ required: true }) category: string;
  @Prop() unit: string;
  @Prop({ default: 0 }) currentStock: number;
  @Prop({ default: 0 }) minimumStock: number;    // reorder point
  @Prop({ default: 0 }) maximumStock: number;
  @Prop({ default: 0 }) reorderQuantity: number;
  @Prop({ default: 0 }) unitCost: number;        // last purchase price
  @Prop({ default: 0 }) totalValue: number;      // currentStock × unitCost
  @Prop() storageLocation: string;
  @Prop() supplier: string;
  @Prop() lastPurchaseDate: Date;
  @Prop() lastRestockedDate: Date;
  @Prop({
    enum: ['in_stock', 'low_stock', 'out_of_stock', 'discontinued'],
    default: 'in_stock',
  })
  status: string;
  @Prop({ default: false }) isConsumable: boolean;
  @Prop({ required: true, index: true }) schoolSlug: string;
}

export const InventoryItemSchema = SchemaFactory.createForClass(InventoryItem);
InventoryItemSchema.index({ schoolSlug: 1, status: 1 });
InventoryItemSchema.index({ schoolSlug: 1, category: 1 });
