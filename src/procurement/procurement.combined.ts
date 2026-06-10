// ============================================================
// PROCUREMENT — SERVICE + CONTROLLER + MODULE
// Eldermin ERP | NestJS + MongoDB
// ============================================================

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
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  VendorSchema, PurchaseRequestSchema,
  PurchaseOrderSchema, GRNSchema, InventoryItemSchema,
} from './procurement.schema';

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

  async getPRs(schoolSlug: string, query: any) {
    const { page = 1, limit = 20, status, priority, category, search } = query;
    const { skip } = paged(page, limit);
    const filter: any = { schoolSlug };
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

  async updatePOStatus(id: string, schoolSlug: string, status: string) {
    return this.poModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: { status } }, { new: true },
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
  async createGRN(data: any) {
    const grn = new this.grnModel({
      ...data, receivedDate: new Date(data.receivedDate || Date.now()),
    });
    const saved = await grn.save();

    // Update PO received quantities and status
    const po = await this.poModel.findById(data.purchaseOrderId);
    if (po) {
      let allReceived = true;
      let anyReceived = false;

      for (const grnItem of data.items) {
        const poItem = po.items.find((pi: any) => pi.itemName === grnItem.itemName);
        if (poItem) {
          (poItem as any).receivedQuantity = ((poItem as any).receivedQuantity || 0) + grnItem.receivedQuantity;
          if ((poItem as any).receivedQuantity < poItem.quantity) allReceived = false;
          if ((poItem as any).receivedQuantity > 0) anyReceived = true;
        }
      }

      const newStatus = allReceived ? 'fully_received'
        : anyReceived ? 'partially_received' : po.status;

      await this.poModel.findByIdAndUpdate(data.purchaseOrderId, {
        $set: { status: newStatus, items: po.items, deliveredDate: new Date() },
      });

      // Update inventory
      for (const grnItem of data.items) {
        if (grnItem.inventoryItemId && grnItem.receivedQuantity > 0) {
          await this.inventoryModel.findByIdAndUpdate(grnItem.inventoryItemId, {
            $inc: { currentStock: grnItem.receivedQuantity },
            $set: { lastRestockedDate: new Date(), status: 'in_stock' },
          });
        }
      }
    }

    return saved;
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
    // Auto-update status based on stock
    if (data.currentStock !== undefined) {
      data.totalValue = data.currentStock * (data.unitCost || 0);
      data.status = data.currentStock <= 0 ? 'out_of_stock'
        : data.currentStock <= (data.minimumStock || 0) ? 'low_stock' : 'in_stock';
    }
    return this.inventoryModel.findOneAndUpdate(
      { _id: id, schoolSlug }, { $set: data }, { new: true },
    );
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
}

// ============================================================
// PROCUREMENT CONTROLLER
// ============================================================
@Controller('procurement')
export class ProcurementController {
  constructor(private readonly service: ProcurementService) {}

  private ctx(req: any) {
    return {
      schoolSlug: req?.user?.schoolSlug || req?.headers['x-school-slug'] || 'demo-school',
      academicYear: req?.user?.academicYear || req?.headers['x-academic-year'] || '2025-26',
      userName: req?.user?.name || 'Admin',
    };
  }

  // Dashboard
  @Get('dashboard')
  async getDashboard(@Request() req: any, @Query('academicYear') ay?: string) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getDashboard(schoolSlug, ay);
  }

  // Vendors
  @Get('vendors')
  async getVendors(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendors(schoolSlug, query);
  }

  @Get('vendors/:id')
  async getVendor(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getVendorById(id, schoolSlug);
  }

  @Post('vendors')
  @HttpCode(HttpStatus.CREATED)
  async createVendor(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createVendor({ ...dto, schoolSlug });
  }

  @Put('vendors/:id')
  async updateVendor(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateVendor(id, schoolSlug, dto);
  }

  @Patch('vendors/:id/rate')
  async rateVendor(@Param('id') id: string, @Body('rating') rating: number, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.rateVendor(id, schoolSlug, rating);
  }

  // Purchase Requests
  @Get('requests')
  async getPRs(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPRs(schoolSlug, query);
  }

  @Get('requests/:id')
  async getPR(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPRById(id, schoolSlug);
  }

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  async createPR(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createPR({
      ...dto, schoolSlug,
      academicYear: dto.academicYear || academicYear,
      requestedBy: dto.requestedBy || userName,
    });
  }

  @Patch('requests/:id/submit')
  async submitPR(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.submitPR(id, schoolSlug);
  }

  @Patch('requests/:id/approve')
  async approvePR(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.approvePR(id, schoolSlug, dto.approvedBy || userName, dto.notes);
  }

  @Patch('requests/:id/reject')
  async rejectPR(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.rejectPR(id, schoolSlug, dto.rejectedBy || userName, dto.reason);
  }

  // Purchase Orders
  @Get('orders')
  async getPOs(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPOs(schoolSlug, query);
  }

  @Get('orders/:id')
  async getPO(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getPOById(id, schoolSlug);
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  async createPO(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, academicYear, userName } = this.ctx(req);
    return this.service.createPO({
      ...dto, schoolSlug,
      academicYear: dto.academicYear || academicYear,
      createdBy: userName,
    });
  }

  @Patch('orders/:id/status')
  async updatePOStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updatePOStatus(id, schoolSlug, status);
  }

  @Post('orders/:id/payment')
  async recordPayment(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.recordPayment(id, schoolSlug, dto);
  }

  // GRN
  @Get('grn')
  async getGRNs(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getGRNs(schoolSlug, query);
  }

  @Post('grn')
  @HttpCode(HttpStatus.CREATED)
  async createGRN(@Body() dto: any, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.createGRN({ ...dto, schoolSlug, receivedBy: dto.receivedBy || userName });
  }

  @Patch('grn/:id/verify')
  async verifyGRN(@Param('id') id: string, @Request() req: any) {
    const { schoolSlug, userName } = this.ctx(req);
    return this.service.verifyGRN(id, schoolSlug, userName);
  }

  // Inventory
  @Get('inventory')
  async getInventory(@Request() req: any, @Query() query: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getInventory(schoolSlug, query);
  }

  @Get('inventory/summary')
  async getInventorySummary(@Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.getInventorySummary(schoolSlug);
  }

  @Post('inventory')
  @HttpCode(HttpStatus.CREATED)
  async createInventoryItem(@Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.createInventoryItem({ ...dto, schoolSlug });
  }

  @Put('inventory/:id')
  async updateInventoryItem(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.updateInventoryItem(id, schoolSlug, dto);
  }

  @Patch('inventory/:id/adjust')
  async adjustStock(@Param('id') id: string, @Body() dto: { adjustment: number; reason: string }, @Request() req: any) {
    const { schoolSlug } = this.ctx(req);
    return this.service.adjustStock(id, schoolSlug, dto.adjustment, dto.reason);
  }
}

// ============================================================
// PROCUREMENT MODULE
// ============================================================
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vendor.name, schema: VendorSchema },
      { name: PurchaseRequest.name, schema: PurchaseRequestSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: GRN.name, schema: GRNSchema },
      { name: InventoryItem.name, schema: InventoryItemSchema },
    ]),
  ],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
