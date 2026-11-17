import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Vendor, VendorDocument,
  PurchaseRequest, PurchaseRequestDocument,
  PurchaseOrder, PurchaseOrderDocument,
  GRN, GRNDocument,
  InventoryItem, InventoryItemDocument,
} from './procurement.schema';
import { Asset, AssetDocument } from './asset.schema';
import { resolveCampusScope, ScopedUser } from '../auth/scope.util';

const paged = (p = 1, l = 20) => ({ skip: (p - 1) * l, limit: l });

// ============================================================
// PROCUREMENT SERVICE
// ============================================================
@Injectable()
export class ProcurementService {
  constructor(
    @InjectModel(Vendor.name) private vendorModel: Model<VendorDocument>,
    @InjectModel(PurchaseRequest.name) private prModel: Model<PurchaseRequestDocument>,
    @InjectModel(PurchaseOrder.name) private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(GRN.name) private grnModel: Model<GRNDocument>,
    @InjectModel(InventoryItem.name) private inventoryModel: Model<InventoryItemDocument>,
    @InjectModel(Asset.name) private assetModel: Model<AssetDocument>,
  ) {}

  // ── DASHBOARD ─────────────────────────────────────────────
  async getDashboard(schoolSlug: string, academicYear?: string) {
    const base: any = { schoolSlug };
    if (academicYear) base.academicYear = academicYear;

    const [
      totalVendors, activeVendors,
      totalPRs, pendingPRs, approvedPRs,
      totalPOs, activePOs, completedPOs,
      totalSpend, pendingPayments,
      lowStockItems, outOfStockItems,
      recentPRs, recentPOs,
      spendByCategory, vendorPerformance,
    ] = await Promise.all([
      this.vendorModel.countDocuments({ schoolSlug }),
      this.vendorModel.countDocuments({ schoolSlug, status: 'active' }),

      this.prModel.countDocuments(base),
      this.prModel.countDocuments({ ...base, status: { $in: ['submitted', 'under_review'] } }),
      this.prModel.countDocuments({ ...base, status: 'approved' }),

      this.poModel.countDocuments(base),
      this.poModel.countDocuments({ ...base, status: { $in: ['sent', 'acknowledged', 'partially_received'] } }),
      this.poModel.countDocuments({ ...base, status: 'fully_received' }),

      this.poModel.aggregate([
        { $match: base },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.poModel.aggregate([
        { $match: { ...base, isPaid: false, status: { $in: ['fully_received', 'invoiced'] } } },
        { $group: { _id: null, total: { $sum: '$balanceDue' } } },
      ]),

      this.inventoryModel.countDocuments({ schoolSlug, status: 'low_stock' }),
      this.inventoryModel.countDocuments({ schoolSlug, status: 'out_of_stock' }),

      this.prModel.find(base).sort({ createdAt: -1 }).limit(5)
        .select('prNumber title status priority createdAt requestedBy estimatedTotal'),
      this.poModel.find(base).sort({ createdAt: -1 }).limit(5)
        .select('poNumber title vendorName status totalAmount orderDate'),

      this.poModel.aggregate([
        { $match: base },
        { $group: { _id: '$category', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 8 },
      ]),

      this.vendorModel.find({ schoolSlug, status: 'active' })
        .sort({ totalPurchased: -1 }).limit(5)
        .select('name category rating totalPurchased outstandingBalance'),
    ]);

    return {
      stats: {
        totalVendors, activeVendors,
        totalPRs, pendingPRs, approvedPRs,
        totalPOs, activePOs, completedPOs,
        totalSpend: totalSpend[0]?.total || 0,
        pendingPayments: pendingPayments[0]?.total || 0,
        lowStockItems, outOfStockItems,
      },
      recentPRs, recentPOs,
      spendByCategory,
      vendorPerformance,
    };
  }

  // ── VENDORS ───────────────────────────────────────────────
  async createVendor(data: any) {
    // Auto-generate code
    const count = await this.vendorModel.countDocuments({ schoolSlug: data.schoolSlug });
    data.code = `VND-${String(count + 1).padStart(3, '0')}`;
    const vendor = new this.vendorModel(data);
    return vendor.save();
  }

  async getVendors(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, search, status, category } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { contactPerson: { $regex: search, $options: 'i' } },
      { city: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.vendorModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      this.vendorModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getVendorById(id: string, schoolSlug: string) {
    const vendor = await this.vendorModel.findOne({ _id: id, schoolSlug });
    if (!vendor) throw new NotFoundException('Vendor not found');
    // Get POs for this vendor
    const orders = await this.poModel.find({ vendorId: new Types.ObjectId(id), schoolSlug })
      .sort({ createdAt: -1 }).limit(10)
      .select('poNumber totalAmount status orderDate');
    return { vendor, orders };
  }

  async updateVendor(id: string, schoolSlug: string, data: any) {
    const v = await this.vendorModel.findOneAndUpdate({ _id: id, schoolSlug }, { $set: data }, { new: true });
    if (!v) throw new NotFoundException('Vendor not found');
    return v;
  }

  async rateVendor(id: string, schoolSlug: string, rating: number) {
    return this.vendorModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { rating } }, { new: true },
    );
  }

  // ── PURCHASE REQUESTS ─────────────────────────────────────
  async createPR(data: any) {
    const total = (data.items || []).reduce((a: number, i: any) =>
      a + ((i.estimatedUnitPrice || 0) * (i.quantity || 0)), 0);
    const pr = new this.prModel({ ...data, estimatedTotal: total });
    return pr.save();
  }

  async getPRs(schoolSlug: string, query: any, requestingUser?: ScopedUser) {
    const { page = 1, limit = 20, status, priority, category, search, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    const effectiveCampusId = requestingUser ? resolveCampusScope(requestingUser, campusId) : campusId;
    if (effectiveCampusId) filter.campusId = effectiveCampusId;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (search) filter.$or = [
      { prNumber: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { requestedBy: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.prModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.prModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getPRById(id: string, schoolSlug: string) {
    const pr = await this.prModel.findOne({ _id: id, schoolSlug });
    if (!pr) throw new NotFoundException('Purchase Request not found');
    return pr;
  }

  async updatePR(id: string, schoolSlug: string, data: any) {
    // Only draft PRs are editable — once submitted, a PR is awaiting
    // approval and its content shouldn't shift out from under the approver.
    // There is no "return to draft" transition anywhere in this service, so
    // an edit past draft is simply rejected rather than inventing one.
    const existing = await this.prModel.findOne({ _id: id, schoolSlug });
    if (!existing) throw new NotFoundException('Purchase Request not found');
    if (existing.status !== 'draft') {
      throw new BadRequestException(
        'Cannot edit a requisition that has already been submitted for approval — contact an approver to have it returned to draft.',
      );
    }
    // prNumber is server-generated on create and never regenerated after —
    // strip it out of updates so an edit can't accidentally overwrite it
    // (same pattern updateAsset uses for tag).
    const { prNumber, ...rest } = data;
    if (rest.items) {
      rest.estimatedTotal = (rest.items || []).reduce((a: number, i: any) =>
        a + ((i.estimatedUnitPrice || 0) * (i.quantity || 0)), 0);
    }
    const pr = await this.prModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: rest }, { new: true },
    );
    if (!pr) throw new NotFoundException('Purchase Request not found');
    return pr;
  }

  async submitPR(id: string, schoolSlug: string) {
    return this.prModel.findOneAndUpdate(
      { _id: id, schoolSlug, status: 'draft' },
      { $set: { status: 'submitted' } },
      { new: true },
    );
  }

  async approvePR(id: string, schoolSlug: string, approvedBy: string, notes?: string) {
    const pr = await this.prModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'approved', approvedBy, approvedAt: new Date(), approvalNotes: notes } },
      { new: true },
    );
    if (!pr) throw new NotFoundException('PR not found');
    return pr;
  }

  async rejectPR(id: string, schoolSlug: string, rejectedBy: string, reason: string) {
    return this.prModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'rejected', rejectedBy, rejectionReason: reason } },
      { new: true },
    );
  }

  // ── PURCHASE ORDERS ───────────────────────────────────────
  async createPO(data: any) {
    // Calculate totals
    const items = (data.items || []).map((i: any) => {
      const gross = (i.quantity || 0) * (i.unitPrice || 0);
      const disc = gross * ((i.discount || 0) / 100);
      const net = gross - disc;
      const tax = net * ((i.taxRate || 0) / 100);
      return { ...i, netAmount: net + tax };
    });

    const subtotal = items.reduce((a: number, i: any) => a + (i.quantity * i.unitPrice), 0);
    const totalDiscount = items.reduce((a: number, i: any) => {
      const gross = i.quantity * i.unitPrice;
      return a + (gross * ((i.discount || 0) / 100));
    }, 0);
    const totalTax = items.reduce((a: number, i: any) => {
      const net = (i.quantity * i.unitPrice) - ((i.quantity * i.unitPrice) * ((i.discount || 0) / 100));
      return a + (net * ((i.taxRate || 0) / 100));
    }, 0);
    const totalAmount = subtotal - totalDiscount + totalTax;

    const po = new this.poModel({
      ...data, items,
      subtotal, totalDiscount, totalTax,
      totalAmount, balanceDue: totalAmount,
      orderDate: new Date(),
    });
    const saved = await po.save();

    // Update PR status if linked
    if (data.purchaseRequestId) {
      await this.prModel.findByIdAndUpdate(data.purchaseRequestId, {
        $set: { status: 'po_raised', purchaseOrderId: saved._id },
      });
    }

    // Update vendor total purchased
    if (data.vendorId) {
      await this.vendorModel.findByIdAndUpdate(data.vendorId, {
        $inc: { totalPurchased: totalAmount, outstandingBalance: totalAmount },
      });
    }

    return saved;
  }

  async getPOs(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, vendorId, search } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (vendorId) filter.vendorId = new Types.ObjectId(vendorId);
    if (search) filter.$or = [
      { poNumber: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { vendorName: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.poModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.poModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getPOById(id: string, schoolSlug: string) {
    const po = await this.poModel.findOne({ _id: id, schoolSlug });
    if (!po) throw new NotFoundException('PO not found');
    const grns = await this.grnModel.find({ purchaseOrderId: new Types.ObjectId(id), schoolSlug });
    return { po, grns };
  }

  // Full edit of a PO's own fields (vendor, items, dates, terms, etc.) - the
  // "Edit" modal's save. Mirrors updatePR's "only before it's locked in by a
  // workflow step" guard: once goods have started arriving or money has
  // moved, the order's content shouldn't shift out from under that record.
  // approvedBy/approvedAt/paidAmount/balanceDue/isPaid/paidDate/
  // paymentReference/status/cancelledBy/cancelledAt/cancellationReason are
  // all server-owned (set only by approvePO/cancelPO/recordPayment) and
  // stripped here so an edit can never accidentally touch them.
  async updatePO(id: string, schoolSlug: string, data: any) {
    const existing = await this.poModel.findOne({ _id: id, schoolSlug });
    if (!existing) throw new NotFoundException('PO not found');
    if (['partially_received', 'fully_received', 'invoiced', 'paid', 'cancelled'].includes(existing.status)) {
      throw new BadRequestException(
        `Cannot edit a purchase order that is already ${existing.status.replace(/_/g, ' ')} — reverse/cancel it and raise a new one instead.`,
      );
    }
    const {
      poNumber, status, approvedBy, approvedAt, paidAmount, balanceDue, isPaid,
      paidDate, paymentReference, cancelledBy, cancelledAt, cancellationReason,
      ...rest
    } = data;

    if (rest.items) {
      const items = rest.items.map((i: any) => {
        const gross = (i.quantity || 0) * (i.unitPrice || 0);
        const disc = gross * ((i.discount || 0) / 100);
        const net = gross - disc;
        const tax = net * ((i.taxRate || 0) / 100);
        return { ...i, netAmount: net + tax };
      });
      rest.items = items;
      rest.subtotal = items.reduce((a: number, i: any) => a + (i.quantity * i.unitPrice), 0);
      rest.totalDiscount = items.reduce((a: number, i: any) => {
        const gross = i.quantity * i.unitPrice;
        return a + (gross * ((i.discount || 0) / 100));
      }, 0);
      rest.totalTax = items.reduce((a: number, i: any) => {
        const net = (i.quantity * i.unitPrice) - ((i.quantity * i.unitPrice) * ((i.discount || 0) / 100));
        return a + (net * ((i.taxRate || 0) / 100));
      }, 0);
      rest.totalAmount = rest.subtotal - rest.totalDiscount + rest.totalTax;
      rest.balanceDue = rest.totalAmount - (existing.paidAmount || 0);
    }

    const po = await this.poModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: rest }, { new: true, runValidators: true },
    );
    if (!po) throw new NotFoundException('PO not found');
    return po;
  }

  async approvePO(id: string, schoolSlug: string, approvedBy: string) {
    const existing = await this.poModel.findOne({ _id: id, schoolSlug });
    if (!existing) throw new NotFoundException('PO not found');
    if (existing.status !== 'draft') {
      throw new BadRequestException(`Only a draft purchase order can be approved (current status: ${existing.status.replace(/_/g, ' ')}).`);
    }
    return this.poModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'approved', approvedBy, approvedAt: new Date() } },
      { new: true, runValidators: true },
    );
  }

  // "Reverse PO" - voids an order before any goods/money have actually
  // moved. Rolls back the vendor totalPurchased/outstandingBalance bump
  // createPO applied (safe to fully reverse here, since the guard below
  // only allows this before any payment was ever recorded). Refuses once
  // anything has been received or paid — that's a real transaction, not a
  // mistake to quietly undo; it needs an actual return/credit note flow.
  async cancelPO(id: string, schoolSlug: string, cancelledBy: string, reason?: string) {
    const existing = await this.poModel.findOne({ _id: id, schoolSlug });
    if (!existing) throw new NotFoundException('PO not found');
    if (existing.status === 'cancelled') {
      throw new BadRequestException('This purchase order is already cancelled.');
    }
    if (['partially_received', 'fully_received', 'invoiced', 'paid'].includes(existing.status)) {
      throw new BadRequestException(
        `Cannot reverse a purchase order that has already ${existing.status === 'paid' ? 'been paid' : 'received goods'} — this needs a return/credit note, not a cancellation.`,
      );
    }
    if (existing.vendorId) {
      await this.vendorModel.findByIdAndUpdate(existing.vendorId, {
        $inc: { totalPurchased: -existing.totalAmount, outstandingBalance: -existing.balanceDue },
      });
    }
    return this.poModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { status: 'cancelled', cancelledBy, cancelledAt: new Date(), cancellationReason: reason } },
      { new: true, runValidators: true },
    );
  }

  async updatePOStatus(id: string, schoolSlug: string, status: string) {
    const existing = await this.poModel.findOne({ _id: id, schoolSlug });
    if (!existing) throw new NotFoundException('PO not found');
    if (['cancelled', 'paid'].includes(existing.status)) {
      throw new BadRequestException(`Cannot change the status of a purchase order that is already ${existing.status}.`);
    }
    return this.poModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { status } }, { new: true, runValidators: true },
    );
  }

  async recordPayment(id: string, schoolSlug: string, paymentData: any) {
    const po = await this.poModel.findOne({ _id: id, schoolSlug });
    if (!po) throw new NotFoundException('PO not found');
    const newPaid = (po.paidAmount || 0) + paymentData.amount;
    const newBalance = po.totalAmount - newPaid;
    const isPaid = newBalance <= 0;
    const updated = await this.poModel.findByIdAndUpdate(id, {
      $set: {
        paidAmount: newPaid, balanceDue: Math.max(0, newBalance),
        isPaid, status: isPaid ? 'paid' : po.status,
        paidDate: isPaid ? new Date() : undefined,
        paymentReference: paymentData.reference,
        paymentMethod: paymentData.method,
      },
    }, { new: true });
    // Update vendor outstanding
    if (po.vendorId) {
      await this.vendorModel.findByIdAndUpdate(po.vendorId, {
        $inc: { outstandingBalance: -paymentData.amount },
      });
    }
    return updated;
  }

  // ── GRN ──────────────────────────────────────────────────
  // Applies (sign=1) or reverses (sign=-1) a GRN's items against the PO's
  // per-line receivedQuantity/status and against inventory currentStock -
  // shared by createGRN and updateGRN (an edit reverses the GRN's old items
  // then re-applies its new ones, the same "void and recreate" shape a
  // real reversal would take, so received-quantity/stock figures never
  // double-count or go stale after an edit).
  private async applyGRNItemsToPO(purchaseOrderId: any, items: any[], sign: 1 | -1) {
    if (!purchaseOrderId) return;
    const po = await this.poModel.findById(purchaseOrderId);
    if (!po) return;

    for (const grnItem of items || []) {
      const poItem = po.items.find((pi: any) => pi.itemName === grnItem.itemName);
      if (poItem) {
        (poItem as any).receivedQuantity = Math.max(
          0, ((poItem as any).receivedQuantity || 0) + sign * (grnItem.receivedQuantity || 0),
        );
      }
    }

    let allReceived = po.items.length > 0;
    let anyReceived = false;
    for (const poItem of po.items) {
      if (((poItem as any).receivedQuantity || 0) < poItem.quantity) allReceived = false;
      if (((poItem as any).receivedQuantity || 0) > 0) anyReceived = true;
    }
    // Reversing (sign -1) a fully/partially received PO back to "nothing
    // received yet" returns it to acknowledged, not left claiming a receipt
    // status it no longer has evidence for.
    const newStatus = allReceived ? 'fully_received'
      : anyReceived ? 'partially_received'
      : (['fully_received', 'partially_received'].includes(po.status) ? 'acknowledged' : po.status);

    await this.poModel.findByIdAndUpdate(purchaseOrderId, {
      $set: { status: newStatus, items: po.items, ...(sign > 0 ? { deliveredDate: new Date() } : {}) },
    });

    for (const grnItem of items || []) {
      if (grnItem.inventoryItemId && grnItem.receivedQuantity > 0) {
        await this.inventoryModel.findByIdAndUpdate(grnItem.inventoryItemId, {
          $inc: { currentStock: sign * grnItem.receivedQuantity },
          ...(sign > 0 ? { $set: { lastRestockedDate: new Date(), status: 'in_stock' } } : {}),
        });
      }
    }
  }

  async createGRN(data: any) {
    const grn = new this.grnModel({
      ...data, receivedDate: new Date(data.receivedDate || Date.now()),
    });
    const saved = await grn.save();
    await this.applyGRNItemsToPO(data.purchaseOrderId, data.items, 1);
    return saved;
  }

  async updateGRN(id: string, schoolSlug: string, data: any) {
    const existing = await this.grnModel.findOne({ _id: id, schoolSlug });
    if (!existing) throw new NotFoundException('GRN not found');
    if (existing.verified) {
      throw new BadRequestException('Cannot edit a GRN that has already been verified — it has already fed into verified stock/PO records.');
    }
    // grnNumber is server-generated and never regenerated; verified/
    // verifiedBy/verifiedAt are only ever set by verifyGRN.
    const { grnNumber, verified, verifiedBy, verifiedAt, ...rest } = data;

    if (rest.items) {
      // Reverse the old item effect, then apply the new one - keeps the
      // PO's receivedQuantity and inventory stock accurate after an edit
      // instead of double-counting the original receipt.
      await this.applyGRNItemsToPO(existing.purchaseOrderId, existing.items, -1);
      await this.applyGRNItemsToPO(rest.purchaseOrderId || existing.purchaseOrderId, rest.items, 1);
    }

    const grn = await this.grnModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: rest }, { new: true, runValidators: true },
    );
    if (!grn) throw new NotFoundException('GRN not found');
    return grn;
  }

  async getGRNs(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, verified } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (verified !== undefined) filter.verified = verified === 'true';
    const [data, total] = await Promise.all([
      this.grnModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.grnModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async verifyGRN(id: string, schoolSlug: string, verifiedBy: string) {
    return this.grnModel.findOneAndUpdate(
      { _id: id, schoolSlug },
      { $set: { verified: true, verifiedBy, verifiedAt: new Date() } },
      { new: true },
    );
  }

  // ── INVENTORY ─────────────────────────────────────────────
  async createInventoryItem(data: any) {
    const count = await this.inventoryModel.countDocuments({ schoolSlug: data.schoolSlug });
    data.code = `ITM-${String(count + 1).padStart(3, '0')}`;
    data.totalValue = (data.currentStock || 0) * (data.unitCost || 0);
    const item = new this.inventoryModel(data);
    return item.save();
  }

  async getInventory(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, category, search, lowStock } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (lowStock === 'true') filter.$expr = { $lte: ['$currentStock', '$minimumStock'] };
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.inventoryModel.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      this.inventoryModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit } };
  }

  async updateInventoryItem(id: string, schoolSlug: string, data: any) {
    // code is server-generated on create (see createInventoryItem) and must
    // never be overwritten by an edit — same pattern updateAsset uses for tag.
    const { code, ...rest } = data;
    if (rest.currentStock !== undefined || rest.unitCost !== undefined) {
      const existing = await this.inventoryModel.findOne({ _id: id, schoolSlug });
      if (!existing) throw new NotFoundException('Item not found');
      const currentStock = rest.currentStock !== undefined ? rest.currentStock : existing.currentStock;
      const unitCost = rest.unitCost !== undefined ? rest.unitCost : existing.unitCost;
      rest.totalValue = currentStock * unitCost;
      if (rest.currentStock !== undefined) {
        const minimumStock = rest.minimumStock !== undefined ? rest.minimumStock : existing.minimumStock;
        rest.status = currentStock <= 0 ? 'out_of_stock'
          : currentStock <= (minimumStock || 0) ? 'low_stock' : 'in_stock';
      }
    }
    const item = await this.inventoryModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: rest }, { new: true },
    );
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async deleteInventoryItem(id: string, schoolSlug: string) {
    // Hard delete — catalog/register data, not a financial ledger record.
    // No in-use guard needed: PR/PO/GRN line items carry an optional,
    // loosely-coupled inventoryItemId string, not a real enforced FK.
    const item = await this.inventoryModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!item) throw new NotFoundException('Item not found');
    return { deleted: true };
  }

  async adjustStock(id: string, schoolSlug: string, adjustment: number, reason: string) {
    const item = await this.inventoryModel.findOne({ _id: id, schoolSlug });
    if (!item) throw new NotFoundException('Item not found');
    const newStock = Math.max(0, item.currentStock + adjustment);
    const status = newStock <= 0 ? 'out_of_stock'
      : newStock <= item.minimumStock ? 'low_stock' : 'in_stock';
    return this.inventoryModel.findByIdAndUpdate(id, {
      $set: {
        currentStock: newStock,
        totalValue: newStock * item.unitCost,
        status,
        lastRestockedDate: adjustment > 0 ? new Date() : item.lastRestockedDate,
      },
    }, { new: true });
  }

  async getInventorySummary(schoolSlug: string) {
    const [totalItems, totalValue, lowStock, outOfStock, byCategory] = await Promise.all([
      this.inventoryModel.countDocuments({ schoolSlug }),
      this.inventoryModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: null, total: { $sum: '$totalValue' } } },
      ]),
      this.inventoryModel.countDocuments({ schoolSlug, status: 'low_stock' }),
      this.inventoryModel.countDocuments({ schoolSlug, status: 'out_of_stock' }),
      this.inventoryModel.aggregate([
        { $match: { schoolSlug } },
        { $group: { _id: '$category', count: { $sum: 1 }, value: { $sum: '$totalValue' } } },
        { $sort: { value: -1 } },
      ]),
    ]);
    return {
      totalItems, totalValue: totalValue[0]?.total || 0,
      lowStock, outOfStock, byCategory,
    };
  }

  // ── ASSETS ───────────────────────────────────────────────
  // Real fixed-asset register, replacing the frontend's INIT_ASSETS mock
  // data (see procurement/index.tsx's AssetsTab). tag is auto-generated by
  // AssetSchema's pre('validate') hook (see asset.schema.ts) — never set
  // it from the client.
  async createAsset(data: any) {
    const asset = new this.assetModel(data);
    return asset.save();
  }

  async getAssets(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, search, status, category, campusId } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (campusId) filter.campusId = campusId;
    if (search) filter.$or = [
      { tag: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
      { assignedTo: { $regex: search, $options: 'i' } },
    ];
    const [data, total] = await Promise.all([
      this.assetModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.assetModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getAssetById(id: string, schoolSlug: string) {
    const asset = await this.assetModel.findOne({ _id: id, schoolSlug });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async updateAsset(id: string, schoolSlug: string, data: any) {
    // tag is auto-generated on create and never regenerated after — strip
    // it out of updates so an edit can't accidentally overwrite/blank it.
    const { tag, ...rest } = data;
    const asset = await this.assetModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: rest }, { new: true },
    );
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async deleteAsset(id: string, schoolSlug: string) {
    // Hard delete — catalog/register data, not a financial ledger record
    // needing a reversal trail (same reasoning as Subjects/Timetables/
    // Purchase Requisitions this session, not the reversal pattern
    // financial vouchers use).
    const asset = await this.assetModel.findOneAndDelete({ _id: id, schoolSlug });
    if (!asset) throw new NotFoundException('Asset not found');
    return { deleted: true };
  }
}
