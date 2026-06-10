import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { Vendor, VendorSchema } from './schemas/vendor.schema';
import { PurchaseOrder, PurchaseOrderSchema } from './schemas/purchase-order.schema';
import { InventoryItem, InventoryItemSchema } from './schemas/inventory-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vendor.name, schema: VendorSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: InventoryItem.name, schema: InventoryItemSchema },
    ]),
  ],
  controllers: [ProcurementController],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
