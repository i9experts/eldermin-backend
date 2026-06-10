import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import {
  Vendor, VendorSchema,
  PurchaseRequest, PurchaseRequestSchema,
  PurchaseOrder, PurchaseOrderSchema,
  GRN, GRNSchema,
  InventoryItem, InventoryItemSchema,
} from './procurement.schema';

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
