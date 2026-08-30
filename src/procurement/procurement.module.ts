import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementSettingsService } from './procurement-settings.service';
import { ProcurementReportsController } from './procurement-reports.controller';
import { ProcurementReportsService } from './procurement-reports.service';
import {
  Vendor, VendorSchema,
  PurchaseRequest, PurchaseRequestSchema,
  PurchaseOrder, PurchaseOrderSchema,
  GRN, GRNSchema,
  InventoryItem, InventoryItemSchema,
} from './procurement.schema';
import { Asset, AssetSchema } from './asset.schema';
import {
  VendorCategory, VendorCategorySchema,
  ItemCategory, ItemCategorySchema,
  AssetCategory, AssetCategorySchema,
  UnitOfMeasure, UnitOfMeasureSchema,
  PaymentTerm, PaymentTermSchema,
  DepreciationMethod, DepreciationMethodSchema,
} from './procurement-settings.schema';
import { ScheduledReport, ScheduledReportSchema } from './procurement-reports.schema';
// Read-only cross-module reads — same precedent PdfModule already
// establishes for Invoice/Payment/Expense/BankAccount (see pdf.module.ts).
// Never written to from this module.
import { Budget, BudgetSchema } from '../finance/schemas/finance.schema';
import { Campus, CampusSchema } from '../organization/schemas/organization.schema';
import { PdfModule } from '../pdf/pdf.module';
import { EmailModule } from '../email/email.module';

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
      { name: Asset.name, schema: AssetSchema },
      { name: VendorCategory.name, schema: VendorCategorySchema },
      { name: ItemCategory.name, schema: ItemCategorySchema },
      { name: AssetCategory.name, schema: AssetCategorySchema },
      { name: UnitOfMeasure.name, schema: UnitOfMeasureSchema },
      { name: PaymentTerm.name, schema: PaymentTermSchema },
      { name: DepreciationMethod.name, schema: DepreciationMethodSchema },
      { name: ScheduledReport.name, schema: ScheduledReportSchema },
      { name: Budget.name, schema: BudgetSchema },
      { name: Campus.name, schema: CampusSchema },
    ]),
    PdfModule,
    EmailModule,
  ],
  controllers: [ProcurementController, ProcurementReportsController],
  providers: [ProcurementService, ProcurementSettingsService, ProcurementReportsService],
  exports: [ProcurementService, ProcurementSettingsService, ProcurementReportsService],
})
export class ProcurementModule {}
