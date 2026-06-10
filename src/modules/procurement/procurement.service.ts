import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Vendor, VendorDocument } from './schemas/vendor.schema';
import { PurchaseOrder, PurchaseOrderDocument } from './schemas/purchase-order.schema';
import { InventoryItem, InventoryItemDocument } from './schemas/inventory-item.schema';

@Injectable()
export class ProcurementService {
  constructor(
    @InjectModel(Vendor.name) private vendorModel: Model<VendorDocument>,
    @InjectModel(PurchaseOrder.name) private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(InventoryItem.name) private itemModel: Model<InventoryItemDocument>,
  ) {}

  private tid(t: string) { return new Types.ObjectId(t); }

  async getDashboardStats(tenantId: string) {
    const tid = this.tid(tenantId);
    const [totalVendors, activeVendors, openPOs, totalPOValue, lowStockItems] = await Promise.all([
      this.vendorModel.countDocuments({ tenantId: tid }),
      this.vendorModel.countDocuments({ tenantId: tid, status: 'approved' }),
      this.poModel.countDocuments({ tenantId: tid, status: { $in: ['approved','sent_to_vendor','partially_received'] } }),
      this.poModel.aggregate([{ $match: { tenantId: tid, status: { $nin: ['cancelled','draft'] } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      this.itemModel.countDocuments({ tenantId: tid, $expr: { $lte: ['$totalStock', '$reorderPoint'] } }),
    ]);
    return { totalVendors, activeVendors, openPOs, totalPOValue: totalPOValue[0]?.total || 0, lowStockItems };
  }

  async getVendors(tenantId: string) {
    return this.vendorModel.find({ tenantId: this.tid(tenantId), isActive: true }).sort({ name: 1 }).lean();
  }
  async createVendor(tenantId: string, institutionId: string, data: any) {
    const count = await this.vendorModel.countDocuments({ tenantId: this.tid(tenantId) });
    const vendorCode = `VEN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    return this.vendorModel.create({ ...data, vendorCode, tenantId: this.tid(tenantId), institutionId: new Types.ObjectId(institutionId) });
  }
  async updateVendor(tenantId: string, id: string, data: any) {
    return this.vendorModel.findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: data }, { new: true }).lean();
  }
  async approveVendor(tenantId: string, id: string) {
    return this.vendorModel.findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: { status: 'approved' } }, { new: true }).lean();
  }

  async getPurchaseOrders(tenantId: string) {
    return this.poModel.find({ tenantId: this.tid(tenantId) }).sort({ createdAt: -1 }).limit(100).lean();
  }
  async createPurchaseOrder(tenantId: string, institutionId: string, data: any) {
    const count = await this.poModel.countDocuments({ tenantId: this.tid(tenantId) });
    const poNo = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    return this.poModel.create({ ...data, poNo, tenantId: this.tid(tenantId), institutionId: new Types.ObjectId(institutionId) });
  }
  async updatePOStatus(tenantId: string, id: string, status: string) {
    return this.poModel.findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: { status } }, { new: true }).lean();
  }

  async getInventoryItems(tenantId: string) {
    return this.itemModel.find({ tenantId: this.tid(tenantId), isActive: true }).sort({ name: 1 }).lean();
  }
  async createInventoryItem(tenantId: string, institutionId: string, data: any) {
    const count = await this.itemModel.countDocuments({ tenantId: this.tid(tenantId) });
    const itemCode = `ITM-${String(count + 1).padStart(4, '0')}`;
    return this.itemModel.create({ ...data, itemCode, tenantId: this.tid(tenantId), institutionId: new Types.ObjectId(institutionId) });
  }
  async updateInventoryItem(tenantId: string, id: string, data: any) {
    return this.itemModel.findOneAndUpdate({ _id: id, tenantId: this.tid(tenantId) }, { $set: data }, { new: true }).lean();
  }
  async getLowStockItems(tenantId: string) {
    return this.itemModel.find({ tenantId: this.tid(tenantId), $expr: { $lte: ['$totalStock', '$reorderPoint'] } }).lean();
  }
}
