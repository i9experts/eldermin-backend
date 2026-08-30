import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementSettingsService } from './procurement-settings.service';
import {
  Vendor, VendorSchema,
  PurchaseRequest, PurchaseRequestSchema,
  PurchaseOrder, PurchaseOrderSchema,
  GRN, GRNSchema,
  InventoryItem, InventoryItemSchema,
} from './procurement.schema';
import {
  VendorCategory, VendorCategorySchema,
  ItemCategory, ItemCategorySchema,
  AssetCategory, AssetCategorySchema,
  UnitOfMeasure, UnitOfMeasureSchema,
  PaymentTerm, PaymentTermSchema,
  DepreciationMethod, DepreciationMethodSchema,
} from './procurement-settings.schema';

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
      { name: VendorCategory.name, schema: VendorCategorySchema },
      { name: ItemCategory.name, schema: ItemCategorySchema },
      { name: AssetCategory.name, schema: AssetCategorySchema },
      { name: UnitOfMeasure.name, schema: UnitOfMeasureSchema },
      { name: PaymentTerm.name, schema: PaymentTermSchema },
      { name: DepreciationMethod.name, schema: DepreciationMethodSchema },
    ]),
  ],
  controllers: [ProcurementController],
  providers: [ProcurementService, ProcurementSettingsService],
  exports: [ProcurementService, ProcurementSettingsService],
})
export class ProcurementModule {}
